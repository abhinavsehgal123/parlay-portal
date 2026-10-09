'use client';
import { useState } from 'react';
import { ChevronDown,Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatOdds,statusLabel,type Board,type Pick,type Status } from '@/lib/portal';

// The week's picks as one bet slip: a row per leg, grouped by game day, with
// members who have not picked yet listed last. Tapping a row opens its details.
const time=(s:string)=>s?new Date(s).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET':'';
const shortStatus:Record<Status,string>={Pending:'Pending',Hit:'Win',Miss:'Loss',Push:'Push',Void:'Void'};
const dayLabel=(d?:string)=>{
  if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d))return 'Date not set';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'});
};
export function StatusChip({status}:{status:Status}){return <span className={`chip chip-${status.toLowerCase()}`}>{shortStatus[status]}</span>;}

export function groupByDay(picks:Pick[]) {
  const sorted=[...picks].sort((a,b)=>(a.details.eventDate||'9999').localeCompare(b.details.eventDate||'9999')||a.createdAt.localeCompare(b.createdAt));
  const groups:{day:string;picks:Pick[]}[]=[];
  for(const p of sorted){const day=dayLabel(p.details.eventDate);const g=groups.find(x=>x.day===day);if(g)g.picks.push(p);else groups.push({day,picks:[p]});}
  return groups;
}

function Leg({pick,board,archived,open,onToggle,onEdit,onGrade,onRemove}:{pick:Pick;board:Board;archived:boolean;open:boolean;onToggle:()=>void;onEdit:(p:Pick)=>void;onGrade:(p:Pick)=>void;onRemove:(p:Pick)=>void}) {
  const changes=board.changes.filter(c=>c.submissionId===pick.id);
  const d=pick.details,panel=`leg-${pick.id}`;
  return <li className={`leg leg-${pick.status.toLowerCase()}`}>
    <button type="button" className="leg-summary" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
      <span className="leg-member">{pick.member}</span>
      <span className="leg-status"><StatusChip status={pick.status}/></span>
      <span className="leg-pick">{pick.selection}</span>
      <span className="leg-odds">{formatOdds(pick.odds)}</span>
      <span className="leg-meta">{pick.sport}{d.market?`, ${d.market.toLowerCase()}`:''}</span>
      <ChevronDown aria-hidden="true" className={`leg-caret ${open?'rotate-180':''}`}/>
    </button>
    {open&&<div id={panel} className="leg-detail">
      <dl className="leg-facts">
        {d.opponent&&<><dt>Matchup</dt><dd>{d.team} vs {d.opponent}</dd></>}
        {d.line&&<><dt>Line</dt><dd>{d.line}</dd></>}
        {d.description&&<><dt>Market</dt><dd>{d.description}</dd></>}
        <dt>FanDuel odds</dt><dd className="tabular-nums">{formatOdds(pick.odds)}</dd>
        <dt>Result</dt><dd>{statusLabel(pick.status)}</dd>
        {pick.evidence.result&&<><dt>Final</dt><dd>{pick.evidence.result}</dd></>}
        {pick.evidence.reason&&<><dt>Note</dt><dd>{pick.evidence.reason}</dd></>}
      </dl>
      {pick.evidence.source&&/^https?:\/\//i.test(pick.evidence.source)&&<a className="mt-2 inline-block text-sm font-semibold text-[var(--signal)] underline" href={pick.evidence.source} target="_blank" rel="noreferrer">Result source</a>}
      <p className="leg-note">Submitted {time(pick.createdAt)}{pick.revision>0?`, updated ${time(pick.updatedAt)}`:''}{d.feedAt?`. Line filled from FanDuel feed, ${time(d.feedAt)}`:''}</p>
      <div className="mt-3 flex flex-wrap gap-2">{(board.isAdmin||(!archived&&pick.status==='Pending'))&&<Button variant="outline" onClick={()=>onEdit(pick)}><Pencil className="size-4"/>{board.isAdmin?'Edit pick':'Edit my pick'}</Button>}{board.isAdmin&&<><Button variant="outline" onClick={()=>onGrade(pick)}>Record result</Button><Button variant="ghost" className="text-[var(--loss)]" onClick={()=>onRemove(pick)}>Remove</Button></>}</div>
      {changes.length>0&&<details className="leg-history"><summary>Change history ({changes.length})</summary><ol>{changes.map(c=><li key={c.id}><p className="font-semibold">{c.action} by {c.actor}</p><p className="text-xs text-[var(--steel)]">{time(c.createdAt)}</p>{c.before.selection&&<p>Before: {c.before.selection}, {formatOdds(c.before.odds!)}, {statusLabel(c.before.status!)}</p>}{c.after.selection&&<p>After: {c.after.selection}, {formatOdds(c.after.odds!)}, {statusLabel(c.after.status!)}</p>}{c.reason&&<p>{c.reason}</p>}</li>)}</ol></details>}
    </div>}
  </li>;
}

export function Slip({picks,missing=[],board,archived=false,flush=false,onEdit,onGrade,onRemove,empty}:{picks:Pick[];missing?:string[];board:Board;archived?:boolean;flush?:boolean;onEdit:(p:Pick)=>void;onGrade:(p:Pick)=>void;onRemove:(p:Pick)=>void;empty?:React.ReactNode}) {
  const [open,setOpen]=useState<string|null>(null);
  const groups=groupByDay(picks);
  if(!picks.length&&!missing.length)return <>{empty}</>;
  // flush: sits edge to edge inside another panel instead of drawing its own box.
  return <div className={flush?'slip slip-flush':'slip'}>
    {groups.map(g=><section key={g.day} aria-label={g.day}>
      <h3 className="slip-day">{g.day}</h3>
      <ul>{g.picks.map(p=><Leg key={p.id} pick={p} board={board} archived={archived} open={open===p.id} onToggle={()=>setOpen(o=>o===p.id?null:p.id)} onEdit={onEdit} onGrade={onGrade} onRemove={onRemove}/>)}</ul>
    </section>)}
    {!picks.length&&empty}
    {missing.length>0&&<section aria-label="No pick yet">
      <h3 className="slip-day">{archived?'No pick recorded':`Waiting on ${missing.length}`}</h3>
      <ul>{missing.map(m=><li key={m} className="leg leg-missing"><div className="leg-summary"><span className="leg-member">{m}</span><span className="leg-pick text-[var(--steel)]">No pick yet</span></div></li>)}</ul>
    </section>}
  </div>;
}

// One link per member: lit when the leg won, broken when it lost.
export function Chain({picks,members}:{picks:Pick[];members:string[]}) {
  const order=[...groupByDay(picks).flatMap(g=>g.picks.map(p=>p.status as Status|'Missing')),...members.filter(m=>!picks.some(p=>p.member===m)).map(()=>'Missing' as const)];
  const count=(s:string)=>order.filter(x=>x===s).length;
  const parts=([[count('Hit'),'won','hit'],[count('Miss'),'lost','miss'],[count('Push')+count('Void'),'push or void','push'],[count('Pending'),'pending','pending'],[count('Missing'),'no pick yet','missing']] as const).filter(([n])=>n>0).map(([n,l,cls])=>({text:`${n} ${l}`,cls}));
  return <div>
    <div className="chain" aria-hidden="true">{order.map((s,i)=><span key={i} className={`link link-${s.toLowerCase()}`}/>)}</div>
    <p className="chain-key"><span className="sr-only">Parlay legs: </span>{parts.map(p=><span key={p.cls}><i className={`link link-${p.cls}`}/>{p.text}</span>)}</p>
  </div>;
}
