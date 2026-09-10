CREATE TABLE `platform_restores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_id` integer NOT NULL,
	`side` text NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`first_version_id` integer NOT NULL,
	`last_version_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_key` text NOT NULL,
	`operation` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_versions_record_idx` ON `platform_versions` (`table_name`,`record_key`,`id`);--> statement-breakpoint
CREATE INDEX `platform_versions_table_idx` ON `platform_versions` (`table_name`,`id`);