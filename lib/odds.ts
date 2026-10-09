import { env } from 'cloudflare:workers';
import { db } from './portal-db';
import { oddsSports } from './portal';
export { oddsSports };

// FanDuel game lines via The Odds API, sized for its free plan (500 credits a
// month). Each refresh of one sport costs 3 credits (h2h, spreads, totals).
// Lines are cached per sport, refreshed only when someone browses that sport,
// and refreshes stop at a weekly budget or a reserve floor. The budget is
// weekly because the league browses mostly in the days before each Thursday
// target; 100 credits a week stays under 500 a month. Manual pick entry never
// depends on this module.
export const ODDS_TTL_MS = 4 * 60 * 60 * 1000;
export const ODDS_RETRY_MS = 10 * 60 * 1000;
export const ODDS_WEEKLY_CREDITS = 100;
export const ODDS_RESERVE_CREDITS = 25;
export const ODDS_WINDOW_DAYS = 7;
const MARKETS = ['h2h', 'spreads', 'totals'];
const COST = MARKETS.length;

export type OddsOutcome = { name: string; price: number; point?: number };
export type OddsEvent = { id: string; commence: string; home: string; away: string; h2h: OddsOutcome[]; spreads: OddsOutcome[]; totals: OddsOutcome[] };
export type OddsBoard = { sport: string; label: string; events: OddsEvent[]; fetchedAt: string | null; stale: boolean; paused: boolean; unavailable: boolean };

type Raw = { id?: unknown; commence_time?: unknown; home_team?: unknown; away_team?: unknown; bookmakers?: { key?: unknown; markets?: { key?: unknown; outcomes?: { name?: unknown; price?: unknown; point?: unknown }[] }[] }[] };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// Keeps only FanDuel prices with valid American odds; drops anything else the
// provider returns so the browser never shows invented or malformed lines.
export function normalize(raw: unknown, now: number): OddsEvent[] {
  if (!Array.isArray(raw)) return [];
  const until = now + ODDS_WINDOW_DAYS * 86400000;
  const events: OddsEvent[] = [];
  for (const e of raw as Raw[]) {
    const id = str(e.id), home = str(e.home_team), away = str(e.away_team), commence = str(e.commence_time), start = Date.parse(commence);
    if (!id || !home || !away || !Number.isFinite(start) || start < now || start > until) continue;
    const book = e.bookmakers?.find(b => b.key === 'fanduel');
    if (!book) continue;
    const market = (key: string) => (book.markets?.find(m => m.key === key)?.outcomes ?? [])
      .map(o => ({ name: str(o.name), price: Number(o.price), ...(typeof o.point === 'number' ? { point: o.point } : {}) }))
      .filter(o => o.name && Number.isInteger(o.price) && Math.abs(o.price) >= 100 && (key === 'h2h' || (o.point !== undefined && Number.isFinite(o.point))));
    const event = { id, commence, home, away, h2h: market('h2h'), spreads: market('spreads'), totals: market('totals') };
    if (event.h2h.length || event.spreads.length || event.totals.length) events.push(event);
  }
  return events.sort((a, b) => Date.parse(a.commence) - Date.parse(b.commence));
}

// The Monday (Eastern) that starts the budget week containing `ms`, as YYYY-MM-DD.
export function easternWeekStart(ms: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(ms);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) - sinceMonday)).toISOString().slice(0, 10);
}

export async function getOdds(sportKey: string, now = Date.now()): Promise<OddsBoard | null> {
  const sport = oddsSports.find(s => s.key === sportKey);
  if (!sport) return null;
  const read = () => db().prepare('SELECT payload, fetched_at AS fetchedAt FROM odds_cache WHERE sport_key = ?').bind(sport.key).first<{ payload: string; fetchedAt: number }>();
  const board = (row: { payload: string; fetchedAt: number } | null, paused: boolean, unavailable: boolean): OddsBoard => {
    const fetched = row?.fetchedAt ? row.fetchedAt : 0;
    let events: OddsEvent[] = [];
    try { events = fetched ? (JSON.parse(row!.payload) as OddsEvent[]).filter(e => Date.parse(e.commence) > now) : []; } catch { events = []; }
    return { sport: sport.key, label: sport.label, events, fetchedAt: fetched ? new Date(fetched).toISOString() : null, stale: Boolean(fetched) && now - fetched > ODDS_TTL_MS, paused, unavailable: unavailable && !fetched };
  };
  const cached = await read();
  if (cached?.fetchedAt && now - cached.fetchedAt < ODDS_TTL_MS) return board(cached, false, false);
  if (!env.ODDS_API_KEY) return board(cached, false, true);

  // One refresh per sport at a time, and none within ODDS_RETRY_MS of a failure.
  const lease = await db().prepare(`INSERT INTO odds_cache (sport_key, payload, fetched_at, attempt_at) VALUES (?, '[]', 0, ?)
    ON CONFLICT(sport_key) DO UPDATE SET attempt_at = excluded.attempt_at WHERE odds_cache.attempt_at < ?`)
    .bind(sport.key, now, now - ODDS_RETRY_MS).run();
  if (!lease.meta.changes) return board(cached, false, !cached?.fetchedAt);

  // Reserve the credits before spending them so concurrent requests cannot overrun the budget.
  const week = easternWeekStart(now);
  const reserve = await db().prepare(`INSERT INTO odds_usage (week_start, credits, remaining) VALUES (?, ?, NULL)
    ON CONFLICT(week_start) DO UPDATE SET credits = odds_usage.credits + ? WHERE odds_usage.credits + ? <= ?`)
    .bind(week, COST, COST, COST, ODDS_WEEKLY_CREDITS).run();
  const floor = await db().prepare('SELECT remaining FROM odds_usage WHERE remaining IS NOT NULL ORDER BY week_start DESC LIMIT 1').first<{ remaining: number }>();
  if (!reserve.meta.changes || (floor && floor.remaining - COST < ODDS_RESERVE_CREDITS)) {
    if (reserve.meta.changes) await db().prepare('UPDATE odds_usage SET credits = credits - ? WHERE week_start = ?').bind(COST, week).run();
    return board(cached, true, false);
  }

  try {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport.key}/odds`);
    const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    url.search = new URLSearchParams({ apiKey: env.ODDS_API_KEY, bookmakers: 'fanduel', markets: MARKETS.join(','), oddsFormat: 'american', dateFormat: 'iso', commenceTimeFrom: iso(now), commenceTimeTo: iso(now + ODDS_WINDOW_DAYS * 86400000) }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const remaining = Number(response.headers.get('x-requests-remaining'));
    if (Number.isFinite(remaining) && response.headers.has('x-requests-remaining')) await db().prepare('UPDATE odds_usage SET remaining = ? WHERE week_start = ?').bind(Math.floor(remaining), week).run();
    if (!response.ok) throw new Error(`Odds provider HTTP ${response.status}`);
    const events = normalize(await response.json(), now);
    await db().prepare('UPDATE odds_cache SET payload = ?, fetched_at = ? WHERE sport_key = ?').bind(JSON.stringify(events), now, sport.key).run();
    return board({ payload: JSON.stringify(events), fetchedAt: now }, false, false);
  } catch (error) {
    // Never log the request URL: it carries the API key.
    console.error('odds_refresh_failed', { sport: sport.key, reason: error instanceof Error && /^Odds provider HTTP \d+$/.test(error.message) ? error.message : 'request failed' });
    return board(cached, false, true);
  }
}
