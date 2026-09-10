CREATE TABLE `task_assignees` (
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `user_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_assignees_user_idx` ON `task_assignees` (`user_id`,`task_id`);
--> statement-breakpoint
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assignee_id FROM tasks WHERE kind = 'task' AND assignee_id IS NOT NULL;
