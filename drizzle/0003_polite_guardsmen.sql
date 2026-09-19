DROP INDEX `one_pick_per_member_week`;--> statement-breakpoint
ALTER TABLE `submissions` ADD `season` text DEFAULT '2026 Season' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `one_pick_per_member_week` ON `submissions` (`season`,`week`,`member`);