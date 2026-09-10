CREATE TABLE `wiki_collaboration_presence` (
	`room` text NOT NULL,
	`session` text NOT NULL,
	`user_id` text NOT NULL,
	`awareness` text NOT NULL,
	`touched_at` integer NOT NULL,
	PRIMARY KEY(`room`, `session`),
	FOREIGN KEY (`room`) REFERENCES `wiki_collaboration_rooms`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wiki_collaboration_rooms` (
	`key` text PRIMARY KEY NOT NULL,
	`state` blob NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wiki_collaboration_updates` (
	`room` text NOT NULL,
	`sequence` integer NOT NULL,
	`update` blob NOT NULL,
	PRIMARY KEY(`room`, `sequence`),
	FOREIGN KEY (`room`) REFERENCES `wiki_collaboration_rooms`(`key`) ON UPDATE no action ON DELETE cascade
);
