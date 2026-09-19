import { env } from 'cloudflare:workers';
import { isAdmin } from '@/lib/admin';

const members = ['CJ', 'Brooks', 'Nav', 'Fab', 'Drew', 'Shan', 'Kith', 'Griff', 'Seed', 'Rohan', 'Ryser', 'Jp'];

async function ready() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      season TEXT NOT NULL DEFAULT '2026 Season',
      week INTEGER NOT NULL,
      member TEXT NOT NULL,
      sport TEXT NOT NULL,
      selection TEXT NOT NULL,
      odds INTEGER NOT NULL,
      stake REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Pending',
      duplicate_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_settings (
      id INTEGER PRIMARY KEY,
      season TEXT NOT NULL DEFAULT '2026 Season',
      active_week INTEGER NOT NULL DEFAULT 1,
      submissions_open INTEGER NOT NULL DEFAULT 1,
      deadline_label TEXT NOT NULL DEFAULT 'Sunday, 12:45 PM ET'
    )`),
    env.DB.prepare("INSERT OR IGNORE INTO portal_settings (id, season, active_week, submissions_open, deadline_label) VALUES (1, '2026 Season', 1, 1, 'Sunday, 12:45 PM ET')"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS weekly_cycles (
      id TEXT PRIMARY KEY,
      season TEXT NOT NULL,
      week INTEGER NOT NULL,
      pick_count INTEGER NOT NULL,
      finalized_at TEXT NOT NULL,
      UNIQUE(season, week)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS weekly_tickets (
      id TEXT PRIMARY KEY,
      season TEXT NOT NULL,
      week INTEGER NOT NULL,
      combined_odds INTEGER,
      wager REAL,
      potential_payout REAL,
      updated_at TEXT NOT NULL,
      UNIQUE(season, week)
    )`),
  ]);
  const columns = await env.DB.prepare('PRAGMA table_info(submissions)').all();
  if (!columns.results.some((column) => column.name === 'season')) {
    try { await env.DB.prepare("ALTER TABLE submissions ADD COLUMN season TEXT NOT NULL DEFAULT '2026 Season'").run(); } catch { /* another request may have completed the migration */ }
  }
  const indexColumns = await env.DB.prepare('PRAGMA index_info(one_pick_per_member_week)').all();
  const indexNames = indexColumns.results.map((column) => column.name);
  if (indexNames.join(',') !== 'season,week,member') {
    await env.DB.batch([
      env.DB.prepare('DROP INDEX IF EXISTS one_pick_per_member_week'),
      env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS one_pick_per_member_week ON submissions (season, week, member)'),
    ]);
  }
  await env.DB.prepare("UPDATE submissions SET duplicate_key = season || '|' || duplicate_key WHERE duplicate_key NOT LIKE season || '|%'").run();
}

