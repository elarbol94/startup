CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`work_date` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`break_minutes` integer DEFAULT 0 NOT NULL,
	`project_id` text,
	`task_id` text,
	`kind` text DEFAULT 'work' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `time_entries_user_date_idx` ON `time_entries` (`user_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `time_entries_project_date_idx` ON `time_entries` (`project_id`,`work_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `time_entries_one_running_idx` ON `time_entries` (`user_id`) WHERE "time_entries"."ended_at" IS NULL;