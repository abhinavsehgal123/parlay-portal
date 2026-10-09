import { db } from './portal-db';
import { members } from './portal';

// Weekly rollover for the Tuesday-morning schedule. Unlike the commissioner's
// finalize in the Admin tab, it does not wait for every leg to be graded:
// pending legs stay pending in History for the commissioner to grade later.
// Members without a pick are only recorded as missing (no penalty), and
// official ticket details are not required. It refuses while any dated game
// in the week is today or later (Eastern), and advances exactly one week.
export type FinalizeSummary = { finalized: boolean; week?: number; nextWeek?: number; picks?: number; pending?: number; missing?: string[]; note: string };

const easternToday = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export async function autoFinalize(now = Date.now()): Promise<FinalizeSummary> {
  const s = await db().prepare('SELECT season, active_week AS activeWeek FROM portal_settings WHERE id = 1').first<{ season: string; activeWeek: number }>();
  if (!s) return { finalized: false, note: 'League settings unavailable' };
  const picks = (await db().prepare('SELECT member, status, revision, details FROM submissions WHERE season = ? AND week = ?').bind(s.season, s.activeWeek).all<{ member: string; status: string; revision: number; details: string }>()).results;
  if (!picks.length) return { finalized: false, week: s.activeWeek, note: `Week ${s.activeWeek} has no picks yet` };
  const today = easternToday(now);
  const upcoming = picks.filter(p => { try { const d = (JSON.parse(p.details || '{}') as { eventDate?: string }).eventDate; return Boolean(d && d >= today); } catch { return false; } });
  if (upcoming.length) return { finalized: false, week: s.activeWeek, note: `${upcoming.length} pick(s) in Week ${s.activeWeek} have games today or later` };

  const id = `${s.season}|${s.activeWeek}`, at = new Date(now).toISOString();
  const version = picks.reduce((n, p) => n + Number(p.revision), 0);
  // Same guards as the Admin-tab finalize: the week is still active, unchanged since it was read, and not already finalized.
  const results = await db().batch([
    db().prepare(`INSERT INTO weekly_cycles (id, season, week, pick_count, finalized_at)
      SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM weekly_cycles WHERE season = ? AND week = ?)
      AND (SELECT COALESCE(SUM(revision), 0) FROM submissions WHERE season = ? AND week = ?) = ?
      AND (SELECT COUNT(*) FROM submissions WHERE season = ? AND week = ?) = ?
      AND EXISTS (SELECT 1 FROM portal_settings WHERE id = 1 AND season = ? AND active_week = ?)`)
      .bind(id, s.season, s.activeWeek, picks.length, at, s.season, s.activeWeek, s.season, s.activeWeek, version, s.season, s.activeWeek, picks.length, s.season, s.activeWeek),
    db().prepare(`UPDATE portal_settings SET active_week = active_week + 1, submissions_open = 1
      WHERE season = ? AND active_week = ? AND EXISTS (SELECT 1 FROM weekly_cycles WHERE id = ? AND finalized_at = ?)`)
      .bind(s.season, s.activeWeek, id, at),
  ]);
  if (!results[0].meta.changes) return { finalized: false, week: s.activeWeek, note: `Week ${s.activeWeek} changed or was already finalized; nothing done` };
  return {
    finalized: true, week: s.activeWeek, nextWeek: s.activeWeek + 1, picks: picks.length,
    pending: picks.filter(p => p.status === 'Pending').length,
    missing: members.filter(m => !picks.some(p => p.member === m)),
    note: `Week ${s.activeWeek} finalized; Week ${s.activeWeek + 1} is open`,
  };
}