export async function GET(request: Request) {
  await ready();
  const settings = await env.DB.prepare('SELECT season, active_week AS activeWeek, submissions_open AS submissionsOpen, deadline_label AS deadlineLabel FROM portal_settings WHERE id = 1').first();
  const activeSeason = String(settings?.season ?? '2026 Season');
  const activeWeek = Number(settings?.activeWeek ?? 1);
  const [current, records, history, finalizations, tickets] = await Promise.all([
    env.DB.prepare('SELECT id, season, week, member, sport, selection, odds, status, created_at AS createdAt FROM submissions WHERE season = ? AND week = ? ORDER BY created_at').bind(activeSeason, activeWeek).all(),
    env.DB.prepare(`SELECT member,
      SUM(CASE WHEN status = 'Hit' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN status = 'Miss' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN status = 'Push' THEN 1 ELSE 0 END) AS pushes,
      COUNT(*) AS picks
      FROM submissions WHERE season = ? GROUP BY member ORDER BY wins DESC, losses ASC, member ASC`).bind(activeSeason).all(),
    env.DB.prepare('SELECT id, season, week, member, sport, selection, odds, status, created_at AS createdAt FROM submissions ORDER BY season DESC, week DESC, created_at ASC').all(),
    env.DB.prepare('SELECT season, week, pick_count AS pickCount, finalized_at AS finalizedAt FROM weekly_cycles ORDER BY season DESC, week DESC').all(),
    env.DB.prepare('SELECT season, week, combined_odds AS combinedOdds, wager, potential_payout AS potentialPayout, updated_at AS updatedAt FROM weekly_tickets ORDER BY season DESC, week DESC').all(),
  ]);
  const admin = isAdmin(request);
  const activeTicket = tickets.results.find((ticket) => ticket.season === activeSeason && Number(ticket.week) === activeWeek) ?? null;
  return Response.json({ week: activeWeek, open: Boolean(settings?.submissionsOpen), settings, ticket: activeTicket, tickets: tickets.results, isAdmin: admin, members, submissions: current.results, records: records.results, historySubmissions: history.results, finalizations: finalizations.results }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  let member = '';
  let activeWeek = 0;
  let stage = 'validation';
  try {
    await ready();
    const settings = await env.DB.prepare('SELECT season, active_week AS activeWeek, submissions_open AS submissionsOpen FROM portal_settings WHERE id = 1').first();
    const season = String(settings?.season ?? '2026 Season');
    activeWeek = Number(settings?.activeWeek ?? 1);
    const body = await request.json() as Record<string, unknown>;
    member = String(body.member ?? '').trim();
    const sport = String(body.sport ?? '').trim();
    const selection = String(body.selection ?? '').trim();
    const odds = Number(body.odds);
    if (!members.includes(member) || !sport || selection.length < 3 || !Number.isInteger(odds) || (odds > -100 && odds < 100)) {
      return Response.json({ error: 'Check the member, sport, selection, and American odds.' }, { status: 400 });
    }
    if ((body.week !== undefined && Number(body.week) !== activeWeek) || (body.season !== undefined && body.season !== season)) {
      return Response.json({ error: 'The active week has changed. Refresh the board before submitting.' }, { status: 409 });
    }
    const duplicateKey = `${season}|${activeWeek}|${selection.toLowerCase().replace(/\s+/g, ' ')}`;
    // Check the authoritative record before calling the Sheet. Retrying a saved
    // pick is safe, including when its original success response was lost.
    const existing = await env.DB.prepare('SELECT id, season, week, member, sport, selection, odds, status, duplicate_key, created_at AS createdAt FROM submissions WHERE season = ? AND week = ? AND member = ? LIMIT 1').bind(season, activeWeek, member).first();
    if (existing) {
      if (existing.duplicate_key === duplicateKey && existing.sport === sport && Number(existing.odds) === odds) {
        return Response.json({ ...existing, alreadySaved: true });
      }
      return Response.json({ error: `${member} already has a Week ${activeWeek} pick. Ask the commissioner to edit or remove it before submitting a replacement.` }, { status: 409 });
    }
    if (!settings?.submissionsOpen) return Response.json({ error: 'Submissions are currently closed.' }, { status: 403 });
    const duplicate = await env.DB.prepare('SELECT member FROM submissions WHERE duplicate_key = ? LIMIT 1').bind(duplicateKey).first();
    if (duplicate) return Response.json({ error: `That selection has already been submitted by ${duplicate.member} this week.` }, { status: 409 });
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    let sheetSynced = false;
    if (env.PORTAL_SHEET_WEBHOOK_URL && env.PORTAL_SHEET_SECRET) {
      stage = 'sheet';
      const sheetResponse = await fetch(env.PORTAL_SHEET_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ secret: env.PORTAL_SHEET_SECRET, id, week: activeWeek, season, member, sport, selection, odds, stake: 1, notes: `${season} · Megalay Portal` }),
      });
      if (!sheetResponse.ok) throw new Error(`Sheet HTTP ${sheetResponse.status}`);
      const sheetResult = await sheetResponse.json() as { ok?: boolean; error?: string };
      if (!sheetResult.ok) {
        console.error('submission_failed', { member, week: activeWeek, stage, reason: sheetResult.error });
        return Response.json({ error: `Your pick was not saved to the portal. ${sheetResult.error ?? 'The connected sheet could not accept it.'} Please retry; if it persists, ask the commissioner to check the sheet.` }, { status: 502 });
      }
      sheetSynced = true;
    }
    stage = 'database';
    await env.DB.prepare("INSERT INTO submissions (id, season, week, member, sport, selection, odds, stake, status, duplicate_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'Pending', ?, ?)")
      .bind(id, season, activeWeek, member, sport, selection, odds, duplicateKey, createdAt).run();
    console.info('submission_saved', { id, member, week: activeWeek });
    return Response.json({ id, season, week: activeWeek, member, sport, selection, odds, status: 'Pending', createdAt, sheetSynced }, { status: 201 });
  } catch (error) {
    console.error('submission_failed', { member, week: activeWeek, stage, reason: error instanceof Error ? error.message : 'Unknown error' });
    if (error instanceof SyntaxError && stage === 'validation') return Response.json({ error: 'The pick could not be read. Please try again.' }, { status: 400 });
    return Response.json({ error: stage === 'sheet'
      ? 'Your pick was not saved to the portal because the connected sheet did not respond correctly. Your form is still here; please retry.'
      : 'We could not confirm your pick was saved. Refresh the board and retry if your pick is missing.' }, { status: stage === 'sheet' ? 502 : 503 });
  }
}

