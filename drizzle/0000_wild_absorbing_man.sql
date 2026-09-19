CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`week` integer NOT NULL,
	`member` text NOT NULL,
	`sport` text NOT NULL,
	`selection` text NOT NULL,
	`odds` integer NOT NULL,
	`stake` real DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`duplicate_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_pick_per_member_week` ON `submissions` (`week`,`member`);