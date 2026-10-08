import { isAdmin } from '@/lib/admin';
import { db,safeWrite } from '@/lib/portal-db';
import { members } from '@/lib/portal';
const fail=(error:string,status=400)=>Response.json({error},{status});
export async function PATCH(request:Request) {
  if(!isAdmin(request)||!safeWrite(request))return fail('Admin access required.',403);
  try {
    const body=await request.json() as Record<string,unknown>;
    const s=await db().prepare('SELECT season,active_week AS activeWeek,deadline_label AS deadlineLabel FROM portal_settings WHERE id=1').first<{season:string;activeWeek:number;deadlineLabel:string}>();
    if(!s)return fail('League settings unavailable.',503);
    if(body.action==='saveTicket') {
      const season=String(body.season||s.season),week=Number(body.week??s.activeWeek),odds=Number(body.combinedOdds),wager=Number(body.wager),payout=Number(body.potentialPayout);
      if(!Number.isInteger(week)||!Number.isInteger(odds)||Math.abs(odds)<100||!Number.isFinite(wager)||wager<=0||!Number.isFinite(payout)||payout<=0)return fail('Check the official odds, wager, and potential payout.');
      await db().prepare(`INSERT INTO weekly_tickets (id,season,week,combined_odds,wager,potential_payout,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(season,week) DO UPDATE SET combined_odds=excluded.combined_odds,wager=excluded.wager,potential_payout=excluded.potential_payout,updated_at=excluded.updated_at`).bind(`${season}|${week}`,season,week,odds,wager,payout,new Date().toISOString()).run();
      return Response.json({ok:true});
    }
    if(body.action==='finalizeAndAdvance') {
      if(body.season!==s.season||Number(body.week)!==s.activeWeek)return fail('The active week changed. Refresh before finalizing.',409);
      const picks=(await db().prepare('SELECT id,member,status,revision FROM submissions WHERE season=? AND week=?').bind(s.season,s.activeWeek).all()).results;
      if(!picks.length)return fail('There are no picks to finalize.');
      if(picks.some(x=>x.status==='Pending'))return fail('Resolve every pending pick before finalizing.');
      const missing=members.filter(m=>!picks.some(p=>p.member===m));
      if(missing.length&&body.reviewedMissing!==true)return fail('Review the missing members before finalizing.');
      const penalties=Array.isArray(body.missedMembers)?[...new Set(body.missedMembers.map(String))]:[];
      if(penalties.some(m=>!missing.includes(m)))return fail('Only missing members can receive a missed-submission loss.');
      const ticket=await db().prepare('SELECT id FROM weekly_tickets WHERE season=? AND week=?').bind(s.season,s.activeWeek).first();
      if(!ticket&&body.reviewedTicket!==true)return fail('Confirm that official ticket details are unavailable, or add them first.');
      const version=picks.reduce((n,p)=>n+Number(p.revision),0);
      if(Number(body.reviewVersion)!==version||Number(body.reviewCount)!==picks.length)return fail('Results changed since review. Refresh and review again.',409);
      const id=`${s.season}|${s.activeWeek}`,now=new Date().toISOString();
      const results=await db().batch([
        db().prepare(`INSERT INTO weekly_cycles (id,season,week,pick_count,finalized_at)
          SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM submissions WHERE season=? AND week=? AND status='Pending')
          AND (SELECT COALESCE(SUM(revision),0) FROM submissions WHERE season=? AND week=?)=?
          AND (SELECT COUNT(*) FROM submissions WHERE season=? AND week=?)=?
          AND EXISTS (SELECT 1 FROM portal_settings WHERE id=1 AND season=? AND active_week=?)`).bind(id,s.season,s.activeWeek,picks.length,now,s.season,s.activeWeek,s.season,s.activeWeek,version,s.season,s.activeWeek,picks.length,s.season,s.activeWeek),
        ...penalties.map(m=>db().prepare(`INSERT INTO missed_submissions (id,season,week,member,reason,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM weekly_cycles WHERE id=? AND finalized_at=?)`).bind(`${id}|${m}`,s.season,s.activeWeek,m,'No submission — commissioner-assigned loss',now,id,now)),
        db().prepare(`UPDATE portal_settings SET active_week=active_week+1,submissions_open=1 WHERE season=? AND active_week=? AND EXISTS (SELECT 1 FROM weekly_cycles WHERE id=? AND finalized_at=?)`).bind(s.season,s.activeWeek,id,now),
      ]);
      if(!results[0].meta.changes)return fail('The week changed while finalizing. Refresh and review again.',409);
      return Response.json({ok:true,nextWeek:s.activeWeek+1});
    }
    const season=String(body.season||'').trim(),week=Number(body.activeWeek),label=String(body.deadlineLabel||'').trim();
    if(!season||!Number.isInteger(week)||week<0||week>30||!label)return fail('Check the season, week, and target submission time.');
    await db().prepare('UPDATE portal_settings SET season=?,active_week=?,submissions_open=?,deadline_label=? WHERE id=1').bind(season,week,body.submissionsOpen?1:0,label).run();
    return Response.json({ok:true});
  }catch(error){console.error('portal_settings_failed');return fail(error instanceof Error&&/UNIQUE/.test(error.message)?'This week was already finalized. Refresh the board.':'The change could not be confirmed. Refresh before retrying.',409);}
}
