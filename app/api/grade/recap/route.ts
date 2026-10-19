import { db } from '@/lib/portal-db';
import { graderToken } from '@/lib/schedule-auth';

// The week's recap, saved by the Tuesday Claude routine (PORTAL_GRADER_TOKEN) after it
// finalizes the week. Only finalized weeks take a recap; saving again replaces it.
export async function POST(request: Request) {
  if (!graderToken(request)) return Response.json({ error: 'Not authorized to save recaps.' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Send JSON.' }, { status: 400 }); }
  const season = typeof body.season === 'string' ? body.season.trim() : '', week = Number(body.week);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!season || !Number.isInteger(week) || week < 0 || week > 60) return Response.json({ error: 'Send the season and week.' }, { status: 400 });
  if (text.length < 20 || text.length > 3000) return Response.json({ error: 'The recap must be 20 to 3,000 characters.' }, { status: 400 });
  const at = new Date().toISOString();
  const saved = await db().prepare(`INSERT INTO weekly_recaps (id, season, week, text, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM weekly_cycles WHERE season = ? AND week = ?)
    ON CONFLICT(season, week) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`)
    .bind(`${season}|${week}`, season, week, text, at, at, season, week).run();
  if (!saved.meta.changes) return Response.json({ error: 'That week is not finalized yet.' }, { status: 409 });
  return Response.json({ saved: true, season, week });
}
