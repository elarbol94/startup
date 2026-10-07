# Meetings: recordings and AI protocols

The **Besprechungen** module (`/meetings`, shortcut `G B`) turns a meeting
recording into a reviewed protocol: upload or online call → transcript → AI
draft → review → approval → action items become tasks. Recordings come from
uploads (phone, laptop, in-person meeting) or from online calls in the
platform (LiveKit). Background: `docs/plans/meetings-ai-protocols.md`.

## Online calls

- **Start**: *Call starten* on a meeting (hosts and participants). Recording
  is chosen when the call starts and applies to the whole call; to change it,
  end the call and start a new one.
- **Join**: everyone on the meeting's access list; viewers listen without
  camera/microphone. For a recorded call each person must consent (and to
  OpenAI processing when the meeting uses AI) before the server issues a
  join token — no consent, no token.
- **Network**: signaling goes through the normal site (`/livekit/rtc…` via
  nginx and Cloudflare Access); audio and video go directly to `banond`'s
  Tailscale address (UDP 7882, fallback TCP 7881). **Tailscale must be on**
  on every device; the platform shows "Verbindung fehlgeschlagen" otherwise.
- **Recording**: each person's microphone is recorded as its own Opus track
  (LiveKit Egress, no transcoding, ~0.15 CPU core per person). Speakers are
  therefore known exactly; the transcript interleaves the tracks by time. A
  combined video recording is deliberately not offered: on this server one
  720p composite needs about four CPU cores.
- **Ending**: hosts or whoever started the call press *Call beenden*; an
  empty call closes after ten minutes. Removing someone from the meeting or
  changing its AI setting ends a running call (issued LiveKit tokens cannot
  be revoked); the others simply rejoin.
- **Afterwards**: the recordings are taken into the upload store within a
  minute and processed like uploads.

### Setup

```bash
# .env next to docker-compose.yml
LIVEKIT_API_KEY=meetings
LIVEKIT_API_SECRET=<openssl rand -hex 32>
LIVEKIT_NODE_IP=<tailscale ip -4>
docker compose --profile cloudflare --profile meetings up --build -d
docker compose restart proxy   # picks up deploy/nginx.conf changes
```

Without the `meetings` profile (or with empty keys) the call buttons are
hidden and the rest of the platform is unaffected. For `npm run dev`, run a
local `livekit-server --dev` and set `LIVEKIT_API_KEY=devkey`,
`LIVEKIT_API_SECRET=secret`, `LIVEKIT_URL=http://localhost:7880`,
`LIVEKIT_PUBLIC_URL=ws://localhost:7880`.

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
