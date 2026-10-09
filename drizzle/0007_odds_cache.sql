CREATE TABLE `odds_cache` (
	`sport_key` text PRIMARY KEY NOT NULL,
	`payload` text DEFAULT '[]' NOT NULL,
	`fetched_at` integer DEFAULT 0 NOT NULL,
	`attempt_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `odds_usage` (
	`day` text PRIMARY KEY NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`remaining` integer
);
