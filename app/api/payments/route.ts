import { isAdmin } from '@/lib/admin';
import { db, safeWrite } from '@/lib/portal-db';
import { members } from '@/lib/portal';
import { paymentKinds, type PaymentKind } from '@/lib/payments';

// The commissioner adds a payment the Venmo routine couldn't see (cash, another app)
// or removes one recorded by mistake.
const fail = (error: string, status = 400) => Response.json({ error }, { status });
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
async function guard(request: Request) {
  if (!safeWrite(request)) return fail('Invalid request origin.', 403);
  if (!isAdmin(request)) return fail('Admin access required.', 403);
  try { return await request.json() as Record<string, unknown>; } catch { return fail('Send JSON.'); }
}

export async function POST(request: Request) {
  const body = await guard(request); if (body instanceof Response) return body;
  const settings = await db().prepare('SELECT season, active_week AS activeWeek FROM portal_settings WHERE id = 1').first<{ season: string; activeWeek: number }>();
  if (!settings) return fail('League settings are unavailable.', 503);
  const kind = str(body.kind) as PaymentKind, member = str(body.member), week = Number(body.week), amount = Number(body.amount);
  if (!paymentKinds.includes(kind)) return fail('Choose base, boost, re-up or deposit.');
  if (kind !== 'deposit' && !members.includes(member)) return fail('Choose the member who paid.');
  if (!Number.isInteger(week) || week < 0 || week > settings.activeWeek) return fail('Choose a week that has started.');
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return fail('Enter an amount.');
  const now = new Date().toISOString(), id = `manual-${crypto.randomUUID()}`;
  await db().prepare(`INSERT INTO payments (id, season, week, member, kind, amount, note, paid_at, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`)
    .bind(id, settings.season, week, kind === 'deposit' ? '' : member, kind, Math.round(amount * 100) / 100, str(body.note).slice(0, 200), now, now).run();
  return Response.json({ ok: true, id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const body = await guard(request); if (body instanceof Response) return body;
  const removed = await db().prepare('DELETE FROM payments WHERE id = ?').bind(str(body.id)).run();
  return removed.meta.changes ? Response.json({ ok: true }) : fail('That payment no longer exists. Refresh the board.', 404);
}
