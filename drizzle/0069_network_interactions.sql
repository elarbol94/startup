CREATE TABLE `network_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`occurred_on` text NOT NULL,
	`channel` text DEFAULT 'meeting' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `network_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `network_interactions_contact_date_idx` ON `network_interactions` (`contact_id`,`occurred_on`);