CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`season` text NOT NULL,
	`week` integer NOT NULL,
	`member` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`amount` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`paid_at` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
