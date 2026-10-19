CREATE TABLE `weekly_recaps` (
	`id` text PRIMARY KEY NOT NULL,
	`season` text NOT NULL,
	`week` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_recap_per_season_week` ON `weekly_recaps` (`season`,`week`);