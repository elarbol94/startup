# Meetings: recordings and AI protocols

The **Besprechungen** module (`/meetings`, shortcut `G B`) turns a meeting
recording into a reviewed protocol: upload → transcript → AI draft → review →
approval → action items become tasks. Release 1 works with uploaded
recordings (from a phone, a laptop or an in-person meeting). Online meetings
with LiveKit follow later; see `docs/plans/meetings-ai-protocols.md`.

## How it works

1. A person creates a meeting and chooses who may see it. The **access list
   (`meeting_access`) is the only gate**: admins get no implicit access, and
   linking a project grants nobody access.
2. A host or participant uploads a recording. Before any byte is accepted they
   confirm that everyone recorded was informed and agreed – and, when the
   meeting uses AI, that the recording may be processed by OpenAI. The
   declaration is stored with the recording (`consentEvidence`).
3. The upload is sent in 32 MB chunks (below Cloudflare's 100 MB request
   limit), each verified by SHA-256. The worker assembles and stores the file
   in the normal upload store (`attachments`, entity type `meetingRecording`).
4. The meeting worker (started from `src/instrumentation.ts`) runs the stages
   `ingest` (ffprobe) → `extract_audio` (16 kHz mono Opus) → `transcribe`
   (OpenAI, diarized) → `merge` (one meeting timeline) → `protocol` (OpenAI,
   structured output). Every decision and action item must cite transcript
   lines; uncited ones are dropped.
5. Participants review the draft, name the speakers and edit the protocol.
   Each edit is a new version. A host approves exactly the version they saw.
6. Action items of the approved protocol are accepted one by one; each
   creates exactly one task linked back to the meeting.

The transcript is untrusted input: the AI output never triggers anything on
its own, and nothing leaves the meeting without a person's action.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | – | Required for transcription and drafts. Without it, AI jobs show as *blocked*. |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-transcribe-diarize` | Speech-to-text with speaker separation. |
| `OPENAI_MEETINGS_MODEL` | `gpt-6-astra` | Protocol drafts (Responses API, `store: false`). |
| `MEETINGS_MAX_UPLOAD_BYTES` | 4 GiB | Largest single recording. |
| `MEETINGS_TRANSCRIBE_CHUNK_SECONDS` | 1200 | Long recordings are transcribed in chunks cut at silences. |
| `MEETINGS_FAKE_AI` | – | `1` replaces OpenAI with fixed fixture output (tests, UI work). |
| `FFMPEG_PATH`, `FFPROBE_PATH` | `ffmpeg`, `ffprobe` | Media tools; the Docker image includes them. |

Locally, install ffmpeg (`apt install ffmpeg`, `brew install ffmpeg`, or
`winget install ffmpeg`). Without it, uploads are stored but processing fails
with a clear error and can be retried afterwards.

nginx streams `/api/meeting-uploads/` to the app without buffering
(`deploy/nginx.conf`).

## Privacy (DSGVO)

- **Purpose**: internal minutes of company meetings. Record only with the
  consent of everyone recorded; the upload dialog asks for it every time.
- **AI per meeting**: *KI-Verarbeitung* on (default) sends audio and
  transcript to OpenAI as processor; API data is not used for training by
  default. Confidential meetings (e.g. personnel talks) start with AI off.
  Turning AI on for a meeting that already has recordings requires a new
  declaration and is audited.
- **Retention**: per meeting, videos are deleted after 30 days and audio
  after 90 days by default. Deletion is permanent: unlike other attachments,
  no `.history` copy is kept. Transcripts and approved protocols stay until
  the meeting is deleted. A failed deletion shows as *Löschen fehlgeschlagen*
  and is retried; it is never reported as deleted.
- **Backups** (Duplicati) keep deleted media until the backup itself
  expires. Exclude `uploads/` files of entity type `meetingRecording` from
  long-term backup sets, or keep backup retention at or below the media
  retention.
- **Audit**: `meeting_audit_log` records uploads, AI calls (engine, model),
  policy and access changes, approvals, decisions and deletions.

## Operations

- Disk: an upload reserves twice its size (chunks + assembled file) and is
  refused when free space minus open reservations would drop below 2 GB.
- Interrupted uploads, assemblies and finalisations resume or are cleaned up
  by the worker; staging lives in `uploads/.staging/`.
- Jobs use leases with heartbeats; a crashed or hung job is picked up again
  after five minutes. Failed and blocked jobs can be retried from the
  *Aufnahmen* tab.
- Cost: transcription is billed per audio minute; the draft is one request
  per protocol version.
