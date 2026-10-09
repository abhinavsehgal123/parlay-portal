'use client';
import { Fragment,useState } from 'react';
import { ChevronDown,Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatOdds,statusLabel,type Board,type Pick,type Status } from '@/lib/portal';

// Picks are shown as a printed parlay ticket: a row per leg, grouped by game
// day, with members who have not picked yet listed last. Tapping a row opens
// its details. Lost legs are struck through, the way people cross them out.
const time=(s:string)=>s?new Date(s).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET':'';
const shortStatus:Record<Status,string>={Pending:'Pending',Hit:'Win',Miss:'Loss',Push:'Push',Void:'Void'};
const dayLabel=(d?:string)=>{
  if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d))return 'Date not set';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'});
};
export const bigOdds=(n:number)=>`${n>0?'+':''}${n.toLocaleString('en-US')}`;
export function Stamp({status}:{status:Status}){return <span className={`stamp stamp-${status.toLowerCase()}`}>{shortStatus[status]}</span>;}

// Wraps each search term found in the text in <mark>.
export function Highlight({text,terms}:{text:string;terms:string[]}) {
  if(!terms.length)return <>{text}</>;
  const pattern=new RegExp(`(${terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`,'gi');
  return <>{text.split(pattern).map((part,i)=>i%2?<mark key={i}>{part}</mark>:<Fragment key={i}>{part}</Fragment>)}</>;
}

export function groupByDay(picks:Pick[]) {
  const sorted=[...picks].sort((a,b)=>(a.details.eventDate||'9999').localeCompare(b.details.eventDate||'9999')||a.createdAt.localeCompare(b.createdAt));
  const groups:{day:string;picks:Pick[]}[]=[];
  for(const p of sorted){const day=dayLabel(p.details.eventDate);const g=groups.find(x=>x.day===day);if(g)g.picks.push(p);else groups.push({day,picks:[p]});}
  return groups;
}

export type LegActions={onEdit:(p:Pick)=>void;onGrade:(p:Pick)=>void;onRemove:(p:Pick)=>void};

