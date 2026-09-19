'use client';

import { useEffect, useState } from 'react';
import { Archive, Check, Clipboard, Clock3, Eye, KeyRound, LogOut, Pencil, RefreshCw, Settings2, ShieldCheck, Sparkles, Trash2, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const members = ['CJ', 'Brooks', 'Nav', 'Fab', 'Drew', 'Shan', 'Kith', 'Griff', 'Seed', 'Rohan', 'Ryser', 'Jp'];
const sports = ['NFL', 'College Football', 'NBA', 'College Basketball', 'MLB', 'NHL', 'Soccer', 'Other'];
type Submission = { id: string; season: string; week: number; member: string; sport: string; selection: string; odds: number; status: 'Pending' | 'Hit' | 'Miss' | 'Push'; createdAt: string };
type RecordRow = { member: string; wins: number; losses: number; pushes: number; picks: number };
type PortalSettings = { season: string; activeWeek: number; submissionsOpen: boolean | number; deadlineLabel: string };
type Finalization = { season: string; week: number; pickCount: number; finalizedAt: string };
type Ticket = { season: string; week: number; combinedOdds: number; wager: number; potentialPayout: number; updatedAt: string };

const formatOdds = (value: number) => `${value > 0 ? '+' : ''}${value}`;
const formatMoney = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export default function Home() {
  const [member, setMember] = useState('');
  const [sport, setSport] = useState('');
  const [otherSport, setOtherSport] = useState('');
  const [selection, setSelection] = useState('');
  const [odds, setOdds] = useState('');
  const [oddsSign, setOddsSign] = useState<'-' | '+'>('-');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [historySubmissions, setHistorySubmissions] = useState<Submission[]>([]);
  const [finalizations, setFinalizations] = useState<Finalization[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketOdds, setTicketOdds] = useState('');
  const [ticketWager, setTicketWager] = useState('');
  const [ticketPayout, setTicketPayout] = useState('');
  const [sent, setSent] = useState(false);
  const [receipt, setReceipt] = useState<Submission | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState('');
  const [settings, setSettings] = useState<PortalSettings>({ season: '2026 Season', activeWeek: 1, submissionsOpen: true, deadlineLabel: 'Sunday, 12:45 PM ET' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [advancingWeek, setAdvancingWeek] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [commissionerOpen, setCommissionerOpen] = useState(false);
  const [commissionerCode, setCommissionerCode] = useState('');
  const [commissionerError, setCommissionerError] = useState('');
  const [commissionerLoading, setCommissionerLoading] = useState(false);
  const [editing, setEditing] = useState<Submission | null>(null);
  const [editSport, setEditSport] = useState('');
  const [editSelection, setEditSelection] = useState('');
  const [editOdds, setEditOdds] = useState('');

  async function refreshBoard() {
    const response = await fetch('/api/submissions', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('refresh');
    const data = await response.json() as { submissions?: Submission[]; records?: RecordRow[]; historySubmissions?: Submission[]; finalizations?: Finalization[]; ticket?: Ticket | null; tickets?: Ticket[]; settings?: PortalSettings; isAdmin?: boolean };
    setSubmissions(data.submissions ?? []);
    setRecords(data.records ?? []);
    setHistorySubmissions(data.historySubmissions ?? []);
    setFinalizations(data.finalizations ?? []);
    setTicket(data.ticket ?? null);
    setTickets(data.tickets ?? []);
    setTicketOdds(data.ticket ? String(data.ticket.combinedOdds) : '');
    setTicketWager(data.ticket ? String(data.ticket.wager) : '');
    setTicketPayout(data.ticket ? String(data.ticket.potentialPayout) : '');
    if (data.settings) {
      setSettings({ ...data.settings, submissionsOpen: Boolean(data.settings.submissionsOpen) });
    }
    setIsAdmin(Boolean(data.isAdmin));
    setReceipt((current) => current && data.submissions?.some((pick) => pick.id === current.id) ? current : null);
  }

  useEffect(() => {
    const refresh = () => { refreshBoard().catch(() => setError('The weekly board could not refresh. Your form has been kept. Please try refreshing again.')); };
    const onVisible = () => { if (!isAdmin && document.visibilityState === 'visible') refresh(); };
    if (!isAdmin) refresh();
    const timer = window.setInterval(onVisible, 15000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [isAdmin]);

  async function submitPick() {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const resolvedSport = sport === 'Other' ? otherSport.trim() : sport;
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ member, sport: resolvedSport, selection, odds: Number(`${oddsSign}${odds}`), week: settings.activeWeek, season: settings.season }),
      });
      const result = await response.json() as Submission & { error?: string };
      if (!response.ok) {
        setError(result.error ?? 'Your pick was not saved. Please try again.');
        await refreshBoard().catch(() => {});
        return;
      }
      if (!result.id) throw new Error('Missing confirmation');
      // A saved pick stays confirmed even if the subsequent board refresh fails.
      setReceipt(result);
      setSubmissions((current) => [...current.filter((pick) => pick.member !== result.member), result]);
      setSent(true);
      setReviewing(false);
      await refreshBoard().catch(() => setError('Your pick is saved. The rest of the board could not refresh yet.'));
    } catch {
      setError('We could not confirm the submission. Check the board below, then retry if your pick is missing. Your form has been kept.');
      await refreshBoard().catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: Submission['status']) {
    setUpdating(id);
    setError('');
    const response = await fetch('/api/submissions', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? 'The result could not be updated.');
    else await refreshBoard();
    setUpdating('');
  }

  function beginEdit(pick: Submission) {
    setEditing(pick);
    setEditSport(pick.sport);
    setEditSelection(pick.selection);
    setEditOdds(String(pick.odds));
    setError('');
  }

  async function saveEdit() {
    if (!editing) return;
    setUpdating(editing.id);
    setError('');
    const response = await fetch('/api/submissions', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: editing.id, sport: editSport, selection: editSelection, odds: Number(editOdds) }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? 'The pick could not be updated.');
    else { setEditing(null); await refreshBoard(); }
    setUpdating('');
  }

  async function deletePick(pick: Submission) {
    if (!window.confirm(`Remove ${pick.member}’s Week ${pick.week} Megalay pick? This will also remove it from the Google Sheet.`)) return;
    setUpdating(pick.id);
    setError('');
    const response = await fetch('/api/submissions', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: pick.id }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? 'The pick could not be removed.');
    else { if (editing?.id === pick.id) setEditing(null); setSent(false); await refreshBoard(); }
    setUpdating('');
  }

  async function copyPicks() {
    const lines = submissions.map((pick, index) => `${index + 1}. ${pick.selection} (${pick.sport}, ${pick.odds > 0 ? '+' : ''}${pick.odds})`);
    await navigator.clipboard.writeText(`Build this OFF League Megalay in FanDuel using the closest currently available markets:\n${lines.join('\n')}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError('');
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? 'League settings could not be saved.');
    else { setSent(false); await refreshBoard(); }
    setSavingSettings(false);
  }

  async function enterCommissionerMode() {
    setCommissionerLoading(true);
    setCommissionerError('');
    const response = await fetch('/api/admin-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: commissionerCode }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setCommissionerError(result.error ?? 'Admin mode could not be opened.');
    else { setCommissionerCode(''); setCommissionerOpen(false); await refreshBoard(); }
    setCommissionerLoading(false);
  }

  async function exitCommissionerMode() {
    await fetch('/api/admin-session', { method: 'DELETE' });
    setIsAdmin(false);
  }

  async function saveTicket() {
    setSavingTicket(true);
    setError('');
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'saveTicket', combinedOdds: Number(ticketOdds), wager: Number(ticketWager), potentialPayout: Number(ticketPayout) }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? 'The final ticket details could not be saved.');
    else await refreshBoard();
    setSavingTicket(false);
  }

  async function finalizeAndAdvance() {
    if (!window.confirm(`Finalize ${settings.season}, Week ${settings.activeWeek} with ${submissions.length} pick${submissions.length === 1 ? '' : 's'} and open Week ${settings.activeWeek + 1}?`)) return;
    setAdvancingWeek(true);
    setError('');
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'finalizeAndAdvance' }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? 'The week could not be finalized.');
    else { setSent(false); await refreshBoard(); }
    setAdvancingWeek(false);
  }

  const submitted = submissions.map((entry) => entry.member);
  const progress = {
    hit: submissions.filter((entry) => entry.status === 'Hit').length,
    miss: submissions.filter((entry) => entry.status === 'Miss').length,
    push: submissions.filter((entry) => entry.status === 'Push').length,
    pending: submissions.filter((entry) => entry.status === 'Pending').length,
  };
  const memberAlreadySubmitted = Boolean(member && submitted.includes(member));
  const fullRecords = members.map((name) => records.find((row) => row.member === name) ?? { member: name, wins: 0, losses: 0, pushes: 0, picks: 0 });
  const archiveKeys = Array.from(new Set([
    ...historySubmissions.map((pick) => `${pick.season}|${pick.week}`),
    ...tickets.map((entry) => `${entry.season}|${entry.week}`),
    ...finalizations.map((entry) => `${entry.season}|${entry.week}`),
  ])).sort((a, b) => {
    const [seasonA, weekA] = a.split('|');
    const [seasonB, weekB] = b.split('|');
    return seasonB.localeCompare(seasonA, undefined, { numeric: true }) || Number(weekB) - Number(weekA);
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-[#07152f] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#c9ff37] text-[#07152f] shadow-[0_0_28px_rgba(201,255,55,.22)]"><Trophy className="size-5" /></div>
            <div><p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#c9ff37]">OFF League</p><p className="font-semibold tracking-tight">Megalay Portal</p></div>
          </div>
          <div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 sm:flex"><span className={`size-2 rounded-full ${settings.submissionsOpen ? 'bg-[#c9ff37]' : 'bg-amber-400'}`} /> Submissions {settings.submissionsOpen ? 'open' : 'closed'}</div>{isAdmin ? <Button size="sm" variant="outline" className="border-[#c9ff37]/50 bg-[#c9ff37]/10 text-[#c9ff37] hover:bg-[#c9ff37]/20 hover:text-[#c9ff37]" onClick={exitCommissionerMode}><LogOut />Exit Admin</Button> : <Button size="sm" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => setCommissionerOpen(true)}><KeyRound />Admin</Button>}</div>
        </div>
      </header>

      <Dialog open={commissionerOpen} onOpenChange={(open) => { setCommissionerOpen(open); if (!open) { setCommissionerError(''); setCommissionerCode(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Admin</DialogTitle><DialogDescription>Enter the private admin code to manage weeks, ticket details, picks, and results on this device.</DialogDescription></DialogHeader>
          <label className="space-y-2 text-sm font-semibold"><span>Admin code</span><Input autoFocus inputMode="numeric" type="password" placeholder="Enter code" value={commissionerCode} onChange={(event) => setCommissionerCode(event.target.value.replace(/\D/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter' && commissionerCode) enterCommissionerMode(); }} /></label>
          {commissionerError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{commissionerError}</p>}
          <Button className="bg-[#07152f] text-white hover:bg-[#0e2852]" disabled={!commissionerCode || commissionerLoading} onClick={enterCommissionerMode}>{commissionerLoading ? <><RefreshCw className="animate-spin" /> Checking</> : <><KeyRound /> Open Admin controls</>}</Button>
        </DialogContent>
      </Dialog>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)] lg:py-10">
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="mb-1 text-xs font-bold uppercase tracking-[.18em] text-primary">{settings.season} · Week {settings.activeWeek}</p><h1 className="text-3xl font-black tracking-[-.04em] sm:text-4xl">Megalay Submission</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">One pick each. Build the week’s Megalay together, avoid repeats, and let the portal handle the rest.</p></div>
            <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm"><Clock3 className="size-4 text-primary" /> {settings.submissionsOpen ? `Closes ${settings.deadlineLabel}` : 'Submissions closed'}</div>
          </div>

          <div className="grid gap-2 rounded-xl border bg-white p-3 text-sm shadow-sm sm:grid-cols-3">
            <div className="flex gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#07152f] text-xs font-black text-[#c9ff37]">1</span><p><span className="font-bold">Choose your name</span><br /><span className="text-xs text-muted-foreground">Double-check before submitting.</span></p></div>
            <div className="flex gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#07152f] text-xs font-black text-[#c9ff37]">2</span><p><span className="font-bold">Add one leg</span><br /><span className="text-xs text-muted-foreground">Use the current FanDuel line.</span></p></div>
            <div className="flex gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#07152f] text-xs font-black text-[#c9ff37]">3</span><p><span className="font-bold">Follow the Megalay</span><br /><span className="text-xs text-muted-foreground">Picks and progress stay public.</span></p></div>
          </div>

          <Card className="border-0 shadow-[0_18px_50px_rgba(7,21,47,.10)] ring-1 ring-[#0e2852]/10">
            <CardHeader className="border-b bg-[#f8fbff] py-5"><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="size-5 text-primary" /> Submit your Megalay pick</CardTitle><CardDescription>Your selection and weekly limit are checked before anything is added.</CardDescription></CardHeader>
            <CardContent className="grid gap-5 py-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold"><span>Member</span><Select value={member} onValueChange={(value) => { setMember(value ?? ''); setSent(false); setReviewing(false); setError(''); }}><SelectTrigger className="h-11 w-full bg-white"><SelectValue placeholder="Choose your name" /></SelectTrigger><SelectContent>{members.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></label>
              <label className="space-y-2 text-sm font-semibold"><span>Sport / league</span><Select value={sport} onValueChange={(value) => setSport(value ?? '')}><SelectTrigger className="h-11 w-full bg-white"><SelectValue placeholder="Choose a sport" /></SelectTrigger><SelectContent>{sports.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></label>
              {sport === 'Other' && <label className="space-y-2 text-sm font-semibold"><span>Other sport</span><Input className="h-11 bg-white" placeholder="Type the sport or league" value={otherSport} onChange={(event) => setOtherSport(event.target.value)} /></label>}
              <label className="space-y-2 text-sm font-semibold sm:col-span-2"><span>Selection</span><Input className="h-11 bg-white" placeholder="Example: Bills -2.5 vs. Ravens" value={selection} onChange={(event) => setSelection(event.target.value)} /></label>
              <label className="space-y-2 text-sm font-semibold sm:col-span-2"><span>FanDuel Odds</span><span className="flex gap-2"><span className="flex shrink-0 rounded-lg border bg-white p-1"><Button type="button" size="sm" variant={oddsSign === '-' ? 'default' : 'ghost'} className={oddsSign === '-' ? 'bg-[#07152f] text-white' : ''} onClick={() => setOddsSign('-')}>−</Button><Button type="button" size="sm" variant={oddsSign === '+' ? 'default' : 'ghost'} className={oddsSign === '+' ? 'bg-[#07152f] text-white' : ''} onClick={() => setOddsSign('+')}>+</Button></span><Input className="h-11 bg-white" inputMode="numeric" pattern="[0-9]*" placeholder="Example: 110" value={odds} onChange={(event) => setOdds(event.target.value.replace(/\D/g, ''))} /></span><span className="block text-xs font-normal text-muted-foreground">Choose − or +, then enter the number shown beside the selection.</span></label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2"><ShieldCheck className="size-4 text-primary" /> Duplicate picks and weekly limits are checked automatically.</div>
              {receipt && receipt.member === member && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 sm:col-span-2">Saved for {receipt.member}: {receipt.selection} ({formatOdds(receipt.odds)}) · Week {receipt.week}. Confirmed {new Date(receipt.createdAt).toLocaleString()}.</p>}
              {memberAlreadySubmitted && <div className="text-sm text-muted-foreground sm:col-span-2">Your pick is on the board. If the commissioner removed it, <button type="button" className="underline font-semibold" onClick={() => refreshBoard().then(() => setError('')).catch(() => setError('The board could not refresh. Please try again.'))}>refresh the board</button> to submit a replacement.</div>}
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-2">{error}</p>}
              {reviewing && <div className="rounded-xl border border-[#c9ff37]/60 bg-[#f8ffe5] p-4 sm:col-span-2"><p className="text-xs font-bold uppercase tracking-[.15em] text-primary">Confirm your identity</p><p className="mt-1 font-black text-[#07152f]">Submit this Week {settings.activeWeek} pick as {member}?</p><p className="mt-2 text-sm"><span className="font-semibold">{selection}</span> · {sport === 'Other' ? otherSport.trim() : sport} · FanDuel {formatOdds(Number(`${oddsSign}${odds}`))}</p><p className="mt-2 text-xs text-muted-foreground">There are no PINs, so please make sure you selected your own name.</p><div className="mt-3 flex gap-2"><Button className="flex-1 bg-[#07152f] text-white hover:bg-[#0e2852]" disabled={submitting} onClick={submitPick}>{submitting ? <><RefreshCw className="animate-spin" /> Submitting</> : <>Yes, submit as {member}</>}</Button><Button variant="outline" disabled={submitting} onClick={() => setReviewing(false)}>Go back</Button></div></div>}
              {!reviewing && <Button disabled={!settings.submissionsOpen || !member || !sport || (sport === 'Other' && !otherSport.trim()) || !selection || !odds || submitting || memberAlreadySubmitted} onClick={() => setReviewing(true)} className="h-12 bg-[#07152f] text-base text-white hover:bg-[#0e2852] sm:col-span-2">{memberAlreadySubmitted ? <><Check /> Week pick already submitted</> : sent && receipt ? <><Check /> Megalay pick received</> : settings.submissionsOpen ? <>Review Megalay pick</> : <>Submissions closed</>}</Button>}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="bg-[#07152f] text-white ring-0">
            <CardHeader><CardTitle className="flex items-center justify-between text-lg">Megalay board <span className="rounded-full bg-[#c9ff37] px-2.5 py-1 text-xs font-black text-[#07152f]">{submitted.length} / 12</span></CardTitle><CardDescription className="text-white/60">Week {settings.activeWeek} picks appear as soon as they are submitted.</CardDescription></CardHeader>
            <CardContent className="grid gap-2 pb-5 sm:grid-cols-2 lg:grid-cols-1">
              <div className="mb-2 rounded-xl border border-[#c9ff37]/35 bg-[#c9ff37]/10 p-3 sm:col-span-2 lg:col-span-1">
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#c9ff37]">Official FanDuel ticket</p>
                {ticket ? <div className="mt-2 grid grid-cols-3 gap-2">
                  <div><p className="text-[10px] text-white/55">Combined odds</p><p className="mt-0.5 font-black text-white">{formatOdds(ticket.combinedOdds)}</p></div>
                  <div><p className="text-[10px] text-white/55">Wager</p><p className="mt-0.5 font-black text-white">{formatMoney(ticket.wager)}</p></div>
                  <div><p className="text-[10px] text-white/55">Payout</p><p className="mt-0.5 font-black text-[#c9ff37]">{formatMoney(ticket.potentialPayout)}</p></div>
                </div> : <p className="mt-1 text-sm text-white/65">Awaiting final ticket details</p>}
              </div>
              {!!submissions.length && <div className="mb-2 grid grid-cols-4 gap-1.5 sm:col-span-2 lg:col-span-1" aria-label="Megalay progress summary">
                <div className="rounded-lg bg-emerald-400/15 px-2 py-2 text-center"><p className="text-lg font-black text-emerald-300">{progress.hit}</p><p className="text-[9px] font-bold uppercase tracking-wide text-emerald-200/70">Hit</p></div>
                <div className="rounded-lg bg-red-400/15 px-2 py-2 text-center"><p className="text-lg font-black text-red-300">{progress.miss}</p><p className="text-[9px] font-bold uppercase tracking-wide text-red-200/70">Miss</p></div>
                <div className="rounded-lg bg-amber-400/15 px-2 py-2 text-center"><p className="text-lg font-black text-amber-300">{progress.push}</p><p className="text-[9px] font-bold uppercase tracking-wide text-amber-200/70">Push</p></div>
                <div className="rounded-lg bg-white/10 px-2 py-2 text-center"><p className="text-lg font-black text-white">{progress.pending}</p><p className="text-[9px] font-bold uppercase tracking-wide text-white/55">Pending</p></div>
              </div>}
              {members.map((name) => {
                const pick = submissions.find((entry) => entry.member === name);
                return <div key={name} className={`rounded-lg border px-3 py-2.5 text-sm ${pick ? 'border-[#c9ff37]/35 bg-[#c9ff37]/10' : 'border-white/10 bg-white/5 text-white/55'}`}>
                  <div className="flex items-center justify-between gap-3"><span className="font-bold">{name}</span>{pick ? <Check className="size-4 shrink-0 text-[#c9ff37]" /> : <span className="text-[10px] uppercase tracking-wider">Waiting</span>}</div>
                  {pick && <div className="mt-2 border-t border-white/10 pt-2"><p className="font-semibold leading-snug text-white">{pick.selection}</p><p className="mt-1 text-xs text-white/60">{pick.sport} · FanDuel {pick.odds > 0 ? '+' : ''}{pick.odds}</p></div>}
                </div>;
              })}
            </CardContent>
          </Card>
          <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground"><Eye className="mt-0.5 size-4 shrink-0 text-primary" /><p>Every submitted pick is visible immediately. Refresh this page anytime to see the latest board.</p></div>
        </aside>
      </section>

      <section className="mx-auto max-w-7xl space-y-6 px-5 pb-12 sm:px-8">
        <Card className="overflow-hidden border-0 shadow-[0_18px_50px_rgba(7,21,47,.08)] ring-1 ring-[#0e2852]/10">
          <CardHeader className="flex-row items-center justify-between gap-4 border-b bg-white">
            <div><CardTitle className="text-xl">Week {settings.activeWeek} picks</CardTitle><CardDescription>{isAdmin ? 'Live selections and Admin result controls.' : 'Live selections from the league.'}</CardDescription></div>
            <Button variant="outline" disabled={!submissions.length} onClick={copyPicks}><Clipboard /> {copied ? 'Copied' : 'Copy for FanDuel'}</Button>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {!submissions.length && <p className="p-6 text-sm text-muted-foreground">No picks have been submitted yet.</p>}
            {submissions.map((pick) => (
              <div key={pick.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                {editing?.id === pick.id ? <div className="grid gap-3 sm:grid-cols-[.7fr_1.5fr_.5fr]"><Input aria-label="Sport" value={editSport} onChange={(event) => setEditSport(event.target.value)} /><Input aria-label="Selection" value={editSelection} onChange={(event) => setEditSelection(event.target.value)} /><Input aria-label="FanDuel Odds" inputMode="text" value={editOdds} onChange={(event) => setEditOdds(event.target.value)} /></div> : <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-[#07152f]">{pick.member}</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{pick.sport}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pick.status === 'Hit' ? 'bg-emerald-100 text-emerald-800' : pick.status === 'Miss' ? 'bg-red-100 text-red-800' : pick.status === 'Push' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{pick.status}</span></div><p className="mt-1 font-semibold">{pick.selection}</p><p className="mt-0.5 text-sm text-muted-foreground">FanDuel {pick.odds > 0 ? '+' : ''}{pick.odds}</p></div>}
                {isAdmin && <div className="flex flex-wrap gap-2" aria-label={`Admin controls for ${pick.member}`}>
                  {editing?.id === pick.id ? <><Button size="sm" disabled={updating === pick.id || !editSport.trim() || !editSelection.trim() || !editOdds} onClick={saveEdit}>{updating === pick.id ? <RefreshCw className="animate-spin" /> : <Check />} Save</Button><Button size="sm" variant="outline" onClick={() => setEditing(null)}><X /> Cancel</Button></> : <>{(['Hit', 'Miss', 'Push'] as const).map((status) => <Button key={status} size="sm" variant={pick.status === status ? 'default' : 'outline'} disabled={updating === pick.id} onClick={() => updateStatus(pick.id, status)}>{status}</Button>)}<Button size="sm" variant="outline" disabled={updating === pick.id} onClick={() => beginEdit(pick)}><Pencil /> Edit</Button><Button size="sm" variant="outline" className="text-red-700 hover:text-red-800" disabled={updating === pick.id} onClick={() => deletePick(pick)}><Trash2 /> Remove</Button></>}
                </div>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-[0_18px_50px_rgba(7,21,47,.08)] ring-1 ring-[#0e2852]/10">
          <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-xl"><Archive className="size-5 text-primary" /> Megalay history</CardTitle><CardDescription>Weekly results at a glance. Select a week to see every individual pick.</CardDescription></CardHeader>
          <CardContent className="p-0">
            {!archiveKeys.length ? <p className="p-6 text-sm text-muted-foreground">No Megalay weeks have been saved yet.</p> : <Accordion className="divide-y">
              {archiveKeys.map((key) => {
                const [season, weekText] = key.split('|');
                const week = Number(weekText);
                const picks = historySubmissions.filter((pick) => pick.season === season && pick.week === week);
                const archivedTicket = tickets.find((entry) => entry.season === season && entry.week === week);
                const finalization = finalizations.find((entry) => entry.season === season && entry.week === week);
                const hits = picks.filter((pick) => pick.status === 'Hit').length;
                const misses = picks.filter((pick) => pick.status === 'Miss').length;
                const pushes = picks.filter((pick) => pick.status === 'Push').length;
                const pending = picks.filter((pick) => pick.status === 'Pending').length;
                return <AccordionItem key={key} value={key} className="border-0 px-5">
                  <AccordionTrigger className="gap-4 py-4 hover:no-underline">
                    <div className="grid min-w-0 flex-1 gap-3 text-left sm:grid-cols-[minmax(150px,1.2fr)_repeat(3,minmax(90px,.7fr))_minmax(160px,1fr)] sm:items-center">
                      <div><div className="flex flex-wrap items-center gap-2"><span className="font-black text-[#07152f]">{season} · Week {week}</span>{finalization && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">Finalized</span>}</div><p className="mt-0.5 text-xs text-muted-foreground">{picks.length} pick{picks.length === 1 ? '' : 's'}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Combined odds</p><p className="font-black">{archivedTicket ? formatOdds(archivedTicket.combinedOdds) : '—'}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Wager</p><p className="font-black">{archivedTicket ? formatMoney(archivedTicket.wager) : '—'}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Payout</p><p className="font-black text-primary">{archivedTicket ? formatMoney(archivedTicket.potentialPayout) : '—'}</p></div>
                      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold"><span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">{hits} Hit</span><span className="rounded-full bg-red-100 px-2 py-1 text-red-800">{misses} Miss</span><span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">{pushes} Push</span><span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{pending} Pending</span></div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    {!picks.length ? <p className="rounded-lg bg-[#f8fbff] px-4 py-5 text-sm text-muted-foreground">No individual picks were saved for this week.</p> : <div className="grid gap-3 sm:grid-cols-2">{picks.map((pick) => <div key={pick.id} className="rounded-xl border bg-[#f8fbff] p-4"><div className="flex items-center justify-between gap-3"><span className="font-black text-[#07152f]">{pick.member}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pick.status === 'Hit' ? 'bg-emerald-100 text-emerald-800' : pick.status === 'Miss' ? 'bg-red-100 text-red-800' : pick.status === 'Push' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{pick.status}</span></div><p className="mt-2 font-semibold">{pick.selection}</p><p className="mt-1 text-xs text-muted-foreground">{pick.sport} · FanDuel {formatOdds(pick.odds)}</p></div>)}</div>}
                  </AccordionContent>
                </AccordionItem>;
              })}
            </Accordion>}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-[0_18px_50px_rgba(7,21,47,.08)] ring-1 ring-[#0e2852]/10">
          <CardHeader><CardTitle className="text-xl">{settings.season} records</CardTitle><CardDescription>Updates automatically whenever a result is recorded for this season.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm"><thead className="border-y bg-[#f8fbff] text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3">Member</th><th className="px-3 py-3 text-center">W</th><th className="px-3 py-3 text-center">L</th><th className="px-3 py-3 text-center">P</th><th className="px-5 py-3 text-right">Win %</th></tr></thead><tbody className="divide-y">{fullRecords.sort((a, b) => b.wins - a.wins || a.losses - b.losses).map((row) => { const decided = row.wins + row.losses; return <tr key={row.member}><td className="px-5 py-3 font-bold">{row.member}</td><td className="px-3 py-3 text-center text-emerald-700">{row.wins}</td><td className="px-3 py-3 text-center text-red-700">{row.losses}</td><td className="px-3 py-3 text-center text-amber-700">{row.pushes}</td><td className="px-5 py-3 text-right font-semibold">{decided ? `${Math.round(row.wins / decided * 100)}%` : '—'}</td></tr>; })}</tbody></table>
          </CardContent>
        </Card>

        {isAdmin && <Card className="border-0 shadow-[0_18px_50px_rgba(7,21,47,.08)] ring-1 ring-[#0e2852]/10">
          <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><Settings2 className="size-5 text-primary" /> Admin settings</CardTitle><CardDescription>Set the active season and week, then open or close submissions.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-4 rounded-xl border border-[#c9ff37]/50 bg-[#f8ffe5] p-4 sm:col-span-2 lg:col-span-4 lg:grid-cols-3">
              <div className="lg:col-span-3"><p className="font-bold text-[#07152f]">Official FanDuel ticket</p><p className="mt-1 text-sm text-muted-foreground">These confirmed figures are visible to every league member on the Megalay board.</p></div>
              <label className="space-y-2 text-sm font-semibold"><span>Final combined odds</span><Input inputMode="text" placeholder="Example: +18450" value={ticketOdds} onChange={(event) => setTicketOdds(event.target.value)} /></label>
              <label className="space-y-2 text-sm font-semibold"><span>Wager</span><Input inputMode="decimal" placeholder="Example: 25" value={ticketWager} onChange={(event) => setTicketWager(event.target.value)} /></label>
              <label className="space-y-2 text-sm font-semibold"><span>Potential payout</span><Input inputMode="decimal" placeholder="Example: 4637.50" value={ticketPayout} onChange={(event) => setTicketPayout(event.target.value)} /></label>
              <Button className="h-11 bg-[#07152f] text-white hover:bg-[#0e2852] lg:col-span-3" disabled={savingTicket || !ticketOdds || !ticketWager || !ticketPayout} onClick={saveTicket}>{savingTicket ? <><RefreshCw className="animate-spin" /> Saving ticket</> : 'Publish ticket details'}</Button>
            </div>
            <label className="space-y-2 text-sm font-semibold"><span>Season</span><Input value={settings.season} onChange={(event) => setSettings((current) => ({ ...current, season: event.target.value }))} /></label>
            <label className="space-y-2 text-sm font-semibold"><span>Active week</span><Input type="number" min="0" max="30" value={settings.activeWeek} onChange={(event) => setSettings((current) => ({ ...current, activeWeek: Number(event.target.value) }))} /></label>
            <label className="space-y-2 text-sm font-semibold"><span>Deadline label</span><Input value={settings.deadlineLabel} onChange={(event) => setSettings((current) => ({ ...current, deadlineLabel: event.target.value }))} /></label>
            <label className="space-y-2 text-sm font-semibold"><span>Submission status</span><Select value={settings.submissionsOpen ? 'open' : 'closed'} onValueChange={(value) => setSettings((current) => ({ ...current, submissionsOpen: value === 'open' }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></label>
            <Button className="h-11 bg-[#07152f] text-white hover:bg-[#0e2852] sm:col-span-2 lg:col-span-4" disabled={savingSettings} onClick={saveSettings}>{savingSettings ? <><RefreshCw className="animate-spin" /> Saving</> : 'Save league settings'}</Button>
            <div className="rounded-xl border border-[#c9ff37]/50 bg-[#f8ffe5] p-4 sm:col-span-2 lg:col-span-4"><p className="font-bold text-[#07152f]">Weekly handoff</p><p className="mt-1 text-sm text-muted-foreground">Finalizes Week {settings.activeWeek} in history, advances to Week {settings.activeWeek + 1}, and opens the next submission window.</p><Button className="mt-3 w-full bg-[#07152f] text-white hover:bg-[#0e2852]" disabled={advancingWeek || !submissions.length} onClick={finalizeAndAdvance}>{advancingWeek ? <><RefreshCw className="animate-spin" /> Finalizing</> : <>Finalize Week {settings.activeWeek} & start Week {settings.activeWeek + 1}</>}</Button></div>
          </CardContent>
        </Card>}
      </section>
    </main>
  );
}
