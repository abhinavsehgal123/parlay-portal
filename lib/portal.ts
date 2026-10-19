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
// fdMarket/fdSelection are FanDuel's own IDs for the line, kept when a pick is filled from the FanDuel feed.
export type Details = { team?: string; opponent?: string; market?: string; line?: string; eventDate?: string; description?: string; feedAt?: string; fdMarket?: string; fdSelection?: string };
export type Evidence = { result?: string; source?: string; reason?: string; gradedAt?: string };
export type Pick = { id: string; season: string; week: number; member: string; sport: string; selection: string; odds: number; status: Status; createdAt: string; updatedAt: string; revision: number; details: Details; evidence: Evidence };
export type Settings = { season: string; activeWeek: number; submissionsOpen: boolean; deadlineLabel: string };
export type Change = { id: string; submissionId: string; season: string; week: number; member: string; actor: string; action: string; before: Partial<Pick>; after: Partial<Pick>; reason: string; createdAt: string };
// result is the commissioner's official ticket outcome ('Won' or 'Lost'), set when it differs from what the legs alone show.
export type Ticket = { season: string; week: number; combinedOdds: number | null; wager: number | null; potentialPayout: number | null; result?: string; resultNote?: string };
export type Board = { settings: Settings; isAdmin: boolean; submissions: Pick[]; historySubmissions: Pick[]; changes: Change[]; finalizations: {season:string;week:number;finalizedAt:string}[]; tickets: Ticket[]; missedSubmissions: {season:string;week:number;member:string;reason:string}[]; recaps?: {season:string;week:number;text:string;updatedAt:string}[]; payments?: import('./payments').Payment[]; basePayers?: {week:number;member:string;points:number}[]; sync?: { configured:boolean; pending:number; failed:number; items:{id:string;attempts:number;error:string;member:string}[] }; results?: { startedAt:number; finishedAt:number; graded:number; note:string; weekCredits:number } | null; credits?: { remaining:number|null; linesWeek:number; linesCap:number; scoresWeek:number; scoresCap:number } };
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

// Contradictory picks: two members backing opposite sides of the same game.
// - Moneyline/spread: one backs each team (Saints ML vs Giants +1.5 counts).
// - Game total: Over and Under on the same game.
// - Player prop: Over and Under on the same player and stat.
// "Saints" matches "New Orleans Saints"; picks without a matchup or date are never compared.
const norm = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const same = (a = '', b = '') => { const x = norm(a), y = norm(b); return Boolean(x && y) && (x === y || x.endsWith(` ${y}`) || y.endsWith(` ${x}`)); };
const side = (d: Details) => /^\s*over\b/i.test(d.description || '') ? 'over' : /^\s*under\b/i.test(d.description || '') ? 'under' : '';
const stat = (d: Details) => norm((d.description || '').replace(/^\s*(over|under)\b/i, ''));
export function contradicts(a: Details, b: Details) {
  if (!a.team || !b.team || !a.eventDate || a.eventDate !== b.eventDate) return false;
  const sides = ['Moneyline', 'Spread'];
  if (sides.includes(a.market || '') && sides.includes(b.market || '')) return Boolean(a.opponent && b.opponent) && same(a.team, b.opponent) && same(a.opponent, b.team);
  if (a.market !== b.market || !side(a) || !side(b) || side(a) === side(b)) return false;
  if (a.market === 'Game total') return Boolean(a.opponent && b.opponent) && ((same(a.team, b.team) && same(a.opponent, b.opponent)) || (same(a.team, b.opponent) && same(a.opponent, b.team)));
  if (a.market === 'Player prop') return same(a.team, b.team) && stat(a) === stat(b);
  return false;
}
export const contradiction = (d: Details, others: Pick[]) => others.find(o => contradicts(d, o.details));
export const contradictionMessage = (o: Pick) => `That's the other side of ${o.member}'s pick (${o.selection}). Choose a different bet.`;

// FanDuel "add to betslip" links. The account.sportsbook.fanduel.com host with numbered
// parameters (marketId[0]=…&selectionId[0]=…) opens the app with every leg on the
// betslip; tested on the commissioner's phone in New York on 2026-10-19. The plain
// sportsbook.fanduel.com/addToBetslip form failed there. The brackets must stay literal.
const FANDUEL_BETSLIP = 'https://account.sportsbook.fanduel.com/sportsbook/addToBetslip';
export const fanduelIds = (marketId?: string, selectionId?: string) => /^\d+(\.\d+)?$/.test(marketId || '') && /^\d+$/.test(selectionId || '');
export const hasBetslipLink = (d: Details) => fanduelIds(d.fdMarket, d.fdSelection);
export function betslipLink(picks: { details: Details }[]) {
  const legs = picks.map(p => p.details).filter(hasBetslipLink);
  if (!legs.length) return null;
  return `${FANDUEL_BETSLIP}?${legs.map((d, i) => `marketId[${i}]=${d.fdMarket}&selectionId[${i}]=${d.fdSelection}`).join('&')}`;
}
