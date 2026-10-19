import { SLEEPER_LEAGUE, sleeperNames } from './payments';

// The league's lowest scorer in a Sleeper fantasy week, who pays the $10 base for the
// next week's parlay. Read from Sleeper's public API (no key). Returns null when the
// week has no scores yet or Sleeper can't be reached.
type Matchup = { roster_id?: number; points?: number };
type Roster = { roster_id?: number; owner_id?: string };
type User = { user_id?: string; display_name?: string };

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`https://api.sleeper.app/v1/league/${SLEEPER_LEAGUE}/${path}`, { signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.json() as T : null;
  } catch { return null; }
}

export async function lowScorer(sleeperWeek: number): Promise<{ member: string; points: number } | null> {
  if (!Number.isInteger(sleeperWeek) || sleeperWeek < 1 || sleeperWeek > 18) return null;
  const [matchups, rosters, users] = await Promise.all([get<Matchup[]>(`matchups/${sleeperWeek}`), get<Roster[]>('rosters'), get<User[]>('users')]);
  if (!Array.isArray(matchups) || !Array.isArray(rosters) || !Array.isArray(users)) return null;
  const scored = matchups.filter(m => typeof m.points === 'number' && m.points > 0);
  if (scored.length < matchups.length || !scored.length) return null;
  const low = scored.reduce((a, b) => (b.points! < a.points! ? b : a));
  if (scored.filter(m => m.points === low.points).length > 1) return null;
  const owner = rosters.find(r => r.roster_id === low.roster_id)?.owner_id;
  const name = users.find(u => u.user_id === owner)?.display_name?.toLowerCase() ?? '';
  const member = sleeperNames[name];
  return member ? { member, points: low.points! } : null;
}
