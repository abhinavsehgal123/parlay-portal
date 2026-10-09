'use client';
import { useEffect,useRef,useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatOdds,oddsSports,type Details } from '@/lib/portal';
import type { OddsBoard,OddsEvent,OddsOutcome } from '@/lib/odds';

const SPORTS=oddsSports;
export type OddsFill={sport:string;details:Details;odds:number};
const eastern=(iso:string,o:Intl.DateTimeFormatOptions)=>new Date(iso).toLocaleString('en-US',{...o,timeZone:'America/New_York'});
const kickoff=(iso:string)=>eastern(iso,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET';
const clock=(iso:string)=>eastern(iso,{hour:'numeric',minute:'2-digit'})+' ET';
const eventDate=(iso:string)=>new Date(iso).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const signed=(n:number)=>`${n>0?'+':''}${n}`;
type Cell={line:string;odds:number;label:string;fill:Omit<Details,'feedAt'|'eventDate'>}|null;

function rows(e:OddsEvent):{team:string;cells:Cell[]}[] {
  const ml=(name:string)=>e.h2h.find(o=>o.name===name);
  const spread=(name:string)=>e.spreads.find(o=>o.name===name&&o.point!==undefined);
  const total=(name:'Over'|'Under')=>e.totals.find(o=>o.name===name&&o.point!==undefined);
  const side=(team:string,opponent:string,ou:'Over'|'Under')=>{
    const s=spread(team),t=total(ou),m=ml(team);
    return {team,cells:[
      s?{line:signed(s.point!),odds:s.price,label:`${team} ${signed(s.point!)}`,fill:{market:'Spread',team,opponent,line:signed(s.point!)}}:null,
      t?{line:`${ou==='Over'?'O':'U'} ${t.point}`,odds:t.price,label:`${ou} ${t.point}`,fill:{market:'Game total',team:e.away,opponent:e.home,description:ou,line:String(t.point)}}:null,
      m?{line:'ML',odds:m.price,label:`${team} moneyline`,fill:{market:'Moneyline',team,opponent}}:null,
    ] as Cell[]};
  };
  const out=[side(e.away,e.home,'Over'),side(e.home,e.away,'Under')];
  const draw:OddsOutcome|undefined=ml('Draw');
  if(draw)out.push({team:'Draw',cells:[null,null,{line:'Draw',odds:draw.price,label:'Draw',fill:{market:'Other',team:e.away,opponent:e.home,description:'Draw'}}]});
  return out;
}

export function OddsBrowser({initialSport,onPick}:{initialSport?:string;onPick:(fill:OddsFill)=>void}) {
  const [key,setKey]=useState((SPORTS.find(s=>s.sport===initialSport)??SPORTS[0]).key);
  const [boards,setBoards]=useState<Record<string,OddsBoard>>({}),[failed,setFailed]=useState<Record<string,boolean>>({});
  const inflight=useRef(new Set<string>());
  useEffect(()=>{
    if(boards[key]||failed[key]||inflight.current.has(key))return;
    const sportKey=key;inflight.current.add(sportKey);
    fetch(`/api/odds?sport=${sportKey}`,{cache:'no-store',signal:AbortSignal.timeout(15000)})
      .then(r=>{if(!r.ok)throw Error();return r.json() as Promise<OddsBoard>;})
      .then(board=>setBoards(b=>({...b,[sportKey]:board})))
      .catch(()=>setFailed(f=>({...f,[sportKey]:true})))
      .finally(()=>inflight.current.delete(sportKey));
  },[key,boards,failed]);
  const sport=SPORTS.find(s=>s.key===key)!,board=boards[key];
  const pick=(e:OddsEvent,c:NonNullable<Cell>)=>onPick({sport:sport.sport,odds:c.odds,details:{...c.fill,eventDate:eventDate(e.commence),feedAt:board?.fetchedAt||undefined}});
  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200" aria-label="FanDuel lines">
    <div className="bg-[#07152f] px-4 py-3 text-white"><p className="font-bold">Find it on FanDuel</p><p className="text-xs text-white/75">Tap a line to fill in your pick</p></div>
    <div className="flex gap-2 overflow-x-auto border-b bg-[#f8fbff] px-3 py-3">{SPORTS.map(s=><button key={s.key} type="button" aria-pressed={s.key===key} onClick={()=>setKey(s.key)} className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-bold ${s.key===key?'border-[#07152f] bg-[#07152f] text-[#c9ff37]':'border-slate-300 bg-white text-slate-900'}`}>{s.label}</button>)}</div>
    {board?.paused&&<p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">{board.fetchedAt?<>Showing lines from <strong>{clock(board.fetchedAt)}</strong>. </>:''}Updates are paused to stay within this month’s free odds quota. Check the price in the FanDuel app.</p>}
    {board?.stale&&!board.paused&&<p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">Showing older lines from <strong>{clock(board.fetchedAt!)}</strong>. Check the price in the FanDuel app.</p>}
    <div aria-live="polite">
      {!board&&!failed[key]?<div className="space-y-3 p-4" aria-busy="true"><p className="text-sm text-slate-600">Loading {sport.label} lines…</p>{[1,2].map(i=><div key={i} className="h-24 rounded-lg bg-slate-100 motion-safe:animate-pulse"/>)}</div>
      :!board?<div className="space-y-3 p-4"><p className="text-sm text-slate-700">FanDuel lines are unavailable right now. Enter your pick manually; saving works the same.</p><Button type="button" variant="outline" onClick={()=>setFailed(f=>({...f,[key]:false}))}><RefreshCw/>Try again</Button></div>
      :board?.unavailable?<p className="p-4 text-sm text-slate-700">FanDuel lines are unavailable right now. Enter your pick manually; saving works the same.</p>
      :board&&!board.events.length?<p className="px-4 py-5 text-center text-sm text-slate-600">No FanDuel lines for {sport.label} in the next 7 days.</p>
      :board&&board.events.map(e=><div key={e.id} className="space-y-2 border-b border-slate-100 px-3 py-3 last:border-b-0">
        <p className="text-xs font-semibold text-slate-600">{kickoff(e.commence)}</p>
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_4rem] items-end gap-1.5 text-xs font-semibold text-slate-500"><span/><span className="text-center">Spread</span><span className="text-center">Total</span><span className="text-center">Money</span></div>
        {rows(e).map((r,i)=><div key={r.team+i} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_4rem] items-center gap-1.5">
          <span className="text-sm font-bold leading-tight break-words">{i===1?'@ ':''}{r.team}</span>
          {r.cells.map((c,j)=>c?<button key={j} type="button" aria-label={`${c.label} at ${formatOdds(c.odds)}`} onClick={()=>pick(e,c)} className="flex min-h-12 flex-col items-center justify-center rounded-lg border border-slate-300 bg-white px-0.5 hover:border-[#07152f] focus-visible:outline-2 focus-visible:outline-[#1d4ed8]"><span className="text-xs font-semibold text-slate-600">{c.line}</span><span className="text-sm font-extrabold text-[#1d4ed8]">{formatOdds(c.odds)}</span></button>:<span key={j} className="text-center text-sm text-slate-400" aria-hidden="true">—</span>)}
        </div>)}
      </div>)}
    </div>
    <p className="bg-[#f8fbff] px-4 py-2.5 text-xs leading-relaxed text-slate-600">{board?.fetchedAt?`Updated ${clock(board.fetchedAt)} · `:''}Refreshes about every 2 hours. Player props aren’t listed: enter those manually. Always confirm the price in the FanDuel app.</p>
  </section>;
}
