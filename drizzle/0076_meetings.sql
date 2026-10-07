CREATE TABLE `media_upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`declared_bytes` integer NOT NULL,
	`reserved_bytes` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`received_chunks` text DEFAULT '[]' NOT NULL,
	`consent_evidence` text NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`stored_name` text,
	`sha256` text,
	`recording_id` text,
	`error` text DEFAULT '' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_upload_sessions_state_idx` ON `media_upload_sessions` (`state`,`expires_at`);--> statement-breakpoint
CREATE TABLE `meeting_access` (
	`meeting_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'participant' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`meeting_id`, `user_id`),
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meeting_access_user_idx` ON `meeting_access` (`user_id`);--> statement-breakpoint
CREATE TABLE `meeting_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meeting_audit_log_meeting_idx` ON `meeting_audit_log` (`meeting_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `meeting_job_inputs` (
	`job_id` text NOT NULL,
	`recording_id` text NOT NULL,
	PRIMARY KEY(`job_id`, `recording_id`),
	FOREIGN KEY (`job_id`) REFERENCES `meeting_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meeting_job_inputs_recording_idx` ON `meeting_job_inputs` (`recording_id`);--> statement-breakpoint
CREATE TABLE `meeting_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`recording_id` text,
	`transcript_id` text,
	`stage` text NOT NULL,
	`input_revision` integer DEFAULT 1 NOT NULL,
	`policy_revision` integer NOT NULL,
	`execution_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 4 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`claim_token` text,
	`lease_until` integer,
	`heartbeat_at` integer,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_jobs_execution_key_unique` ON `meeting_jobs` (`execution_key`);--> statement-breakpoint
CREATE INDEX `meeting_jobs_claim_idx` ON `meeting_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `meeting_jobs_meeting_idx` ON `meeting_jobs` (`meeting_id`);--> statement-breakpoint
CREATE TABLE `meeting_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`source_recording_id` text,
	`attachment_id` text,
	`kind` text NOT NULL,
	`speaker_scope` text DEFAULT 'mixed' NOT NULL,
	`source` text DEFAULT 'upload' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`duration_ms` integer,
	`offset_ms` integer DEFAULT 0 NOT NULL,
	`consent_evidence` text DEFAULT '{}' NOT NULL,
	`expires_at` integer,
	`purge_state` text DEFAULT 'active' NOT NULL,
	`purged_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meeting_recordings_meeting_idx` ON `meeting_recordings` (`meeting_id`);--> statement-breakpoint
CREATE INDEX `meeting_recordings_expiry_idx` ON `meeting_recordings` (`purge_state`,`expires_at`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`agenda` text DEFAULT '' NOT NULL,
	`starts_at` integer,
	`calendar_event_id` text,
	`occurrence_key` text,
	`project_id` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`mode` text DEFAULT 'upload' NOT NULL,
	`ai_policy` text DEFAULT 'openai' NOT NULL,
	`policy_revision` integer DEFAULT 1 NOT NULL,
	`confidential` integer DEFAULT false NOT NULL,
	`language` text DEFAULT 'de' NOT NULL,
	`video_retention_days` integer DEFAULT 30 NOT NULL,
	`audio_retention_days` integer DEFAULT 90 NOT NULL,
	`current_protocol_id` text,
	`approved_protocol_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`calendar_event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meetings_occurrence_unique` ON `meetings` (`calendar_event_id`,`occurrence_key`);--> statement-breakpoint
CREATE INDEX `meetings_starts_at_idx` ON `meetings` (`starts_at`);--> statement-breakpoint
CREATE INDEX `meetings_project_idx` ON `meetings` (`project_id`);--> statement-breakpoint
CREATE TABLE `meeting_action_item_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`item_key` text NOT NULL,
	`protocol_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`status` text NOT NULL,
	`task_id` text,
	`decided_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_action_item_decisions_task_id_unique` ON `meeting_action_item_decisions` (`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_action_item_decisions_unique` ON `meeting_action_item_decisions` (`meeting_id`,`item_key`);--> statement-breakpoint
CREATE TABLE `meeting_protocols` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`version` integer NOT NULL,
	`session_transcript_id` text,
	`speaker_map_revision` integer,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`prompt_version` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_protocols_version_unique` ON `meeting_protocols` (`meeting_id`,`version`);--> statement-breakpoint
CREATE TABLE `meeting_session_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`session_transcript_id` text NOT NULL,
	`position` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`speaker_key` text NOT NULL,
	`source_segment_id` text NOT NULL,
	`text` text NOT NULL,
	`possible_duplicate_of` text,
	FOREIGN KEY (`session_transcript_id`) REFERENCES `meeting_session_transcripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meeting_session_segments_transcript_idx` ON `meeting_session_segments` (`session_transcript_id`,`position`);--> statement-breakpoint
CREATE TABLE `meeting_session_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`revision` integer NOT NULL,
	`input_manifest` text NOT NULL,
	`missing_inputs` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_session_transcripts_revision_unique` ON `meeting_session_transcripts` (`meeting_id`,`revision`);--> statement-breakpoint
CREATE TABLE `meeting_speaker_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`session_transcript_id` text NOT NULL,
	`revision` integer NOT NULL,
	`map` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_transcript_id`) REFERENCES `meeting_session_transcripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_speaker_maps_revision_unique` ON `meeting_speaker_maps` (`session_transcript_id`,`revision`);--> statement-breakpoint
CREATE TABLE `meeting_transcript_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`transcript_id` text NOT NULL,
	`position` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`speaker_key` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`transcript_id`) REFERENCES `meeting_transcripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meeting_transcript_segments_transcript_idx` ON `meeting_transcript_segments` (`transcript_id`,`position`);--> statement-breakpoint
CREATE TABLE `meeting_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`recording_id` text NOT NULL,
	`revision` integer NOT NULL,
	`engine` text NOT NULL,
	`model` text NOT NULL,
	`language` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_transcripts_revision_unique` ON `meeting_transcripts` (`recording_id`,`revision`);--> statement-breakpoint
CREATE INDEX `meeting_transcripts_meeting_idx` ON `meeting_transcripts` (`meeting_id`);--> statement-breakpoint
-- Full-text search over meeting transcripts and approved protocols. Kept in
-- sync manually by the meetings module (merge stage and protocol approval);
-- every query joins meeting_access, so rows carry the meeting id.
CREATE VIRTUAL TABLE `meeting_segments_fts` USING fts5(
  `segment_id` UNINDEXED,
  `meeting_id` UNINDEXED,
  `text`
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `meeting_protocols_fts` USING fts5(
  `meeting_id` UNINDEXED,
  `text`
);
