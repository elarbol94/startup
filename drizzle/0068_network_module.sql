CREATE TABLE `network_contact_tags` (
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`contact_id`, `tag_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `network_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `network_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `network_contact_tags_tag_idx` ON `network_contact_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `network_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`name` text NOT NULL,
	`organization` text DEFAULT '' NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`relationship` text,
	`closeness` text,
	`met_context` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`linkedin_url` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`last_contact_on` text,
	`external_crm_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `network_contacts_owner_name_idx` ON `network_contacts` (`owner_id`,`name`);--> statement-breakpoint
CREATE INDEX `network_contacts_visibility_idx` ON `network_contacts` (`visibility`);--> statement-breakpoint
CREATE TABLE `network_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`kind` text DEFAULT 'info' NOT NULL,
	`summary` text NOT NULL,
	`target_name` text DEFAULT '' NOT NULL,
	`target_organization` text DEFAULT '' NOT NULL,
	`target_contact_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`due_on` text,
	`task_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `network_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_contact_id`) REFERENCES `network_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `network_leads_contact_idx` ON `network_leads` (`contact_id`);--> statement-breakpoint
CREATE INDEX `network_leads_status_due_idx` ON `network_leads` (`status`,`due_on`);--> statement-breakpoint
CREATE TABLE `network_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `network_tags_normalized_unique` ON `network_tags` (`normalized_name`);