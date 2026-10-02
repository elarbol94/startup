CREATE TABLE `calendar_subscriptions` (
	`calendar_id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`last_attempt_at` integer,
	`last_synced_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `external_uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_external_uid_idx` ON `calendar_events` (`calendar_id`,`external_uid`);