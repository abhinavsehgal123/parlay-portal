import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(),
  season: text('season').notNull().default('2026 Season'),
  week: integer('week').notNull(),
  member: text('member').notNull(),
  sport: text('sport').notNull(),
  selection: text('selection').notNull(),
  odds: integer('odds').notNull(),
  stake: real('stake').notNull().default(1),
  status: text('status').notNull().default('Pending'),
  duplicateKey: text('duplicate_key').notNull(),
  createdAt: text('created_at').notNull(),
  details: text('details').notNull().default('{}'),
  evidence: text('evidence').notNull().default('{}'),
  revision: integer('revision').notNull().default(0),
  updatedAt: text('updated_at').notNull().default(''),
}, (table) => [uniqueIndex('one_pick_per_member_week').on(table.season, table.week, table.member)]);

export const portalSettings = sqliteTable('portal_settings', {
  id: integer('id').primaryKey(),
  season: text('season').notNull().default('2026 Season'),
  activeWeek: integer('active_week').notNull().default(1),
  submissionsOpen: integer('submissions_open', { mode: 'boolean' }).notNull().default(true),
  deadlineLabel: text('deadline_label').notNull().default('Sunday, 12:45 PM ET'),
});

export const weeklyCycles = sqliteTable('weekly_cycles', {
  id: text('id').primaryKey(),
  season: text('season').notNull(),
  week: integer('week').notNull(),
  pickCount: integer('pick_count').notNull(),
  finalizedAt: text('finalized_at').notNull(),
}, (table) => [uniqueIndex('one_finalization_per_season_week').on(table.season, table.week)]);

export const weeklyTickets = sqliteTable('weekly_tickets', {
  id: text('id').primaryKey(),
  season: text('season').notNull(),
  week: integer('week').notNull(),
  combinedOdds: integer('combined_odds'),
  wager: real('wager'),
  potentialPayout: real('potential_payout'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('one_ticket_per_season_week').on(table.season, table.week)]);

export const missedSubmissions = sqliteTable('missed_submissions', {
  id: text('id').primaryKey(),
  season: text('season').notNull(),
  week: integer('week').notNull(),
  member: text('member').notNull(),
  reason: text('reason').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('one_missed_submission_per_week').on(table.season, table.week, table.member)]);

export const pickChanges = sqliteTable('pick_changes', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull(),
  season: text('season').notNull(),
  week: integer('week').notNull(),
  member: text('member').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  before: text('before_json').notNull(),
  after: text('after_json').notNull(),
  reason: text('reason').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const sheetOutbox = sqliteTable('sheet_outbox', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  version: text('version').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttempt: integer('next_attempt').notNull().default(0),
  error: text('error').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

export const syncLease = sqliteTable('sync_lease', {
  id: integer('id').primaryKey(),
  token: text('token').notNull(),
  expires: integer('expires').notNull(),
});

export const oddsCache = sqliteTable('odds_cache', {
  sportKey: text('sport_key').primaryKey(),
  payload: text('payload').notNull().default('[]'),
  fetchedAt: integer('fetched_at').notNull().default(0),
  attemptAt: integer('attempt_at').notNull().default(0),
});

export const oddsUsage = sqliteTable('odds_usage', {
  day: text('day').primaryKey(),
  credits: integer('credits').notNull().default(0),
  remaining: integer('remaining'),
});
