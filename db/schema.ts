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
