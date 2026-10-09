import { env } from 'cloudflare:workers';
import { db, decode, pickColumns } from './portal-db';
import { kickSync, queueStatement } from './sheet-sync';
import { easternWeekStart, ODDS_RESERVE_CREDITS } from './odds';
import type { Pick } from './portal';

// Automatic results from final scores (The Odds API /scores). Runs on a
// schedule and from the admin tab. It only settles what a final score settles
// unambiguously; everything else stays Pending for the commissioner:
// - moneyline, spread and game total picks with team, opponent and game date;
// - exactly one completed game in that sport with both teams and that date;
// - moneyline ties stay pending (sportsbook tie rules vary by sport);
// - Champions League stays pending (knockout extra time can't be told apart).
export const RESULTS_WEEKLY_CREDITS = 60;
const COST = 2; // one sport's scores with daysFrom
const RUN_LEASE_MS = 5 * 60 * 1000;
const autoMarkets = ['Moneyline', 'Spread', 'Game total'];
export const ACTOR = 'Automatic result (final score)';

const scoreSports: Record<string, string[]> = {
  NFL: ['americanfootball_nfl'],
  'College Football': ['americanfootball_ncaaf'],
  NBA: ['basketball_nba'],
  'College Basketball': ['basketball_ncaab'],
  MLB: ['baseball_mlb'],
  NHL: ['icehockey_nhl'],
  Soccer: ['soccer_epl'],
};

export type ScoreEvent = { id: string; commence_time: string; completed: boolean; home_team: string; away_team: string; scores: { name: string; score: string }[] | null };
export type Verdict = { status: 'Hit' | 'Miss' | 'Push'; result: string; reason: string; eventId: string } | { status: null; why: string };

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// "Saints" matches "New Orleans Saints"; full names must match exactly.
export const sameTeam = (pick: string, api: string) => { const a = norm(pick), b = norm(api); return Boolean(a) && (a === b || b.endsWith(` ${a}`)); };
const easternDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function grade(pick: Pick, events: ScoreEvent[]): Verdict {
  const d = pick.details;
  if (!autoMarkets.includes(d.market || '')) return { status: null, why: 'market not auto-graded' };
  if (!d.team || !d.opponent || !d.eventDate) return { status: null, why: 'missing team, opponent or date' };
  const matches = events.filter(e => easternDate(e.commence_time) === d.eventDate && ((sameTeam(d.team!, e.home_team) && sameTeam(d.opponent!, e.away_team)) || (sameTeam(d.team!, e.away_team) && sameTeam(d.opponent!, e.home_team))));
  if (matches.length !== 1) return { status: null, why: matches.length ? 'more than one matching game' : 'no matching game' };
  const e = matches[0];
  if (!e.completed || !e.scores) return { status: null, why: 'game not final' };
  const score = (name: string) => { const s = e.scores!.find(x => x.name === name); return s && /^\d+$/.test(s.score) ? Number(s.score) : NaN; };
  const teamName = sameTeam(d.team, e.home_team) ? e.home_team : e.away_team, oppName = teamName === e.home_team ? e.away_team : e.home_team;
  const mine = score(teamName), theirs = score(oppName);
  if (!Number.isFinite(mine) || !Number.isFinite(theirs)) return { status: null, why: 'score unreadable' };
  const result = `${e.away_team} ${score(e.away_team)}, ${e.home_team} ${score(e.home_team)} (final)`;
  const decide = (margin: number, win: string, loss: string, push: string): Verdict => ({ status: margin > 0 ? 'Hit' : margin < 0 ? 'Miss' : 'Push', result, reason: margin > 0 ? win : margin < 0 ? loss : push, eventId: e.id });
  if (d.market === 'Moneyline') {
    if (mine === theirs) return { status: null, why: 'moneyline tie' };
    return decide(mine - theirs, `${teamName} won`, `${teamName} lost`, '');
  }
  const line = Number(d.line);
  if (!d.line || !Number.isFinite(line)) return { status: null, why: 'line unreadable' };
  if (d.market === 'Spread') return decide(mine + line - theirs, `${teamName} ${d.line} covered`, `${teamName} ${d.line} did not cover`, `${teamName} ${d.line} landed on the number`);
  const side = /^\s*over/i.test(d.description || '') ? 1 : /^\s*under/i.test(d.description || '') ? -1 : 0;
  if (!side) return { status: null, why: 'total without over or under' };
  const total = mine + theirs;
  return decide(side * (total - line), `Total ${total} went ${side > 0 ? 'over' : 'under'} ${line}`, `Total ${total} did not go ${side > 0 ? 'over' : 'under'} ${line}`, `Total ${total} landed on ${line}`);
}

export type RunSummary = { ran: boolean; graded: number; pending: number; credits: number; note: string };

