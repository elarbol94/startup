CREATE TABLE `wiki_office_documents` (
	`page_id` text PRIMARY KEY NOT NULL,
	`head_version_id` text,
	`current_session_key` text,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`page_id`) REFERENCES `wiki_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `wiki_office_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`kind` text NOT NULL,
	`session_key` text,
	`target_version_id` text,
	`expected_head_id` text,
	`state` text DEFAULT 'created' NOT NULL,
	`failure_reason` text,
	`command_attempts` integer DEFAULT 0 NOT NULL,
	`last_command_result` text,
	`result_version_id` text,
	`deadline_at` integer NOT NULL,
	`requested_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `wiki_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_office_operations_active_idx` ON `wiki_office_operations` (`page_id`) WHERE state IN ('created', 'sent');--> statement-breakpoint
CREATE TABLE `wiki_office_sessions` (
	`key` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`base_version_id` text NOT NULL,
	`state` text DEFAULT 'idle' NOT NULL,
	`head_lastsave` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`last_error_at` integer,
	`connected_user_ids_json` text DEFAULT '[]' NOT NULL,
	`opened_at` integer NOT NULL,
	`finalized_at` integer,
	`last_callback_at` integer,
	FOREIGN KEY (`page_id`) REFERENCES `wiki_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wiki_office_sessions_page_idx` ON `wiki_office_sessions` (`page_id`,`state`);--> statement-breakpoint
CREATE TABLE `wiki_office_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`version` integer NOT NULL,
	`session_key` text,
	`kind` text NOT NULL,
	`lastsave` integer,
	`attachment_id` text NOT NULL,
	`changes_attachment_id` text,
	`history_json` text,
	`previous_version_id` text,
	`callback_digest` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `wiki_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changes_attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_office_versions_page_version_idx` ON `wiki_office_versions` (`page_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_office_versions_digest_idx` ON `wiki_office_versions` (`callback_digest`);--> statement-breakpoint
ALTER TABLE `wiki_pages` ADD `document_engine` text DEFAULT 'tiptap' NOT NULL;--> statement-breakpoint
ALTER TABLE `wiki_pages` ADD `conversion_started_at` integer;