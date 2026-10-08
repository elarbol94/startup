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
  camera/microphone. Others join with the microphone on and the camera off;
  the camera is switched on in the call's control bar. A shared screen fills
  the main area while everyone else stays visible beside it (below it on
  narrow screens). A recorded call shows a red *Aufnahme läuft* indicator
  in the header and over the video.
- **While it runs** the meeting page shows a *Call läuft* badge and who has
  *joined* since the start, with the time. This counts issued join tokens,
  not live presence: people who left are still listed. The meeting list
  marks meetings with a running call and can filter for them. For a recorded call each person must consent (and to
  OpenAI processing when the meeting uses AI) before the server issues a
  join token — no consent, no token.
- **Network**: signaling goes through the normal site (`/livekit/rtc…` via
  nginx and Cloudflare Access); audio and video go directly to `banond`'s
  Tailscale address (UDP 7882, fallback TCP 7881). **Tailscale must be on**
  on every device; the platform shows "Verbindung fehlgeschlagen" otherwise.
- **Recording**: each person's microphone is recorded as its own Opus track
  (LiveKit Egress, no transcoding, ~0.15 CPU core per person), listed as
  *Call-Aufnahme · Name · start time*. Speakers are
  therefore known exactly; the transcript interleaves the tracks by time. A
  combined video recording is deliberately not offered: on this server one
  720p composite needs about four CPU cores.
- **Ending**: hosts or whoever started the call press *Call beenden*. A call
  nobody from the meeting is in any more ends after ten minutes (recorders
  do not count). When nobody has spoken for 15 minutes, each browser asks
  *Noch da?* and leaves the call after another minute without an answer, so
  a forgotten tab does not keep a call and its recording running. Background
  music counts as speech here, so independently of speech the same prompt
  also appears every three hours in a call. Removing someone from the meeting, demoting
  them to viewer or changing its AI setting ends a running call (issued
  LiveKit tokens cannot be revoked); the others simply rejoin.
- **LiveKit failures**: ending a call marks it ended at once (nobody can
  rejoin) and stops all its recorders, even if LiveKit cannot delete the
  room; the worker retries the deletion every ~30 s and gives up after ten
  attempts (`meeting_call_room_given_up` in the log). A recorder of an ended
  call that is still running is stopped; a track whose recorder failed three
  times is no longer restarted.
- **Dead rooms**: after a LiveKit restart, Redis can keep listing a room
  under the old, gone node. When nobody from the meeting is listed in a
  room, the worker sends it a request only its own node answers (a room
  metadata update); if that, or the room listing itself, answers
  `unavailable` on two checks in a row (~1 min), the call ends as
  `roomDead` instead of waiting the ten minutes.
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
   A failed upload can be resumed (*Fortsetzen*), and after a reload choosing
   the same file again in the same tab continues it: the browser remembers
   the upload per file in `sessionStorage` and sends only the chunks the
   server does not have yet. *Schließen* gives the upload up and frees its
   reserved space; otherwise it expires 24 hours after it started.
4. The meeting worker (started from `src/instrumentation.ts`) runs the stages
   `ingest` (ffprobe) → `extract_audio` (16 kHz mono Opus) → `transcribe`
   (OpenAI, diarized; see *Silence and implausible tracks*) → `merge` (one meeting timeline) → `protocol` (OpenAI,
   structured output). Every decision and action item must cite transcript
   lines; uncited ones are dropped.
5. Participants review the draft, name the speakers and edit the protocol.
   Speakers of call tracks are named from the recording automatically and are
   not offered for naming; only voices of uploads need a person.
   Each edit is a new version. A host approves exactly the version they saw.
6. Action items of the approved protocol are accepted one by one; each
   creates exactly one task linked back to the meeting.

### Silence and implausible tracks

- Before transcription, ffmpeg `silencedetect` (−35 dB) finds silences.
  Silences of 10 s or more are cut out (1 s of padding kept on each side) when
  that removes at least 30 s; the compacted audio is sent to OpenAI and every
  timestamp is mapped back to the original (`processing/silence.ts`). A track
  that is entirely silent is not sent at all. The skipped time is in the
  `ai.transcribe` audit entry.
- Music is not silence. After transcription, the *Aufnahmen* tab warns on a
  recording when a call track is much longer than its call or than the other
  tracks of the call, or when its transcript is mostly in another language
  than the meeting (German/English function-word heuristic,
  `recording-warnings.ts`). The warning is informational; delete the
  recording and recreate the draft if it is garbage.

The transcript is untrusted input: the AI output never triggers anything on
its own, and nothing leaves the meeting without a person's action.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | – | Required for transcription and drafts. Without it, AI jobs show as *blocked*. |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-transcribe-diarize` | Speech-to-text with speaker separation. |
| `OPENAI_MEETINGS_MODEL` | `gpt-6-astra` | Protocol drafts (Responses API, `store: false`). |
| `MEETINGS_MAX_UPLOAD_BYTES` | 4 GiB | Largest single recording. |
| `MEETINGS_TRANSCRIBE_CHUNK_SECONDS` | 1200 | Long recordings (after removing long silences) are transcribed in chunks cut at silences. |
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
  by the worker; staging lives in `uploads/.staging/`. A chunk that arrives
  after its upload was cancelled or handed to assembly is refused (409), never
  written into the files being assembled.
- The worker runs two independent loops every five seconds: the job queue
  (one job at a time) and maintenance (upload assembly, call recordings,
  retention), each maintenance task guarded against overlapping itself. A
  long transcription therefore never delays uploads or calls.
- Only one AI protocol draft per meeting is queued or running at a time;
  *Neu erstellen* is refused meanwhile.
- A failed upload stays listed in the *Aufnahmen* tab for seven days; the
  uploader or a host can hide it earlier (*Ausblenden*).
- Deleting a meeting removes its files only after the database deletion has
  committed, so a failed deletion never loses media. Files whose unlink fails
  keep their attachment row (unreachable without the meeting) until the sweep
  below removes them.
- Orphan sweep (worker, once a day and after each restart; log event
  `meeting_orphan_sweep` with counts and bytes): removes meeting recording
  attachments older than a day whose meeting or recording row is gone;
  recorder files (`<attempt>.ogg` in `LIVEKIT_EGRESS_DIR`, only when calls are
  configured) older than a day whose attempt is unknown, ingested, failed or
  abandoned; and entries in `uploads/.staging/meeting-uploads`,
  `meeting-derived` and `meeting-calls` older than two days with no live upload,
  job or call recording. Nothing outside these places is touched.
- Jobs use leases with heartbeats; a crashed or hung job is picked up again
  after five minutes. Failed and blocked jobs can be retried from the
  *Aufnahmen* tab.
- Cost: transcription is billed per audio minute; the draft is one request
  per protocol version.
