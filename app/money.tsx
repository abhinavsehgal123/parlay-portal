'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { members,type Board } from '@/lib/portal';
import { BASE_STAKE,paymentKinds,weekMoney,type PaymentKind } from '@/lib/payments';

// A week's money for the commissioner: who owes the base, what's come in, what went to
// FanDuel, and re-ups that need a new pick logged. Payments come from Venmo receipts
// via the Claude Venmo routine; anything else can be added here.
const kindLabel:Record<PaymentKind,string>={base:'Base',boost:'Boost',reup:'Re-up',deposit:'FanDuel deposit'};
const money=(n:number)=>`$${n%1?n.toFixed(2):n}`;
const day=(iso:string)=>new Date(iso).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'America/New_York'});

export function WeekMoney({board,season,week,busy,onAdd,onRemove}:{board:Board;season:string;week:number;busy:boolean;onAdd:(body:Record<string,unknown>)=>void;onRemove:(id:string)=>void}) {
  const base=board.basePayers?.find(b=>b.week===week)??null;
  const m=weekMoney(board,season,week,base?.member??null);
  const [adding,setAdding]=useState(false),[member,setMember]=useState(''),[kind,setKind]=useState<PaymentKind>('boost'),[amount,setAmount]=useState(''),[note,setNote]=useState('');
  return <div className="space-y-3 text-sm">
    {base?<p className={m.basePaid?'':'font-semibold text-[var(--loss)]'}>{base.member} owes the {money(BASE_STAKE)} base (lowest in fantasy week {week-1}, {base.points.toFixed(2)} pts): {m.basePaid?'paid ✓':'not paid yet'}</p>
      :week===board.settings.activeWeek&&<p className="text-[var(--ink-2)]">Base payer: not available from Sleeper right now.</p>}
    {m.unloggedReups.map(member=><p key={member} className="font-semibold text-[var(--loss)]">{member} sent re-up money after their pick lost, but no new pick is logged. Replace their pick on the ticket.</p>)}
    <p>Collected <strong>{money(m.collected)}</strong> · deposited to FanDuel <strong>{money(m.deposited)}</strong></p>
    {m.payments.length?<ul className="divide-y divide-[var(--rule)] rounded-lg border border-[var(--rule)] bg-white">{m.payments.map(p=><li key={p.id} className="flex items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1"><span className="font-semibold">{p.member||'You'}</span> · {kindLabel[p.kind]} · <span className="tabular-nums">{money(p.amount)}</span>{p.note&&<span className="text-[var(--ink-2)]"> · “{p.note}”</span>}<span className="block text-xs text-[var(--ink-2)]">{day(p.paidAt)} · {p.source==='venmo'?'Venmo':'added by you'}</span></span>
      <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Remove ${p.member||'deposit'} ${money(p.amount)}`} onClick={()=>onRemove(p.id)}><X className="size-4"/></Button>
    </li>)}</ul>:<p className="text-[var(--ink-2)]">No payments recorded for week {week} yet.</p>}
    {!adding?<Button type="button" variant="outline" size="sm" onClick={()=>setAdding(true)}>Add a payment</Button>
      :<form className="grid gap-2 rounded-lg border border-[var(--rule)] p-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();onAdd({week,kind,member,amount:Number(amount),note});setAdding(false);setAmount('');setNote('');}}>
        <label className="grid gap-1">Type<select className="min-h-10 rounded-md border border-[var(--rule)] bg-white px-2" value={kind} onChange={e=>setKind(e.target.value as PaymentKind)}>{paymentKinds.map(k=><option key={k} value={k}>{kindLabel[k]}</option>)}</select></label>
        {kind!=='deposit'&&<label className="grid gap-1">Member<select className="min-h-10 rounded-md border border-[var(--rule)] bg-white px-2" value={member} onChange={e=>setMember(e.target.value)} required><option value="">Choose</option>{members.map(x=><option key={x}>{x}</option>)}</select></label>}
        <label className="grid gap-1">Amount ($)<input className="min-h-10 rounded-md border border-[var(--rule)] px-2" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
        <label className="grid gap-1">Note<input className="min-h-10 rounded-md border border-[var(--rule)] px-2" value={note} onChange={e=>setNote(e.target.value)} placeholder="Cash, Zelle…"/></label>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" size="sm" disabled={busy||!(Number(amount)>0)||(kind!=='deposit'&&!member)}>Save</Button><Button type="button" variant="ghost" size="sm" onClick={()=>setAdding(false)}>Cancel</Button></div>
      </form>}
  </div>;
}
