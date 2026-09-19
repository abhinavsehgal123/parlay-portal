import { env } from 'cloudflare:workers';
import { isAdmin } from '@/lib/admin';

async function ready() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_settings (
    id INTEGER PRIMARY KEY,
    season TEXT NOT NULL DEFAULT '2026 Season',
    active_week INTEGER NOT NULL DEFAULT 1,
    submissions_open INTEGER NOT NULL DEFAULT 1,
    deadline_label TEXT NOT NULL DEFAULT 'Sunday, 12:45 PM ET'
  )`).run();
  await env.DB.prepare("INSERT OR IGNORE INTO portal_settings (id, season, active_week, submissions_open, deadline_label) VALUES (1, '2026 Season', 1, 1, 'Sunday, 12:45 PM ET')").run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS weekly_cycles (
    id TEXT PRIMARY KEY,
    season TEXT NOT NULL,
    week INTEGER NOT NULL,
    pick_count INTEGER NOT NULL,
    finalized_at TEXT NOT NULL,
    UNIQUE(season, week)
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS weekly_tickets (
    id TEXT PRIMARY KEY,
    season TEXT NOT NULL,
    week INTEGER NOT NULL,
    combined_odds INTEGER,
    wager REAL,
    potential_payout REAL,
    updated_at TEXT NOT NULL,
    UNIQUE(season, week)
  )`).run();
}

export async function PATCH(request: Request) {
  await ready();
  if (!isAdmin(request)) {
    return Response.json({ error: 'Commissioner access required.' }, { status: 403 });
  }
  const body = await request.json() as Record<string, unknown>;
  if (body.action === 'saveTicket') {
    const settings = await env.DB.prepare('SELECT season, active_week AS activeWeek FROM portal_settings WHERE id = 1').first();
    const season = String(settings?.season ?? '2026 Season');
    const week = Number(settings?.activeWeek ?? 1);
    const combinedOdds = Number(body.combinedOdds);
    const wager = Number(body.wager);
    const potentialPayout = Number(body.potentialPayout);
    if (!Number.isInteger(combinedOdds) || (combinedOdds > -100 && combinedOdds < 100) || !Number.isFinite(wager) || wager <= 0 || !Number.isFinite(potentialPayout) || potentialPayout <= 0) {
      return Response.json({ error: 'Check the combined odds, wager, and potential payout.' }, { status: 400 });
    }
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO weekly_tickets (id, season, week, combined_odds, wager, potential_payout, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(season, week) DO UPDATE SET combined_odds = excluded.combined_odds, wager = excluded.wager, potential_payout = excluded.potential_payout, updated_at = excluded.updated_at`)
      .bind(`${season}|${week}`, season, week, combinedOdds, wager, potentialPayout, updatedAt).run();
    return Response.json({ season, week, combinedOdds, wager, potentialPayout, updatedAt });
  }
  if (body.action === 'finalizeAndAdvance') {
    const settings = await env.DB.prepare('SELECT season, active_week AS activeWeek, deadline_label AS deadlineLabel FROM portal_settings WHERE id = 1').first();
    const currentSeason = String(settings?.season ?? '2026 Season');
    const currentWeek = Number(settings?.activeWeek ?? 1);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM submissions WHERE season = ? AND week = ?').bind(currentSeason, currentWeek).first();
    const pickCount = Number(count?.count ?? 0);
    if (!pickCount) return Response.json({ error: 'Add at least one pick before finalizing this week.' }, { status: 400 });
    const finalizedAt = new Date().toISOString();
    const nextWeek = currentWeek + 1;
    await env.DB.batch([
      env.DB.prepare('INSERT OR REPLACE INTO weekly_cycles (id, season, week, pick_count, finalized_at) VALUES (?, ?, ?, ?, ?)').bind(`${currentSeason}|${currentWeek}`, currentSeason, currentWeek, pickCount, finalizedAt),
      env.DB.prepare('UPDATE portal_settings SET active_week = ?, submissions_open = 1 WHERE id = 1').bind(nextWeek),
    ]);
    return Response.json({ season: currentSeason, completedWeek: currentWeek, nextWeek, pickCount, finalizedAt, submissionsOpen: true, deadlineLabel: settings?.deadlineLabel });
  }
  const season = String(body.season ?? '').trim();
  const activeWeek = Number(body.activeWeek);
  const deadlineLabel = String(body.deadlineLabel ?? '').trim();
  const submissionsOpen = Boolean(body.submissionsOpen);
  if (!season || !Number.isInteger(activeWeek) || activeWeek < 0 || activeWeek > 30 || !deadlineLabel) {
    return Response.json({ error: 'Check the season, week, and deadline.' }, { status: 400 });
  }
  await env.DB.prepare('UPDATE portal_settings SET season = ?, active_week = ?, submissions_open = ?, deadline_label = ? WHERE id = 1')
    .bind(season, activeWeek, submissionsOpen ? 1 : 0, deadlineLabel).run();
  return Response.json({ season, activeWeek, submissionsOpen, deadlineLabel });
}
