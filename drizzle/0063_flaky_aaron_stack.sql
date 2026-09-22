ALTER TABLE `project_columns` ADD `workflow_stage` text DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `workflow_stage` text DEFAULT 'todo' NOT NULL;
--> statement-breakpoint
UPDATE project_columns SET workflow_stage = 'in_progress'
WHERE is_completed = 0 AND id != (
  SELECT first_column.id FROM project_columns AS first_column
  WHERE first_column.project_id = project_columns.project_id AND first_column.is_completed = 0
  ORDER BY first_column.sort_order, first_column.id LIMIT 1
);
