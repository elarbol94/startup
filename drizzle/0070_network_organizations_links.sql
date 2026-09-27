CREATE TABLE `network_contact_links` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `network_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `network_contact_links_unique` ON `network_contact_links` (`contact_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `network_contact_links_target_idx` ON `network_contact_links` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `network_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `network_organizations_normalized_unique` ON `network_organizations` (`normalized_name`);--> statement-breakpoint
ALTER TABLE `network_contacts` ADD `organization_id` text REFERENCES network_organizations(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `network_contacts_organization_idx` ON `network_contacts` (`organization_id`);--> statement-breakpoint
ALTER TABLE `network_leads` ADD `target_organization_id` text REFERENCES network_organizations(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `network_leads_target_organization_idx` ON `network_leads` (`target_organization_id`);