function Leg({pick,board,archived,open,terms,onToggle,onEdit,onGrade,onRemove}:LegActions&{pick:Pick;board:Board;archived:boolean;open:boolean;terms:string[];onToggle:()=>void}) {
  const changes=board.changes.filter(c=>c.submissionId===pick.id);
  const d=pick.details,panel=`leg-${pick.id}`;
  return <li className={`leg leg-${pick.status.toLowerCase()}`}>
    <button type="button" className="leg-summary" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
      <span className="leg-member"><Highlight text={pick.member} terms={terms}/></span>
      <span className="leg-status"><Stamp status={pick.status}/></span>
      <span className="leg-pick"><Highlight text={pick.selection} terms={terms}/></span>
      <span className="leg-odds">{formatOdds(pick.odds)}</span>
      <span className="leg-meta"><Highlight text={`${pick.sport}${d.market?`, ${d.market.toLowerCase()}`:''}`} terms={terms}/></span>
      <ChevronDown aria-hidden="true" className={`leg-caret ${open?'rotate-180':''}`}/>
    </button>
    {open&&<div id={panel} className="leg-detail">
      <dl className="leg-facts">
        {d.opponent&&<><dt>Matchup</dt><dd>{d.team} vs {d.opponent}</dd></>}
        {d.line&&<><dt>Line</dt><dd>{d.line}</dd></>}
        {d.description&&<><dt>Market</dt><dd>{d.description}</dd></>}
        {d.eventDate&&<><dt>Game day</dt><dd>{dayLabel(d.eventDate)}</dd></>}
        <dt>FanDuel odds</dt><dd className="tabular-nums">{formatOdds(pick.odds)}</dd>
        <dt>Result</dt><dd>{statusLabel(pick.status)}</dd>
        {pick.evidence.result&&<><dt>Final</dt><dd>{pick.evidence.result}</dd></>}
        {pick.evidence.reason&&<><dt>Note</dt><dd>{pick.evidence.reason}</dd></>}
      </dl>
      {pick.evidence.source&&/^https?:\/\//i.test(pick.evidence.source)&&<a className="mt-2 inline-block text-sm font-semibold underline" href={pick.evidence.source} target="_blank" rel="noreferrer">Result source</a>}
      <p className="leg-note">Submitted {time(pick.createdAt)}{pick.revision>0?`, updated ${time(pick.updatedAt)}`:''}{d.feedAt?`. Line filled from FanDuel feed, ${time(d.feedAt)}`:''}</p>
      <div className="mt-3 flex flex-wrap gap-2">{(board.isAdmin||(!archived&&pick.status==='Pending'))&&<Button variant="outline" onClick={()=>onEdit(pick)}><Pencil className="size-4"/>{board.isAdmin?'Edit pick':'Edit my pick'}</Button>}{board.isAdmin&&<><Button variant="outline" onClick={()=>onGrade(pick)}>Record result</Button><Button variant="ghost" className="text-[var(--loss)]" onClick={()=>onRemove(pick)}>Remove</Button></>}</div>
      {changes.length>0&&<details className="leg-history"><summary>Change history ({changes.length})</summary><ol>{changes.map(c=><li key={c.id}><p className="font-semibold">{c.action} by {c.actor}</p><p className="text-xs text-[var(--ink-2)]">{time(c.createdAt)}</p>{c.before.selection&&<p>Before: {c.before.selection}, {formatOdds(c.before.odds!)}, {statusLabel(c.before.status!)}</p>}{c.after.selection&&<p>After: {c.after.selection}, {formatOdds(c.after.odds!)}, {statusLabel(c.after.status!)}</p>}{c.reason&&<p>{c.reason}</p>}</li>)}</ol></details>}
    </div>}
  </li>;
}

export function Slip({picks,missing=[],board,archived=false,terms=[],onEdit,onGrade,onRemove}:LegActions&{picks:Pick[];missing?:string[];board:Board;archived?:boolean;terms?:string[]}) {
  const [open,setOpen]=useState<string|null>(null);
  return <div className="slip">
    {groupByDay(picks).map(g=><section key={g.day} aria-label={g.day}>
      <h3 className="slip-day">{g.day}</h3>
      <ul>{g.picks.map(p=><Leg key={p.id} pick={p} board={board} archived={archived} terms={terms} open={open===p.id} onToggle={()=>setOpen(o=>o===p.id?null:p.id)} onEdit={onEdit} onGrade={onGrade} onRemove={onRemove}/>)}</ul>
    </section>)}
    {missing.length>0&&<section aria-label="No pick yet">
      <h3 className="slip-day">{archived?'No pick recorded':`Waiting on ${missing.length}`}</h3>
      <ul>{missing.map(m=><li key={m} className="leg leg-missing"><div className="leg-summary"><span className="leg-member">{m}</span><span className="leg-pick text-[var(--ink-2)]">No pick yet</span></div></li>)}</ul>
    </section>}
  </div>;
}

// One tick per member across the ticket: filled when won, cut when lost.
export function Tracker({picks,members}:{picks:Pick[];members:string[]}) {
  const order=[...groupByDay(picks).flatMap(g=>g.picks.map(p=>p.status as Status|'Missing')),...members.filter(m=>!picks.some(p=>p.member===m)).map(()=>'Missing' as const)];
  const count=(...s:string[])=>order.filter(x=>s.includes(x)).length;
  const parts=([[count('Hit'),'won','hit'],[count('Miss'),'lost','miss'],[count('Push','Void'),'push or void','push'],[count('Pending'),'pending','pending'],[count('Missing'),'no pick yet','missing']] as const).filter(([n])=>n>0);
  return <div className="tracker">
    <div className="ticks" aria-hidden="true">{order.map((s,i)=><span key={i} className={`tick tick-${s.toLowerCase()}`}/>)}</div>
    <p className="tracker-key"><span className="sr-only">Parlay legs: </span>{parts.map(([n,l,cls])=><span key={cls}><i className={`tick tick-${cls}`}/>{n} {l}</span>)}</p>
  </div>;
}

// This week's ticket: odds and payout up top, a perforation, then the legs.
export function Ticket({board,picks,missing,members,ticket,outcome,onCopy,...actions}:LegActions&{board:Board;picks:Pick[];missing:string[];members:string[];ticket?:{combinedOdds:number;wager:number;potentialPayout:number};outcome:string;onCopy:()=>void}) {
  const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:n%1?2:0}).format(n);
  return <article className="ticket" aria-label={`Week ${board.settings.activeWeek} ticket`}>
    <header className="ticket-head">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div><h2 className="ticket-title">Week {board.settings.activeWeek} Megalay</h2><p className="text-sm text-[var(--ink-2)]">{outcome}</p></div>
        <div className="sm:text-right">{ticket?<><p className="ticket-odds">{bigOdds(ticket.combinedOdds)}</p><p className="text-sm text-[var(--ink-2)]">{money(ticket.wager)} pays <strong className="text-[var(--ink)]">{money(ticket.potentialPayout)}</strong></p></>:<p className="max-w-[15rem] text-sm text-[var(--ink-2)]">Ticket odds appear once the commissioner records the ticket.</p>}</div>
      </div>
      <div className="mt-4"><Tracker picks={picks} members={members}/></div>
    </header>
    <div className="perforation" aria-hidden="true"/>
    <Slip picks={picks} missing={missing} board={board} {...actions}/>
    <footer className="ticket-foot"><p>Tap a leg for details. Picks stay editable until they’re graded.</p><Button variant="outline" disabled={!picks.length} onClick={onCopy}>Copy picks</Button></footer>
  </article>;
}

// Search across every week: every term must match the member, pick, sport, market or result.
export function searchPicks(picks:Pick[],query:string,filter:string) {
  const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits=picks.filter(p=>{
    if(filter!=='all'&&!(filter==='push'?['Push','Void'].includes(p.status):p.status===filter))return false;
    const d=p.details,hay=[p.member,p.selection,p.sport,d.team,d.opponent,d.market,d.description,d.line,p.evidence.result].filter(Boolean).join(' ').toLowerCase();
    return terms.every(t=>hay.includes(t));
  });
  return {terms,hits};
}
