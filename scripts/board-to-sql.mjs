// Builds INSERT statements that recreate the portal's records from its
// public board API (GET /api/submissions), for moving to a new database that
// already has the schema from the drizzle migrations.
// Usage: node scripts/board-to-sql.mjs <portal URL or saved board JSON> > import.sql
//
// The board carries every stored field except a few that are derived here:
// submissions.duplicate_key and stake (always 1), weekly_cycles.id,
// weekly_tickets.id and updated_at, missed_submissions.id and created_at.
// Not carried over: the sheet sync queue (let it drain first), and the odds
// cache and usage counters (they rebuild themselves).
import { readFileSync } from 'node:fs';

const source = process.argv[2];
if (!source) throw new Error('Pass the portal URL or a saved board JSON file.');
const board = /^https?:\/\//.test(source)
  ? await (await fetch(new URL('/api/submissions', source), { headers: { 'cache-control': 'no-store' } })).json()
  : JSON.parse(readFileSync(source, 'utf8'));
if (!board?.settings || !Array.isArray(board.historySubmissions)) throw new Error('That does not look like a portal board.');

const sql = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${String(v).replace(/'/g, "''")}'`;
const row = (table, values) => `INSERT INTO ${table} (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).map(sql).join(', ')});`;
const snapshotAt = new Date().toISOString();
const out = [`-- OFF League portal records from ${/^https?:/.test(source) ? new URL(source).host : 'a saved board'}, ${snapshotAt}`];

const s = board.settings;
out.push(`INSERT OR REPLACE INTO portal_settings (id, season, active_week, submissions_open, deadline_label) VALUES (1, ${sql(s.season)}, ${sql(Number(s.activeWeek))}, ${sql(Boolean(s.submissionsOpen))}, ${sql(s.deadlineLabel)});`);
for (const p of board.historySubmissions) out.push(row('submissions', {
  id: p.id, season: p.season, week: p.week, member: p.member, sport: p.sport, selection: p.selection, odds: p.odds, stake: 1, status: p.status,
  duplicate_key: `${p.season}|${p.week}|${p.selection.toLowerCase().replace(/\s+/g, ' ')}`,
  created_at: p.createdAt, updated_at: p.updatedAt ?? '', details: JSON.stringify(p.details ?? {}), evidence: JSON.stringify(p.evidence ?? {}), revision: p.revision ?? 0,
}));
for (const c of board.changes ?? []) out.push(row('pick_changes', {
  id: c.id, submission_id: c.submissionId, season: c.season, week: c.week, member: c.member, actor: c.actor, action: c.action,
  before_json: JSON.stringify(c.before ?? {}), after_json: JSON.stringify(c.after ?? {}), reason: c.reason ?? '', created_at: c.createdAt,
}));
for (const f of board.finalizations ?? []) out.push(row('weekly_cycles', { id: `${f.season}|${f.week}`, season: f.season, week: f.week, pick_count: f.pickCount, finalized_at: f.finalizedAt }));
for (const t of board.tickets ?? []) out.push(row('weekly_tickets', { id: `${t.season}|${t.week}`, season: t.season, week: t.week, combined_odds: t.combinedOdds, wager: t.wager, potential_payout: t.potentialPayout, updated_at: snapshotAt, ...(t.result === undefined ? {} : { result: t.result, result_note: t.resultNote ?? '' }) }));
for (const m of board.missedSubmissions ?? []) {
  const finalized = (board.finalizations ?? []).find(f => f.season === m.season && f.week === m.week)?.finalizedAt;
  out.push(row('missed_submissions', { id: `${m.season}|${m.week}|${m.member}`, season: m.season, week: m.week, member: m.member, reason: m.reason, created_at: finalized ?? snapshotAt }));
}
console.log(out.join('\n'));
console.error(`${board.historySubmissions.length} picks, ${(board.changes ?? []).length} changes, ${(board.finalizations ?? []).length} finalized weeks, ${(board.tickets ?? []).length} tickets, ${(board.missedSubmissions ?? []).length} missed submissions.`);
