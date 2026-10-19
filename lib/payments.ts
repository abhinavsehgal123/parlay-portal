import { members, type Board } from './portal';

// Money for each week's bet. The lowest scorer in the league's Sleeper fantasy league
// pays the $10 base for the next week's parlay; anyone can send more to boost it, and
// members whose pick lost send money to re-up on a new bet. The commissioner funds
// FanDuel from Venmo. Payments are recorded from Venmo receipts by the Claude Venmo
// routine; nothing here moves money.
export const SLEEPER_LEAGUE = '1316079305691791360';
export const BASE_STAKE = 10;
export const paymentKinds = ['base', 'boost', 'reup', 'deposit'] as const;
export type PaymentKind = typeof paymentKinds[number];
export type Payment = { id: string; season: string; week: number; member: string; kind: PaymentKind; amount: number; note: string; paidAt: string; source: string };

// Venmo display names, and Sleeper usernames, for each member.
export const venmoNames: Record<string, string> = {
  'brooks baro': 'Brooks', 'rohan srivastava': 'Rohan', 'chris j': 'CJ', 'griffin gillespie': 'Griff',
  'andrew walker': 'Drew', 'fabio la pietra': 'Fab', 'ryan shanahan': 'Shan', 'nick sedor': 'Seed',
  'abhinav sehgal': 'Nav', 'ankith kanderi': 'Kith', 'jp mclean': 'Jp', 'jonathan ryser': 'Ryser',
};
export const sleeperNames: Record<string, string> = {
  chrjohnson05: 'CJ', shanny11: 'Shan', walkertexas97: 'Drew', seadicc: 'Seed', brooksyb26: 'Brooks', jpmclean: 'Jp',
  bobsherman3: 'Griff', kithdaddy: 'Kith', fabgreg: 'Fab', jonathannr321: 'Ryser', abhinavsehgal: 'Nav', rohansrivastava: 'Rohan',
};

// A league member from a Venmo display name or a member name, else ''.
export function memberFrom(name: string) {
  const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return venmoNames[n] || members.find(m => m.toLowerCase() === n) || '';
}

// What a member's payment is for, from its note. null means it isn't about the bet.
export function kindFromNote(note: string, amount: number, isBasePayer: boolean): PaymentKind | null {
  const n = note.toLowerCase();
  if (/\bre[\s-]?up|\breup|^\s*re\b/.test(n)) return 'reup';
  if (/\bboost|\bjuic|🧃/u.test(n)) return 'boost';
  if (/\bmega|megalay|\blay\b|\bbet\b|\bparlay|\bweek\s*\d+|\bwk\s*\d+/.test(n)) return isBasePayer && amount === BASE_STAKE ? 'base' : 'boost';
  return null;
}

// The week a note names ("week 6", "wk6", "mega week 6"), if any.
export function weekFromNote(note: string) {
  const m = /\b(?:week|wk)\s*(\d{1,2})\b/i.exec(note);
  return m ? Number(m[1]) : null;
}

// The portal week that was open when a payment was made: the first week not yet
// finalized at that time.
export function weekAt(paidAt: string, finalized: { week: number; finalizedAt: string }[], activeWeek: number) {
  const done = finalized.filter(f => f.finalizedAt <= paidAt).map(f => f.week);
  const next = done.length ? Math.max(...done) + 1 : Math.min(activeWeek, ...finalized.map(f => f.week));
  return Math.min(next, activeWeek);
}

export type WeekMoney = {
  payments: Payment[];
  collected: number;
  deposited: number;
  basePayer: string | null;
  basePaid: boolean;
  unloggedReups: string[];
};

const easternDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// One week's money, with what still needs attention: whether the base payer has paid,
// and members who sent re-up money after their pick lost but logged no new pick.
export function weekMoney(board: Board, season: string, week: number, basePayer: string | null): WeekMoney {
  const payments = (board.payments ?? []).filter(p => p.season === season && p.week === week);
  const collected = payments.filter(p => p.kind !== 'deposit').reduce((n, p) => n + p.amount, 0);
  const deposited = payments.filter(p => p.kind === 'deposit').reduce((n, p) => n + p.amount, 0);
  const basePaid = Boolean(basePayer && payments.some(p => p.member === basePayer && p.kind !== 'deposit'));
  const unloggedReups = members.filter(member => {
    const pick = board.historySubmissions.find(p => p.member === member && p.season === season && p.week === week);
    if (!pick || pick.status !== 'Miss') return false;
    // Re-up money counts toward this loss only once the lost pick's game day began and
    // after any replacement already logged, so a boost toward a logged re-up isn't flagged.
    const lastReplace = board.changes.filter(c => c.submissionId === pick.id && c.action === 'replace').map(c => c.createdAt).sort().pop() ?? '';
    const gameDay = pick.details.eventDate || '';
    return payments.some(p => p.member === member && p.kind === 'reup' && p.paidAt > lastReplace && easternDay(p.paidAt) >= gameDay);
  });
  return { payments, collected, deposited, basePayer, basePaid, unloggedReups };
}
