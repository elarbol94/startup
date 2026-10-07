CREATE TABLE `meeting_call_consents` (
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`text_version` integer NOT NULL,
	`ai_processing` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `user_id`),
	FOREIGN KEY (`session_id`) REFERENCES `meeting_call_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meeting_call_endpoints` (
	`identity` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `meeting_call_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meeting_call_endpoints_session_idx` ON `meeting_call_endpoints` (`session_id`);--> statement-breakpoint
CREATE TABLE `meeting_call_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`room_name` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`record` integer NOT NULL,
	`ai_policy` text NOT NULL,
	`started_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	`end_reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`started_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_call_sessions_room_name_unique` ON `meeting_call_sessions` (`room_name`);--> statement-breakpoint
CREATE INDEX `meeting_call_sessions_meeting_idx` ON `meeting_call_sessions` (`meeting_id`,`status`);--> statement-breakpoint
CREATE TABLE `meeting_egress_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`track_sid` text NOT NULL,
	`identity` text NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`state` text DEFAULT 'calling' NOT NULL,
	`egress_id` text,
	`media_started_at` integer,
	`stored_name` text,
	`sha256` text,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `meeting_call_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_egress_attempts_egress_id_unique` ON `meeting_egress_attempts` (`egress_id`);--> statement-breakpoint
CREATE INDEX `meeting_egress_attempts_session_idx` ON `meeting_egress_attempts` (`session_id`,`track_sid`);--> statement-breakpoint
CREATE TABLE `meeting_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `meeting_recordings` ADD `call_session_id` text;--> statement-breakpoint
ALTER TABLE `meeting_recordings` ADD `speaker_user_id` text;--> statement-breakpoint
ALTER TABLE `meeting_recordings` ADD `media_started_at` integer;