export async function refreshResults(now = Date.now()): Promise<RunSummary> {
  if (!env.ODDS_API_KEY) return { ran: false, graded: 0, pending: 0, credits: 0, note: 'Odds API key not configured' };
  const week = easternWeekStart(now), runId = crypto.randomUUID();
  // One run at a time; a run that never finished is ignored after RUN_LEASE_MS.
  const lease = await db().prepare(`INSERT INTO results_runs (id, week_start, started_at, finished_at, credits, graded, note)
    SELECT ?, ?, ?, 0, 0, 0, '' WHERE NOT EXISTS (SELECT 1 FROM results_runs WHERE finished_at = 0 AND started_at > ?)`)
    .bind(runId, week, now, now - RUN_LEASE_MS).run();
  if (!lease.meta.changes) return { ran: false, graded: 0, pending: 0, credits: 0, note: 'Another check is already running' };
  let credits = 0, graded = 0, note = '';
  const today = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  try {
    const rows = (await db().prepare(`SELECT ${pickColumns} FROM submissions WHERE status = 'Pending'`).all()).results.map(r => decode(r));
    // Only picks a final score can settle, from the last 3 days the scores feed covers.
    const oldest = new Date(now - 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const due = rows.filter(p => scoreSports[p.sport] && autoMarkets.includes(p.details.market || '') && p.details.team && p.details.opponent && p.details.eventDate && p.details.eventDate >= oldest && p.details.eventDate <= today);
    const keys = [...new Set(due.flatMap(p => scoreSports[p.sport]))];
    const spent = Number((await db().prepare('SELECT COALESCE(SUM(credits), 0) AS n FROM results_runs WHERE week_start = ?').bind(week).first<{ n: number }>())?.n ?? 0);
    const floor = await db().prepare('SELECT remaining FROM odds_usage WHERE remaining IS NOT NULL ORDER BY week_start DESC LIMIT 1').first<{ remaining: number }>();
    const affordable = Math.max(0, Math.min(Math.floor((RESULTS_WEEKLY_CREDITS - spent) / COST), floor ? Math.floor((floor.remaining - ODDS_RESERVE_CREDITS) / COST) : keys.length));
    if (keys.length > affordable) note = `Credit budget reached; ${keys.length - affordable} sport(s) skipped`;
    const events: Record<string, ScoreEvent[]> = {};
    for (const key of keys.slice(0, affordable)) {
      const url = new URL(`https://api.the-odds-api.com/v4/sports/${key}/scores`);
      url.search = new URLSearchParams({ apiKey: env.ODDS_API_KEY, daysFrom: '3', dateFormat: 'iso' }).toString();
      credits += COST;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const remaining = Number(response.headers.get('x-requests-remaining'));
        if (response.headers.has('x-requests-remaining') && Number.isFinite(remaining)) await db().prepare(`INSERT INTO odds_usage (week_start, credits, remaining) VALUES (?, 0, ?) ON CONFLICT(week_start) DO UPDATE SET remaining = excluded.remaining`).bind(week, Math.floor(remaining)).run();
        if (!response.ok) throw new Error(`Scores HTTP ${response.status}`);
        const body = await response.json();
        events[key] = Array.isArray(body) ? body as ScoreEvent[] : [];
      } catch (error) {
        // Never log the request URL: it carries the API key.
        console.error('results_fetch_failed', { sport: key, reason: error instanceof Error && /^Scores HTTP \d+$/.test(error.message) ? error.message : 'request failed' });
      }
    }
    for (const pick of due) {
      const verdict = grade(pick, scoreSports[pick.sport].flatMap(k => events[k] ?? []));
      if (!verdict.status) continue;
      const at = new Date(now).toISOString(), changeId = crypto.randomUUID();
      const evidence = { result: verdict.result, source: `The Odds API scores, event ${verdict.eventId}`, reason: `Automatic: ${verdict.reason}`, gradedAt: at };
      const after: Pick = { ...pick, status: verdict.status, evidence, revision: pick.revision + 1, updatedAt: at };
      // Same guarded write as a commissioner grade: only if the pick is unchanged and still pending.
      const results = await db().batch([
        db().prepare(`UPDATE submissions SET status = ?, evidence = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'Pending'`).bind(verdict.status, JSON.stringify(evidence), at, pick.id, pick.revision),
        db().prepare(`INSERT INTO pick_changes (id, submission_id, season, week, member, actor, action, before_json, after_json, reason, created_at) SELECT ?, ?, ?, ?, ?, ?, 'grade', ?, ?, ?, ? WHERE changes() = 1`)
          .bind(changeId, pick.id, pick.season, pick.week, pick.member, ACTOR, JSON.stringify(pick), JSON.stringify(after), evidence.reason, at),
        queueStatement(pick.id, after, changeId, changeId),
      ]);
      if (results[0].meta.changes) graded++;
    }
    if (graded) kickSync();
    return { ran: true, graded, pending: rows.length - graded, credits, note };
  } finally {
    await db().prepare('UPDATE results_runs SET finished_at = ?, credits = ?, graded = ?, note = ? WHERE id = ?').bind(Date.now(), credits, graded, note, runId).run();
  }
}
