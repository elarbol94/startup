CREATE TABLE `mail_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email_address` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`imap_host` text NOT NULL,
	`imap_port` integer DEFAULT 993 NOT NULL,
	`imap_secure` integer DEFAULT true NOT NULL,
	`smtp_host` text NOT NULL,
	`smtp_port` integer DEFAULT 465 NOT NULL,
	`smtp_security` text DEFAULT 'tls' NOT NULL,
	`username` text NOT NULL,
	`password_encrypted` text NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_accounts_user_idx` ON `mail_accounts` (`user_id`);