ALTER TABLE `meeting_call_sessions` ADD `room_closed_at` integer;--> statement-breakpoint
ALTER TABLE `meeting_call_sessions` ADD `room_close_attempts` integer DEFAULT 0 NOT NULL;