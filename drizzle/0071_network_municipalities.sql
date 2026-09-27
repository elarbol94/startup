ALTER TABLE `network_contacts` ADD `municipality_code` text;--> statement-breakpoint
ALTER TABLE `network_contacts` ADD `municipality_name` text;--> statement-breakpoint
CREATE INDEX `network_contacts_municipality_idx` ON `network_contacts` (`municipality_code`);--> statement-breakpoint
ALTER TABLE `network_organizations` ADD `municipality_code` text;--> statement-breakpoint
ALTER TABLE `network_organizations` ADD `municipality_name` text;--> statement-breakpoint
CREATE INDEX `network_organizations_municipality_idx` ON `network_organizations` (`municipality_code`);