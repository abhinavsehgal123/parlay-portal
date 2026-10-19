'use client';
import { formatOdds,type Board,type Pick } from '@/lib/portal';

// Season stats and awards, worked out from the same graded picks as the standings
// (weeks 1 onward of the current season). Streaks follow week order and skip pushes,
// voids and pending legs. A replaced pick counts as the bet that replaced it, as in
// the standings; replacements are counted from the change history.
type Row={member:string;picks:Pick[];w:number;l:number;rate:number|null;current:string;bestWin:number;worstLoss:number;bestHit:Pick|null;sport:string;replaced:number};

function streaks(picks:Pick[]) {
  let run=0,kind='',bestWin=0,worstLoss=0;
  for(const p of picks){
    if(p.status!=='Hit'&&p.status!=='Miss')continue;
    if(p.status===kind)run++;else{kind=p.status;run=1;}
    if(kind==='Hit')bestWin=Math.max(bestWin,run);else worstLoss=Math.max(worstLoss,run);
  }
  return {current:kind?`${kind==='Hit'?'W':'L'}${run}`:'—',bestWin,worstLoss};
}

export function seasonRows(board:Board,members:string[],season:string,week:number):Row[] {
  return members.map(member=>{
    const picks=board.historySubmissions.filter(p=>p.member===member&&p.season===season&&p.week>=1&&p.week<=week).sort((a,b)=>a.week-b.week||a.createdAt.localeCompare(b.createdAt));
    const w=picks.filter(p=>p.status==='Hit').length,l=picks.filter(p=>p.status==='Miss').length;
    const hits=picks.filter(p=>p.status==='Hit').sort((a,b)=>b.odds-a.odds);
    const counts=new Map<string,number>();for(const p of picks)counts.set(p.sport,(counts.get(p.sport)??0)+1);
    const sport=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]??'—';
    const replaced=board.changes.filter(c=>c.action==='replace'&&c.member===member&&c.season===season&&c.week>=1&&c.week<=week).length;
    return {member,picks,w,l,rate:w+l?w/(w+l):null,...streaks(picks),bestHit:hits[0]??null,sport,replaced};
  });
}

function Award({title,who,detail}:{title:string;who:string;detail:string}) {
  return <div className="paper rounded-xl p-4"><p className="text-xs font-bold uppercase tracking-wide text-[var(--ink-2)]">{title}</p><p className="display mt-1 text-3xl leading-none">{who}</p><p className="mt-1.5 text-sm text-[var(--ink-2)]">{detail}</p></div>;
}

export function SeasonStats({board,members,season,week}:{board:Board;members:string[];season:string;week:number}) {
  const rows=seasonRows(board,members,season,week);
  const top=<K extends keyof Row>(key:K,ok:(r:Row)=>boolean=()=>true)=>rows.filter(ok).sort((a,b)=>Number(b[key])-Number(a[key]))[0];
  const sharp=rows.filter(r=>r.w+r.l>=3).sort((a,b)=>(b.rate??0)-(a.rate??0)||b.w-a.w)[0];
  const longshot=rows.filter(r=>r.bestHit).sort((a,b)=>b.bestHit!.odds-a.bestHit!.odds)[0];
  const heater=top('bestWin',r=>r.bestWin>0),cold=top('worstLoss',r=>r.worstLoss>0),reup=top('replaced',r=>r.replaced>0);
  const finals=board.finalizations.filter(f=>f.season===season&&f.week>=1);
  const cashed=finals.filter(f=>{const t=board.tickets.find(x=>x.season===season&&x.week===f.week);if(t?.result)return t.result==='Won';const legs=board.historySubmissions.filter(p=>p.season===season&&p.week===f.week);return legs.length>0&&legs.every(p=>['Hit','Push','Void'].includes(p.status))&&legs.some(p=>p.status==='Hit');}).length;
  return <section aria-labelledby="season-awards" className="mt-8">
    <h3 id="season-awards" className="display text-4xl">Season awards</h3>
    <p className="my-2 max-w-2xl text-[var(--chalk-dim)]">Parlays cashed: <strong className="text-[var(--chalk)]">{cashed} of {finals.length}</strong> finalized weeks.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sharp&&<Award title="Sharpest" who={sharp.member} detail={`${Math.round(100*sharp.rate!)}% (${sharp.w}–${sharp.l}), at least 3 decided picks`}/>}
      {longshot&&<Award title="Longshot king" who={longshot.member} detail={`${longshot.bestHit!.selection} hit at ${formatOdds(longshot.bestHit!.odds)}`}/>}
      {heater&&<Award title="Heater" who={heater.member} detail={`${heater.bestWin} straight wins${heater.current===`W${heater.bestWin}`?', still going':''}`}/>}
      {cold&&<Award title="Ice cold" who={cold.member} detail={`${cold.worstLoss} straight losses${cold.current===`L${cold.worstLoss}`?', still going':''}`}/>}
      {reup&&<Award title="Re-up regular" who={reup.member} detail={`${reup.replaced} lost pick${reup.replaced===1?'':'s'} replaced`}/>}
    </div>
    <h3 className="display mt-8 text-4xl">Member stats</h3>
    <div className="paper mt-3 overflow-x-auto"><table className="w-full text-sm tabular-nums"><thead><tr className="border-b border-[var(--rule)] text-[var(--ink-2)]">{['Member','Streak','Best run','Worst run','Best hit','Top sport','Re-ups'].map((x,i)=><th key={x} scope="col" className={`whitespace-nowrap px-3 py-3 font-semibold ${i?'text-right':'text-left'}`}>{x}</th>)}</tr></thead>
      <tbody>{[...rows].sort((a,b)=>(b.rate??-1)-(a.rate??-1)||b.w-a.w).map(r=><tr key={r.member} className="border-b border-[#edf2ee] last:border-0">
        <th scope="row" className="px-3 py-3 text-left text-[15px] font-bold">{r.member}</th>
        <td className={`px-3 text-right font-semibold ${r.current.startsWith('W')?'text-[var(--win)]':r.current.startsWith('L')?'text-[var(--loss)]':'text-[var(--ink-2)]'}`}>{r.current}</td>
        <td className="px-3 text-right">{r.bestWin?`W${r.bestWin}`:'—'}</td>
        <td className="px-3 text-right">{r.worstLoss?`L${r.worstLoss}`:'—'}</td>
        <td className="px-3 text-right">{r.bestHit?formatOdds(r.bestHit.odds):'—'}</td>
        <td className="whitespace-nowrap px-3 text-right">{r.sport}</td>
        <td className="px-3 pr-4 text-right">{r.replaced||'—'}</td>
      </tr>)}</tbody></table></div>
    <p className="mt-3 max-w-2xl text-sm text-[var(--chalk-dim)]">Streaks run in week order and skip pushes, voids and pending picks. Best hit is the longest odds a member has won at. Re-ups count lost picks replaced on the site.</p>
  </section>;
}
