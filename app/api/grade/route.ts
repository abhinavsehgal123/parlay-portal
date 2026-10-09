import { db, decode, pickColumns } from '@/lib/portal-db';
import { graderToken } from '@/lib/schedule-auth';
import { kickSync, queueStatement } from '@/lib/sheet-sync';
import type { Pick } from '@/lib/portal';

// Research grading by the scheduled Claude job (PORTAL_GRADER_TOKEN). It covers
// what final scores can't settle: player props, "Other" bets, leagues the score
// feed lacks. Every grade needs the stat or result it relied on and a source
// link, and uses the same guarded write as a commissioner grade, so a pick that
// changed or was already graded is never overwritten. Ambiguous picks are simply
// not posted and stay Pending.
export const ACTOR = 'Automatic result (Claude, web research)';
const statuses = ['Hit', 'Miss', 'Push', 'Void'];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const denied = () => Response.json({ error: 'Not authorized to grade.' }, { status: 401 });

// Pending picks whose game date isn't in the future (or that have no date).
export async function GET(request: Request) {
  if (!graderToken(request)) return denied();
  const rows = (await db().prepare(`SELECT ${pickColumns} FROM submissions WHERE status = 'Pending' ORDER BY season, week, member`).all()).results.map(r => decode(r));
  const day = today();
  const picks = rows.filter(p => !p.details.eventDate || p.details.eventDate <= day)
    .map(({ id, revision, season, week, member, sport, selection, odds, details, createdAt }) => ({ id, revision, season, week, member, sport, selection, odds, details, submittedAt: createdAt }));
  return Response.json({ today: day, picks }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!graderToken(request)) return denied();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Send JSON.' }, { status: 400 }); }
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const id = str(body.id), revision = Number(body.revision), status = str(body.status);
  const result = str(body.result), source = str(body.source), reason = str(body.reason);
  if (!id || !Number.isInteger(revision)) return fail('Send the pick id and revision.');
  if (!statuses.includes(status)) return fail('Status must be Hit, Miss, Push or Void.');
  if (!result || !reason) return fail('Send the result relied on and the reason.');
  if (!/^https?:\/\/\S+$/i.test(source)) return fail('Send a full http or https source link.');
  const row = await db().prepare(`SELECT ${pickColumns} FROM submissions WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  if (!row) return fail('No such pick.', 404);
  const pick = decode(row);
  if (pick.status !== 'Pending' || pick.revision !== revision) return fail('The pick changed or is already graded; it was left as is.', 409);
  if (pick.details.eventDate && pick.details.eventDate > today()) return fail('That game has not happened yet.', 409);
  const at = new Date().toISOString(), changeId = crypto.randomUUID();
  const evidence = { result: result.slice(0, 1000), source: source.slice(0, 2000), reason: `Claude: ${reason.slice(0, 600)}`, gradedAt: at };
  const after: Pick = { ...pick, status: status as Pick['status'], evidence, revision: pick.revision + 1, updatedAt: at };
  const out = await db().batch([
    db().prepare(`UPDATE submissions SET status = ?, evidence = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'Pending'`).bind(status, JSON.stringify(evidence), at, id, revision),
    db().prepare(`INSERT INTO pick_changes (id, submission_id, season, week, member, actor, action, before_json, after_json, reason, created_at) SELECT ?, ?, ?, ?, ?, ?, 'grade', ?, ?, ?, ? WHERE changes() = 1`)
      .bind(changeId, id, pick.season, pick.week, pick.member, ACTOR, JSON.stringify(pick), JSON.stringify(after), evidence.reason, at),
    queueStatement(id, after, changeId, changeId),
  ]);
  if (!out[0].meta.changes) return fail('The pick changed or is already graded; it was left as is.', 409);
  kickSync();
  return Response.json({ graded: true, id, status });
}
