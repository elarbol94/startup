// Shared, client-safe enums and limits of the meetings module.

export const meetingStatuses = ["scheduled", "processing", "review", "approved", "cancelled"] as const;
export type MeetingStatus = (typeof meetingStatuses)[number];

/** Release 1 only creates `upload` meetings; the others arrive with LiveKit. */
export const meetingModes = ["upload", "online", "in_room", "hybrid"] as const;
export type MeetingMode = (typeof meetingModes)[number];

/** `none` keeps every byte of the meeting away from AI services. */
export const meetingAiPolicies = ["openai", "none"] as const;
export type MeetingAiPolicy = (typeof meetingAiPolicies)[number];

export const meetingAccessRoles = ["host", "participant", "viewer"] as const;
export type MeetingAccessRole = (typeof meetingAccessRoles)[number];

export const meetingRecordingKinds = ["video", "audio", "derived_audio"] as const;
/** `single`: one speaker per track; `room`/`mixed`: several voices, diarized. */
export const meetingSpeakerScopes = ["single", "room", "mixed"] as const;
export const meetingRecordingSources = ["upload", "livekit"] as const;
export const meetingPurgeStates = ["active", "purging", "purged", "purge_failed"] as const;
export type MeetingPurgeState = (typeof meetingPurgeStates)[number];

export const mediaUploadStates = ["uploading", "assembling", "finalizing", "done", "aborted"] as const;
export type MediaUploadState = (typeof mediaUploadStates)[number];

export const meetingJobStages = ["ingest", "extract_audio", "transcribe", "merge", "protocol", "purge"] as const;
export type MeetingJobStage = (typeof meetingJobStages)[number];
export const meetingJobStatuses = ["queued", "running", "done", "failed", "blocked", "cancelled"] as const;
export type MeetingJobStatus = (typeof meetingJobStatuses)[number];

export const meetingTranscriptStatuses = ["pending", "completed", "failed"] as const;
export const meetingProtocolSources = ["ai", "manual", "ai_edited"] as const;
export type MeetingProtocolSource = (typeof meetingProtocolSources)[number];
export const actionItemDecisionStatuses = ["accepted", "rejected"] as const;

/** Upload chunks stay below Cloudflare's 100 MB request limit. */
export const MEDIA_CHUNK_BYTES = 32 * 1024 * 1024;

/** Media types accepted for meeting recordings, with their stored extension. */
export const MEETING_MEDIA_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/opus": ".opus",
  "audio/webm": ".webm",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
};

/** Version of the consent texts shown before an upload; stored with each declaration. */
export const UPLOAD_DECLARATION_VERSION = 1;
