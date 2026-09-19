CREATE TABLE `weekly_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`season` text NOT NULL,
	`week` integer NOT NULL,
	`pick_count` integer NOT NULL,
	`finalized_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_finalization_per_season_week` ON `weekly_cycles` (`season`,`week`);