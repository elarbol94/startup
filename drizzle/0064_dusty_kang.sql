CREATE TABLE `bug_report_project` (
	`key` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `bug_report_uploads` (
	`attachment_id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`upload_id` text NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bug_upload_retry_idx` ON `bug_report_uploads` (`task_id`,`upload_id`);--> statement-breakpoint
CREATE TABLE `bug_reports` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`page_path` text NOT NULL,
	`build_version` text NOT NULL,
	`browser` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bug_reports_task_id_unique` ON `bug_reports` (`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bug_reports_submission_id_unique` ON `bug_reports` (`submission_id`);