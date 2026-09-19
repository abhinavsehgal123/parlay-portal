CREATE TABLE `weekly_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`season` text NOT NULL,
	`week` integer NOT NULL,
	`combined_odds` integer,
	`wager` real,
	`potential_payout` real,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_ticket_per_season_week` ON `weekly_tickets` (`season`,`week`);
