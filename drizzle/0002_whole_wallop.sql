CREATE TABLE `portal_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`season` text DEFAULT '2026 Season' NOT NULL,
	`active_week` integer DEFAULT 1 NOT NULL,
	`submissions_open` integer DEFAULT true NOT NULL,
	`deadline_label` text DEFAULT 'Sunday, 12:45 PM ET' NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `portal_settings` (`id`, `season`, `active_week`, `submissions_open`, `deadline_label`)
VALUES (1, '2026 Season', 1, 1, 'Sunday, 12:45 PM ET');
--> statement-breakpoint
DELETE FROM `submissions` WHERE `id` = '964217a7-a4a5-482e-b334-eb5b1b7f200b';
