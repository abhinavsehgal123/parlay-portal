export const members = ['CJ', 'Brooks', 'Nav', 'Fab', 'Drew', 'Shan', 'Kith', 'Griff', 'Seed', 'Rohan', 'Ryser', 'Jp'];
export const sports = ['NFL', 'College Football', 'NBA', 'College Basketball', 'MLB', 'NHL', 'Soccer', 'Other'];
// Sports offered in the FanDuel odds browser, keyed by The Odds API sport key.
export const oddsSports = [
  { key: 'americanfootball_nfl', label: 'NFL', sport: 'NFL' },
  { key: 'americanfootball_ncaaf', label: 'College Football', sport: 'College Football' },
  { key: 'basketball_nba', label: 'NBA', sport: 'NBA' },
  { key: 'basketball_ncaab', label: 'College Basketball', sport: 'College Basketball' },
  { key: 'baseball_mlb', label: 'MLB', sport: 'MLB' },
  { key: 'icehockey_nhl', label: 'NHL', sport: 'NHL' },
  { key: 'soccer_epl', label: 'Premier League', sport: 'Soccer' },
  { key: 'soccer_uefa_champs_league', label: 'Champions League', sport: 'Soccer' },
] as const;
export const markets = ['Moneyline', 'Spread', 'Game total', 'Player prop', 'Other'];
export type Status = 'Pending' | 'Hit' | 'Miss' | 'Push' | 'Void';
export type Details = { team?: string; opponent?: string; market?: string; line?: string; eventDate?: string; description?: string; feedAt?: string };
export type Evidence = { result?: string; source?: string; reason?: string; gradedAt?: string };
export type Pick = { id: string; season: string; week: number; member: string; sport: string; selection: string; odds: number; status: Status; createdAt: string; updatedAt: string; revision: number; details: Details; evidence: Evidence };
export type Settings = { season: string; activeWeek: number; submissionsOpen: boolean; deadlineLabel: string };
export type Change = { id: string; submissionId: string; season: string; week: number; member: string; actor: string; action: string; before: Partial<Pick>; after: Partial<Pick>; reason: string; createdAt: string };
export type Ticket = { season: string; week: number; combinedOdds: number; wager: number; potentialPayout: number };
export type Board = { settings: Settings; isAdmin: boolean; submissions: Pick[]; historySubmissions: Pick[]; changes: Change[]; finalizations: {season:string;week:number;finalizedAt:string}[]; tickets: Ticket[]; missedSubmissions: {season:string;week:number;member:string;reason:string}[]; sync?: { configured:boolean; pending:number; failed:number; items:{id:string;attempts:number;error:string;member:string}[] }; results?: { startedAt:number; finishedAt:number; graded:number; note:string; weekCredits:number } | null };
export const formatOdds = (n: number) => `${n > 0 ? '+' : ''}${n}`;
export const statusLabel = (s: Status) => ({Pending:'Awaiting result',Hit:'Win',Miss:'Loss',Push:'Push',Void:'Void'}[s]);
export function selectionText(d: Details) {
  const subject = (d.team || '').trim();
  const opponent = d.opponent?.trim();
  const suffix = opponent ? ` vs ${opponent}` : '';
  if (d.market === 'Moneyline') return `${subject} ML${suffix}`;
  if (d.market === 'Spread') return `${subject} ${d.line?.trim() || ''}${suffix}`;
  return `${subject}${suffix} · ${d.description?.trim() || d.market || ''}${d.line ? ` ${d.line.trim()}` : ''}`;
}
