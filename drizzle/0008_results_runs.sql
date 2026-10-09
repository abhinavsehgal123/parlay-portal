CREATE TABLE `results_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer DEFAULT 0 NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`graded` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
