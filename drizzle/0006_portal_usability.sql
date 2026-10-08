CREATE TABLE `missed_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`season` text NOT NULL,
	`week` integer NOT NULL,
	`member` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_missed_submission_per_week` ON `missed_submissions` (`season`,`week`,`member`);--> statement-breakpoint
CREATE TABLE `pick_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`season` text NOT NULL,
	`week` integer NOT NULL,
	`member` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sheet_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`version` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_lease` (
	`id` integer PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `weekly_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`season` text NOT NULL,
	`week` integer NOT NULL,
	`combined_odds` integer,
	`wager` real,
	`potential_payout` real,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `one_ticket_per_season_week` ON `weekly_tickets` (`season`,`week`);--> statement-breakpoint
ALTER TABLE `submissions` ADD `details` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `evidence` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `updated_at` text DEFAULT '' NOT NULL;
