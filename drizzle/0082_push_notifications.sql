CREATE TABLE `push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_deliveries_user_key_idx` ON `push_deliveries` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `push_deliveries_created_idx` ON `push_deliveries` (`created_at`);--> statement-breakpoint
CREATE TABLE `push_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`activity` integer DEFAULT true NOT NULL,
	`calendar` integer DEFAULT true NOT NULL,
	`tasks_due` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`locale` text DEFAULT 'de' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);