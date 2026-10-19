import { db } from '@/lib/portal-db';
import { graderToken } from '@/lib/schedule-auth';
import { kindFromNote, memberFrom, weekAt, weekFromNote, type PaymentKind } from '@/lib/payments';
import { lowScorer } from '@/lib/sleeper';

// Venmo receipts sent by the Claude Venmo routine (PORTAL_GRADER_TOKEN). The routine
// reads the commissioner's Venmo emails and sends two kinds:
// - "received": a payment to the commissioner, recorded only when it's from a league
//   member and its note is about the bet (mega, megalay, bet, re-up, boost, juice, week N);
// - "fanduel": the commissioner funding FanDuel from Venmo, recorded as a deposit.
// Everything else is skipped and not stored. The Venmo transaction ID is the record's
// ID, so sending the same receipt again changes nothing.
type Receipt = { id?: unknown; type?: unknown; paidAt?: unknown; from?: unknown; amount?: unknown; note?: unknown };
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';

export async function POST(request: Request) {
  if (!graderToken(request)) return Response.json({ error: 'Not authorized to record payments.' }, { status: 401 });
  let body: { payments?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Send JSON.' }, { status: 400 }); }
  if (!Array.isArray(body.payments) || body.payments.length > 200) return Response.json({ error: 'Send {payments: [...]} (at most 200).' }, { status: 400 });
  const settings = await db().prepare('SELECT season, active_week AS activeWeek FROM portal_settings WHERE id = 1').first<{ season: string; activeWeek: number }>();
  if (!settings) return Response.json({ error: 'League settings are unavailable.' }, { status: 503 });
  const finalized = (await db().prepare('SELECT week, finalized_at AS finalizedAt FROM weekly_cycles WHERE season = ?').bind(settings.season).all<{ week: number; finalizedAt: string }>()).results;
  const basePayers = new Map<number, string | null>();
  const basePayer = async (week: number) => {
    if (!basePayers.has(week)) basePayers.set(week, (await lowScorer(week - 1))?.member ?? null);
    return basePayers.get(week)!;
  };
  const recorded: { id: string; week: number; member: string; kind: PaymentKind; amount: number }[] = [], skipped: { id: string; reason: string }[] = [];
  const now = new Date().toISOString();
  for (const raw of body.payments as Receipt[]) {
    const id = str(raw.id), type = str(raw.type), paidAt = str(raw.paidAt), note = str(raw.note).slice(0, 200), amount = Number(raw.amount);
    const skip = (reason: string) => { skipped.push({ id: id || '(no id)', reason }); };
    if (!/^[A-Za-z0-9]{6,40}$/.test(id)) { skip('missing or invalid Venmo transaction ID'); continue; }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(paidAt)) { skip('paidAt must be an ISO time in UTC'); continue; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) { skip('invalid amount'); continue; }
    let member = '', kind: PaymentKind | null = null, week = weekAt(paidAt, finalized, settings.activeWeek);
    if (type === 'fanduel') kind = 'deposit';
    else if (type === 'received') {
      member = memberFrom(str(raw.from));
      if (!member) { skip('not from a league member'); continue; }
      week = weekFromNote(note) ?? week;
      if (week < 0 || week > settings.activeWeek) { skip(`note names week ${week}, which isn't open yet`); continue; }
      kind = kindFromNote(note, amount, (await basePayer(week)) === member);
      if (!kind) { skip('note is not about the bet'); continue; }
    } else { skip('type must be "received" or "fanduel"'); continue; }
    const saved = await db().prepare(`INSERT INTO payments (id, season, week, member, kind, amount, note, paid_at, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'venmo', ?) ON CONFLICT(id) DO NOTHING`).bind(id, settings.season, week, member, kind, amount, note, paidAt, now).run();
    if (saved.meta.changes) recorded.push({ id, week, member, kind, amount });
    else skip('already recorded');
  }
  return Response.json({ recorded, skipped });
}
