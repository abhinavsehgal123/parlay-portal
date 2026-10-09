import { env } from 'cloudflare:workers';
import { isAdmin } from '@/lib/admin';
import { db, decode, pickColumns, safeWrite } from '@/lib/portal-db';
import { kickSync, queueStatement } from '@/lib/sheet-sync';
import { members, markets, selectionText, type Details, type Pick } from '@/lib/portal';
const fail=(error:string,status=400)=>Response.json({error},{status});
const settings=()=>db().prepare('SELECT season,active_week AS activeWeek,submissions_open AS submissionsOpen,deadline_label AS deadlineLabel FROM portal_settings WHERE id=1').first<{season:string;activeWeek:number;submissionsOpen:number;deadlineLabel:string}>();
function audit(id:string,before:Partial<Pick>,after:Partial<Pick>,actor:string,action:string,reason:string,conditional=false) {
  const p=after.id?after:before;
  return db().prepare(`INSERT INTO pick_changes (id,submission_id,season,week,member,actor,action,before_json,after_json,reason,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? ${conditional?'WHERE changes() = 1':''}`)
    .bind(id,p.id,p.season,p.week,p.member,actor,action,JSON.stringify(before),JSON.stringify(after),reason,new Date().toISOString());
}
function validate(body:Record<string,unknown>,legacy=false) {
  const sport=String(body.sport||'').trim(),odds=Number(body.odds),raw=body.details as Details|undefined;
  const details:Details=raw?Object.fromEntries(['team','opponent','market','line','eventDate','description'].map(k=>[k,String(raw[k as keyof Details]||'').trim().slice(0,200)])):{};
  // When the pick was filled from the FanDuel odds browser, keep when those odds were fetched.
  const feedAt=raw?String(raw.feedAt||'').trim():'';if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(feedAt))details.feedAt=feedAt;
  if (!sport || sport.length>80 || !Number.isInteger(odds) || Math.abs(odds)<100 || Math.abs(odds)>1000000) throw Error('Enter a sport and valid American odds, such as −110 or +150.');
  if (!legacy || details.market) {
    if (!details.team || !details.opponent || !markets.includes(details.market||'') || !/^\d{4}-\d{2}-\d{2}$/.test(details.eventDate||'')) throw Error('Choose a market and enter the team/player, opponent, and event date.');
    if (details.market==='Spread' && !/^[+-]\d+(\.\d+)?$/.test(details.line||'')) throw Error('Include the spread sign, for example -2.5 or +3.');
    if (['Game total','Player prop','Other'].includes(details.market||'') && !details.description) throw Error('Describe the market, including over/under and the statistic.');
    if (['Game total','Player prop'].includes(details.market||'') && !details.line) throw Error('Enter the total or prop threshold.');
  }
  const selection=details.market?selectionText(details):String(body.selection||'').trim();
  if(selection.length<3 || selection.length>650) throw Error('Enter a clear selection.');
  return {sport,odds,details,selection};
}
export async function GET(request:Request) {
  try {
    const s=await settings(); if(!s)return fail('League settings are unavailable. Please retry.',503);
    const admin=isAdmin(request);
    const [p,c,f,t,m,q]=await Promise.all([
      db().prepare(`SELECT ${pickColumns} FROM submissions ORDER BY season DESC,week DESC,created_at`).all(),
      db().prepare('SELECT id,submission_id AS submissionId,season,week,member,actor,action,before_json,after_json,reason,created_at AS createdAt FROM pick_changes ORDER BY created_at DESC').all(),
      db().prepare('SELECT season,week,pick_count AS pickCount,finalized_at AS finalizedAt FROM weekly_cycles ORDER BY season DESC,week DESC').all(),
      db().prepare('SELECT season,week,combined_odds AS combinedOdds,wager,potential_payout AS potentialPayout FROM weekly_tickets').all(),
      db().prepare('SELECT season,week,member,reason FROM missed_submissions').all(),
      admin?db().prepare('SELECT id,attempts,error,payload FROM sheet_outbox ORDER BY created_at').all():Promise.resolve({results:[]}),
    ]);
    const history=p.results.map(decode);
    kickSync();
    return Response.json({settings:{...s,submissionsOpen:Boolean(s.submissionsOpen)},isAdmin:admin,submissions:history.filter(x=>x.season===s.season&&x.week===s.activeWeek),historySubmissions:history,
      changes:c.results.map(x=>({...x,before:JSON.parse(String(x.before_json)),after:JSON.parse(String(x.after_json)),before_json:undefined,after_json:undefined})),finalizations:f.results,tickets:t.results,missedSubmissions:m.results,
      ...(admin?{sync:{configured:Boolean(env.PORTAL_SHEET_WEBHOOK_URL&&env.PORTAL_SHEET_SECRET),pending:q.results.length,failed:q.results.filter(x=>Number(x.attempts)>0).length,items:q.results.map(x=>({id:x.id,attempts:x.attempts,error:x.error,member:JSON.parse(String(x.payload)).member||'Removed pick'}))}}:{})},{headers:{'Cache-Control':'no-store'}});
  }catch{console.error('portal_read_failed');return fail('The board could not load. Please retry; saved picks are unchanged.',503);}
}
export async function POST(request:Request) {
  if(!safeWrite(request))return fail('Invalid request origin.',403);
  try {
    const body=await request.json() as Record<string,unknown>,s=await settings();if(!s)return fail('League settings unavailable.',503);
    if(body.season!==s.season||Number(body.week)!==s.activeWeek)return fail('The week changed. Refresh before submitting.',409);
    const member=String(body.member||'');if(!members.includes(member))return fail('Choose your name.');
    const fields=validate(body),key=`${s.season}|${s.activeWeek}|${fields.selection.toLowerCase().replace(/\s+/g,' ')}`;
    const existing=await db().prepare(`SELECT ${pickColumns} FROM submissions WHERE season=? AND week=? AND member=?`).bind(s.season,s.activeWeek,member).first();
    if(existing){if(existing.selection===fields.selection&&Number(existing.odds)===fields.odds&&existing.sport===fields.sport)return Response.json({...decode(existing),alreadySaved:true});return fail(`${member} already has a pick. Use Edit on their card to replace it.`,409);}
    if(!s.submissionsOpen)return fail('Submissions are manually closed. Ask the commissioner to reopen them.',403);
    if(await db().prepare('SELECT id FROM submissions WHERE duplicate_key=?').bind(key).first())return fail('That selection is already on the board.',409);
    const now=new Date().toISOString(),id=crypto.randomUUID(),changeId=crypto.randomUUID();
    const pick:Pick={id,season:s.season,week:s.activeWeek,member,...fields,status:'Pending',createdAt:now,updatedAt:now,revision:0,evidence:{}};
    const saved=await db().batch([db().prepare(`INSERT INTO submissions (id,season,week,member,sport,selection,odds,status,duplicate_key,created_at,updated_at,details,evidence,revision)
      SELECT ?,?,?,?,?,?,?,'Pending',?,?,?,?,'{}',0
      WHERE EXISTS (SELECT 1 FROM portal_settings WHERE id=1 AND season=? AND active_week=? AND submissions_open=1)
      AND NOT EXISTS (SELECT 1 FROM weekly_cycles WHERE season=? AND week=?)
      AND NOT EXISTS (SELECT 1 FROM submissions WHERE duplicate_key=?)`)
      .bind(id,s.season,s.activeWeek,member,fields.sport,fields.selection,fields.odds,key,now,now,JSON.stringify(fields.details),s.season,s.activeWeek,s.season,s.activeWeek,key),audit(changeId,{},pick,`${member} (honor system)`,'Submitted','',true),queueStatement(id,pick,changeId,changeId)]);
    if(!saved[0].meta.changes)return fail('The board changed before your pick saved. Refresh and review before retrying.',409);
    kickSync();return Response.json(pick,{status:201});
  }catch(error){if(error instanceof Error&&/UNIQUE/.test(error.message))return fail('A pick was just submitted. Refresh before trying again.',409);if(error instanceof Error&&/^(Enter|Choose|Include|Describe)/.test(error.message))return fail(error.message);console.error('portal_submit_failed');return fail('We could not confirm the save. Check the board before retrying. Your form is kept.',503);}
}
async function mutate(request:Request,action:'edit'|'grade'|'remove') {
  if(!safeWrite(request))return fail('Invalid request origin.',403);
  try {
    const admin=isAdmin(request),body=await request.json() as Record<string,unknown>;
    if(action!=='edit'&&!admin)return fail('Admin access required.',403);
    const row=await db().prepare(`SELECT ${pickColumns} FROM submissions WHERE id=?`).bind(String(body.id||'')).first();if(!row)return fail('This pick no longer exists. Refresh the board.',404);
    const before=decode(row) as Pick;
    if(Number(body.revision)!==before.revision)return fail('This pick changed while you were editing. Close and reopen it to review the latest version.',409);
    if(!admin){const s=await settings();if(body.member!==before.member||body.confirmOwnPick!==true)return fail('Confirm that you are changing your own pick.',403);if(s?.season!==before.season||s.activeWeek!==before.week||before.status!=='Pending')return fail('Only current, ungraded picks can be edited by members. Ask the commissioner for a correction.',403);}
    const reason=String(body.reason||'').trim().slice(0,1000);if(admin&&!reason)return fail('Add a short reason or result note for the change history.');
    const now=new Date().toISOString(),changeId=crypto.randomUUID();let after:Pick={...before,revision:before.revision+1,updatedAt:now};let statement:D1PreparedStatement;
    if(action==='edit'){
      const fields=validate(body,!before.details.market),key=`${before.season}|${before.week}|${fields.selection.toLowerCase().replace(/\s+/g,' ')}`;
      if(await db().prepare('SELECT id FROM submissions WHERE duplicate_key=? AND id!=?').bind(key,before.id).first())return fail('That selection is already on the board.',409);
      after={...after,...fields,status:'Pending',evidence:{}};
      statement=db().prepare(`UPDATE submissions SET sport=?,selection=?,odds=?,details=?,duplicate_key=?,status='Pending',evidence='{}',revision=revision+1,updated_at=? WHERE id=? AND revision=?
        AND NOT EXISTS (SELECT 1 FROM submissions other WHERE other.duplicate_key=? AND other.id!=submissions.id)
        ${admin?'':`AND status='Pending' AND EXISTS (SELECT 1 FROM portal_settings WHERE id=1 AND season=submissions.season AND active_week=submissions.week) AND NOT EXISTS (SELECT 1 FROM weekly_cycles WHERE season=submissions.season AND week=submissions.week)`}`)
        .bind(fields.sport,fields.selection,fields.odds,JSON.stringify(fields.details),key,now,before.id,before.revision,key);
    }else if(action==='grade'){
      const status=String(body.status);if(!['Pending','Hit','Miss','Push','Void'].includes(status))return fail('Choose a valid result.');const source=String(body.source||'').trim();if(source&&!/^https?:\/\//i.test(source))return fail('Use a full http or https evidence link.');
      after={...after,status:status as Pick['status'],evidence:{result:String(body.result||'').slice(0,1000),source:source.slice(0,2000),reason,gradedAt:now}};
      statement=db().prepare('UPDATE submissions SET status=?,evidence=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(status,JSON.stringify(after.evidence),now,before.id,before.revision);
    }else statement=db().prepare('DELETE FROM submissions WHERE id=? AND revision=?').bind(before.id,before.revision);
    const payload=action==='remove'?{action:'deleteSubmission',id:before.id,member:before.member}:after;
    const results=await db().batch([statement,audit(changeId,before,action==='remove'?{}:after,admin?'Commissioner':`${before.member} (honor system)`,action,reason,true),queueStatement(before.id,payload,changeId,changeId)]);
    if(!results[0].meta.changes)return fail('Another change was saved first. Refresh and try again.',409);
    kickSync();return Response.json({ok:true,pick:action==='remove'?null:after});
  }catch(error){if(error instanceof Error&&/^(Enter|Choose|Include|Describe)/.test(error.message))return fail(error.message);console.error('portal_update_failed');return fail('The change could not be confirmed. Refresh before retrying.',503);}
}
export const PUT=(r:Request)=>mutate(r,'edit');
export const PATCH=(r:Request)=>mutate(r,'grade');
export const DELETE=(r:Request)=>mutate(r,'remove');
