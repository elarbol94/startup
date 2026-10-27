CREATE TABLE `calendar_caldav_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_encrypted` text NOT NULL,
	`home_url` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calendar_caldav_links` (
	`calendar_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`collection_url` text NOT NULL,
	`sync_token` text,
	`last_attempt_at` integer,
	`last_synced_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `calendar_caldav_accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calendar_caldav_objects` (
	`calendar_id` text NOT NULL,
	`href` text NOT NULL,
	`event_id` text NOT NULL,
	`etag` text,
	`synced_at` integer NOT NULL,
	PRIMARY KEY(`calendar_id`, `href`),
	FOREIGN KEY (`calendar_id`) REFERENCES `calendar_caldav_links`(`calendar_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendar_caldav_objects_event_idx` ON `calendar_caldav_objects` (`event_id`);