export async function PATCH(request: Request) {
  await ready();
  if (!isAdmin(request)) return Response.json({ error: 'Commissioner access required.' }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id ?? '').trim();
  const status = String(body.status ?? '').trim();
  if (!id || !['Pending', 'Hit', 'Miss', 'Push'].includes(status)) {
    return Response.json({ error: 'Choose a valid result.' }, { status: 400 });
  }

  const submission = await env.DB.prepare('SELECT id FROM submissions WHERE id = ? LIMIT 1').bind(id).first();
  if (!submission) return Response.json({ error: 'That pick could not be found.' }, { status: 404 });

  if (env.PORTAL_SHEET_WEBHOOK_URL && env.PORTAL_SHEET_SECRET) {
    const sheetStatus = status === 'Hit' ? 'Win' : status === 'Miss' ? 'Loss' : status;
    const sheetResponse = await fetch(env.PORTAL_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: env.PORTAL_SHEET_SECRET, action: 'updateStatus', id, status: sheetStatus }),
    });
    const sheetResult = await sheetResponse.json() as { ok?: boolean; error?: string };
    if (!sheetResult.ok) {
      return Response.json({ error: sheetResult.error ?? 'The Google Sheet could not update this result.' }, { status: 502 });
    }
  }

  await env.DB.prepare('UPDATE submissions SET status = ? WHERE id = ?').bind(status, id).run();
  return Response.json({ id, status });
}

export async function PUT(request: Request) {
  await ready();
  if (!isAdmin(request)) return Response.json({ error: 'Commissioner access required.' }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id ?? '').trim();
  const sport = String(body.sport ?? '').trim();
  const selection = String(body.selection ?? '').trim();
  const odds = Number(body.odds);
  if (!id || !sport || selection.length < 3 || !Number.isInteger(odds) || (odds > -100 && odds < 100)) {
    return Response.json({ error: 'Check the sport, selection, and American odds.' }, { status: 400 });
  }
  const existing = await env.DB.prepare('SELECT season, week FROM submissions WHERE id = ? LIMIT 1').bind(id).first();
  if (!existing) return Response.json({ error: 'That pick could not be found.' }, { status: 404 });
  const duplicateKey = `${String(existing.season)}|${Number(existing.week)}|${selection.toLowerCase().replace(/\s+/g, ' ')}`;
  const duplicate = await env.DB.prepare('SELECT id FROM submissions WHERE duplicate_key = ? AND id != ? LIMIT 1').bind(duplicateKey, id).first();
  if (duplicate) return Response.json({ error: 'That selection has already been submitted this week.' }, { status: 409 });

  if (env.PORTAL_SHEET_WEBHOOK_URL && env.PORTAL_SHEET_SECRET) {
    const response = await fetch(env.PORTAL_SHEET_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret: env.PORTAL_SHEET_SECRET, action: 'updateSubmission', id, sport, selection, odds }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    if (!result.ok) return Response.json({ error: result.error ?? 'The Google Sheet could not update this pick.' }, { status: 502 });
  }
  await env.DB.prepare('UPDATE submissions SET sport = ?, selection = ?, odds = ?, duplicate_key = ? WHERE id = ?').bind(sport, selection, odds, duplicateKey, id).run();
  return Response.json({ id, sport, selection, odds });
}

export async function DELETE(request: Request) {
  await ready();
  if (!isAdmin(request)) return Response.json({ error: 'Commissioner access required.' }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id ?? '').trim();
  if (!id) return Response.json({ error: 'Choose a pick to remove.' }, { status: 400 });
  const existing = await env.DB.prepare('SELECT id FROM submissions WHERE id = ? LIMIT 1').bind(id).first();
  if (!existing) return Response.json({ error: 'That pick could not be found.' }, { status: 404 });

  if (env.PORTAL_SHEET_WEBHOOK_URL && env.PORTAL_SHEET_SECRET) {
    const response = await fetch(env.PORTAL_SHEET_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret: env.PORTAL_SHEET_SECRET, action: 'deleteSubmission', id }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    if (!result.ok) return Response.json({ error: result.error ?? 'The Google Sheet could not remove this pick.' }, { status: 502 });
  }
  await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run();
  return Response.json({ id, deleted: true });
}
