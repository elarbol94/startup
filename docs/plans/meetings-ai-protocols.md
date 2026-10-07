# Plan: Team meetings (LiveKit) with recording and AI protocols — revision 7 (Codex-approved)

Repository: /srv/management-software/.claude/worktrees/nextcloud-meetings-ai-protocols-5cba44
(Next.js 16 App Router, SQLite/Drizzle, next-intl de/en, Docker Compose on
`banond` behind nginx + Cloudflare Tunnel/Access, see AGENTS.md)

## Goal

Let the startup's **own team members** hold online, in-person and hybrid
meetings from inside the management platform, record them, and turn each
recording into a reviewed, searchable meeting protocol wired into the
platform: calendar event → meeting → transcript → protocol → tasks/wiki/
project. No external guests.

## Facts established (read-only checks, 2026-10-07)

- `banond` runs the platform stack: i7-6700T (4C/8T), 16 GB RAM, Intel
  iGPU only, ~200 GB free. Too slow for local Whisper-class transcription;
  fine for an SFU and audio recording.
- Nextcloud 32.0.11 runs on a separate tailnet host (`homeserver`) without
  Talk. It is **not used** by this plan.
- All team devices are expected to be on the company Tailscale tailnet
  (`banond` = 100.72.205.113).
- The user accepts cloud AI (OpenAI) for transcription and protocols; no
  local AI stack is needed.

## Key decisions

1. **Meeting engine: self-hosted LiveKit (SFU) on `banond`, members only,
   media over Tailscale.** The call UI is a page in the platform
   (`@livekit/components-react` + `livekit-client`); authentication is the
   platform's Better Auth session. Rejected: Nextcloud Talk (not installed;
   recording needs HPB + recording server; mixed audio only).
2. **Network topology** (verified in Phase 0):
   - *Signaling* (WebSocket) is same-origin through the existing nginx
     proxy: `wss://<app>/livekit/` → `livekit:7880`, inheriting Cloudflare
     Access + TLS. nginx forwards **only** the signaling endpoints used by
     the pinned client SDK (allow-list, e.g. `/rtc`, `/rtc/validate` and
     the pinned SDK's versioned rtc path, confirmed in Phase 0) and denies
     everything else, in particular `/twirp/` server APIs. Cloudflare Access
     only authenticates the outer connection; room authorization is the
     LiveKit token minted from `meeting_access`.
   - *Media* (ICE) uses only `banond`'s Tailscale address: LiveKit
     `rtc.node_ip` = tailnet IP, `use_external_ip: false`, UDP 7882 (single
     muxed port) and TCP 7881 published **only on the tailnet IP**, never on
     0.0.0.0, no TURN, no router port forwarding. A device without
     Tailscale gets a clear "connect to Tailscale" message (ICE timeout →
     localized error), not a hang.
   - LiveKit's HTTP API (room service, egress) is reachable only on the
     Compose network by the app.
3. **Recording: LiveKit Egress** (separate container + Redis, Compose
   profile `meetings`).
   - **Per-participant audio tracks** (Track Egress, Opus/OGG) for every
     published microphone track: attribution to the track owner (not a
     guarantee of who spoke, e.g. someone speaking near another's mic).
   - **Optional video** (Room Composite, 720p, grid layout) only when the
     host turns video recording on; default is audio-only because
     composite rendering (headless Chrome) is CPU-heavy on this machine.
     Phase 0 measures CPU use; if too heavy, video stays disabled or is
     limited to 540p.
   - Egress writes into a dedicated `egress_staging` volume (the recorder
     never sees the database or upload store); the app ingests files into
     the existing upload store using the recoverable finalization protocol
     below. No second store.
4. **In-person and hybrid meetings use the same path.** A shared room PC
   joins the LiveKit room as a participant flagged `inRoom` (server-set,
   immutable participant attribute). Its single microphone track
   contains several people and is transcribed **with diarization**; all
   other tracks are single-speaker. The upload path (phone recording etc.)
   remains as a fallback.
5. **AI: OpenAI** for transcription and protocol generation, per-meeting
   opt-out (`aiPolicy: openai | none`).
6. **Protocol generation: structured output with evidence**, following
   `src/modules/municipalities/minutes-ai.ts` (Responses API, `store:false`,
   `safety_identifier`, strict JSON schema, transcript as untrusted data,
   evidence = segment ids validated server-side).
7. **Human in the loop and explicit publishing.** AI output is always a
   draft; approval, task creation and every publication are separate,
   authorized, idempotent steps with an audience preview.

## Release 1 scope (smallest useful slice)

Upload → OpenAI transcription → protocol draft → review/edit → approval →
idempotent task creation → FTS search within the meetings module.
LiveKit calls/recording come in Phase 2, in-room mode and voice samples in
Phase 3, publishing in Phase 4.

## AI policy

Per meeting `aiPolicy`:

- `none`: no transcription, no LLM. Recording is stored/played only;
  the protocol is written manually in the same editor. The meeting is
  excluded from any AI context of other meetings.
- `openai` (default): transcription and protocol generation via OpenAI.
  Confidential meetings default to `none` (host may change it; audited).

Rules:
- Before every OpenAI request (including retries) the worker re-reads the
  meeting row and checks `aiPolicy` and `policyRevision`. Policy changes
  invalidate queued jobs (job stores the policy revision; mismatch aborts
  the job; switching to `none` cancels pending AI jobs).
- **Context material (audience)**: in Release 1 the protocol prompt
  contains only this meeting's own transcript, title, participant names
  and the agenda explicitly entered on this meeting. No material from
  other meetings, tasks or projects is included, because the generated
  protocol is readable by this meeting's whole audience. Cross-meeting
  context (later, e.g. "open items from last time") is only allowed if
  every user in the destination meeting's `meeting_access` can read the
  source meeting and the source's policy is `openai`; otherwise it
  requires an explicit, audited "share into this meeting" action by
  someone with access to both. Confidential meetings never contribute
  context automatically.
- `docs/meetings.md` documents OpenAI as processor (DSGVO), data sent
  (audio, transcript, names), and that OpenAI API data is not used for
  training by default.

## Module: `src/modules/meetings/`

Registered in `src/modules/registry.ts` (`/meetings`, icon `Video`), de/en
messages. Large client components get sibling folders
(`components/meeting-room/`, `components/meeting-detail/`,
`components/protocol-editor/`). Server actions in `<topic>-actions.ts`.

### Schema (`schema.ts`, re-exported from `src/db/schema.ts`)

Additive migration only.

- `meetings`: id, title, calendarEventId (nullable, FK set null),
  occurrenceKey (calendar's existing convention, nullable), projectId
  (nullable), status (`scheduled|live|processing|review|approved|cancelled`),
  mode (`online|in_room|hybrid|upload`), aiPolicy, policyRevision,
  confidential, recordVideo, videoRetentionDays, audioRetentionDays,
  currentProtocolId, approvedProtocolId, createdBy, timestamps.
  Unique (calendarEventId, occurrenceKey).
- `meeting_access`: meetingId, userId, role (`host|participant|viewer`).
  **This table is the authoritative ACL** (the projects module has no
  membership relation; project linkage is for navigation only). Default:
  creator = host, calendar attendees = participant. Only users in this
  table can obtain a LiveKit join token.
- `meeting_sessions` (Phase 2): id, meetingId, status
  (`open|rotating|ended`), currentRoomId, startedAt, endedAt,
  configRevision (recording on/off, video on/off, aiPolicy — bumped on
  every change), recordingClosedAt (discovery closed, see merge).
- `meeting_rooms` (Phase 2): id, sessionId, generation (unique per
  session), livekitRoomName (random, unique), state
  (`creating|active|draining|deleted`), createdAt, deletedAt. Immutable
  history: rotation adds a generation, never overwrites a name.
- `meeting_session_exclusions` (Phase 2): sessionId, userId, excludedBy,
  reason, createdAt — "remove from this meeting" without touching the
  meeting ACL; checked at every token issuance.
- `meeting_endpoints` (Phase 2): id, sessionId, roomId, userId, deviceId,
  identity (`u_<userId>_<endpointId>`, unique per session), role
  (`personal|room_pc|companion`), joinedAt, leftAt. One user may have
  several endpoints (laptop + room PC); LiveKit identity is per endpoint,
  not per user. Egress participants are excluded from attendance and
  consent checks (identified by LiveKit participant kind).
- `meeting_consents` (Phase 2): sessionId, userId, configRevision,
  givenAt, withdrawnAt, via (`self|room_operator`), operatorId.
- `meeting_room_presence` (Phase 3): sessionId, endpointId (room PC),
  userId, confirmedAt, consentConfirmedBy — people the operator marked as
  physically present.
- `meeting_recording_runs` (Phase 2): id, sessionId, roomId, desiredState
  (`on|off`), state (`starting|recording|stopping|stopped|failed`),
  configRevision (immutable; a config change always means a new run),
  reservedBytes, startedAt, stopRequestedAt, stoppedAt, stopReason.
  At most one non-terminal run per session (partial unique index). Each
  run is one **capture interval**; every interruption ends the run and
  resumption creates a new run, so `(runId, kind, trackSid)` request keys
  never collide. All legitimate runs of a session are separate inputs in
  the session transcript manifest, never treated as duplicate attempts.
- `meeting_egress_requests` (Phase 2): id, runId, kind
  (`track_audio|room_composite`), endpointId, trackSid, requestKey (unique:
  runId + kind + trackSid), outputPath (contains the request id), state
  (`pending|requested|active|ending|complete|failed|ingested|abandoned`),
  canonicalAttemptId, measuredStartMs (file media start, see timing),
  error.
- `meeting_egress_attempts` (Phase 2): id, requestId, attemptNo,
  outputPath (unique per attempt, contains the attempt id), state
  (`calling|started|unknown|failed|duplicate_stopped|abandoned`), egressId
  (nullable, unique), calledAt, resolvedAt. Persisted **before** the
  LiveKit call; at most one attempt per request in `calling|unknown`.
- `meeting_webhook_events` (Phase 2): eventId (unique), receivedAt.
- `meeting_recordings`: id, meetingId, sessionId (nullable), egressId
  (nullable, unique), attachmentId, kind (`video|audio|derived_audio`),
  speakerScope (`single` with userId | `room` for the room-PC track |
  `mixed` for uploads), egressAttemptId (nullable), offsetMs (measured
  media start relative to session start; see timing),
  durationMs, sha256, source (`livekit|upload`), consentEvidence (json),
  expiresAt, purgeState.
- `meeting_transcripts`: id, meetingId, recordingId, revision (immutable
  once `completed`), engine, model, language, status, speakerMapRevision.
- `meeting_transcript_segments`: id, transcriptId, startMs, endMs,
  speakerKey (global within transcript), text. Immutable.
- `meeting_speaker_maps`: transcriptId, revision, map json
  (speakerKey → userId|guest label). Remapping creates a new revision; it
  never mutates segments.
- `meeting_segments_fts`: FTS5 over segment text (+ meetingId) for search.
- `meeting_protocols`: id, meetingId, version, sessionTranscriptId,
  speakerMapRevision, contentJson, source (`ai|manual|ai_edited`), model,
  promptVersion, createdBy, createdAt. Append-only.
  `meetings.currentProtocolId` and `meetings.approvedProtocolId` point to
  versions; approval is an atomic compare-and-set on `currentProtocolId`
  (approving a stale version fails). An approved protocol is pinned to its
  transcript + speaker-map revision, so later remapping cannot change its
  evidence.
- Action items live **inside each protocol version's `contentJson`**
  (immutable snapshot, each with an `itemKey`). Regeneration and edits
  carry `itemKey` forward when an item is kept (AI is given previous
  keys; the editor preserves them; new items get new keys).
- `meeting_action_item_decisions`: id, meetingId, itemKey, protocolId
  (the **approved** version the decision was made against), snapshot json
  (text, assignee, due date, project as accepted), status
  (`accepted|rejected`), taskId (unique, nullable), decidedBy/At.
  Unique (meetingId, itemKey). Accepted content and task link never change
  when later versions edit the item; later versions show "already
  accepted → task X" for that key.
- `meeting_session_transcripts`: id, meetingId, revision, status,
  createdAt, inputManifest json (each source transcript id + revision,
  recording id, offsetMs, speaker-map revision), missingInputs json
  (failed/absent recordings shown in the draft). Immutable once complete.
- `meeting_session_segments`: id, sessionTranscriptId, startMs, endMs,
  speakerKey, endpointId, sourceSegmentId (provenance), text,
  possibleDuplicateOf (nullable annotation, never deletes). Protocol
  evidence references these ids. For upload meetings the session
  transcript wraps the single recording transcript.
- `meeting_jobs`: see Worker.
- `meeting_audit_log`: meetingId, actorId, action, details json, createdAt
  (record start/stop, join, consent given/withdrawn, upload, download,
  policy change, AI call with model, approval, publish, purge, participant
  removal, room rotation).

### Files / storage

Constraints found in the repo: `/api/files` reads `formData()` (buffers),
`MAX_UPLOAD_BYTES` is 50 MB, and `deleteAttachment()` copies bytes into
`uploads/.history` with a synchronous full read. Cloudflare limits a request
body to 100 MB (Free/Pro).

- **Resumable chunked upload within the existing store**: new route
  `/api/files/chunked` (`init` → `PUT chunk n` → `complete`), chunk size
  32 MB (< Cloudflare limit). `init` authorizes (session + meeting host or
  participant) and declares total size, MIME and sha256 **before** any bytes
  are accepted.
- **Upload consent declaration** (Release 1): `init` requires, and the
  server validates, a declaration that all recorded people were informed
  and agreed to the recording **and** — when the meeting's `aiPolicy` is
  `openai` — to processing by OpenAI (declaration text version, user,
  timestamp, aiPolicy at that time → `consentEvidence`). Switching an
  uploaded meeting from `none` to `openai` requires a new host
  declaration covering AI processing (audited); without it the policy
  change is rejected.
- **Space reservations**: table `media_upload_sessions` (id, userId,
  meetingId, declaredBytes, reservedBytes = 2 × declared (chunks +
  assembled file), state `uploading|assembling|finalizing|done|aborted`,
  storedName, expiresAt). `init` runs in a transaction: sum of active
  reservations + declared size must fit the per-user quota and
  `free disk − 2 GB headroom − all active reservations`; otherwise refused.
  Reservation is released on done/abort/expiry.
- Chunks go to `UPLOADS_PATH/.staging/<uploadId>/`; bytes are counted
  against the declared size. `complete`: assemble by stream into
  `.staging/<uploadId>/assembled`, verify sha256 + ffprobe, delete chunks.
- **Recoverable finalization** (filesystem and SQLite cannot be one
  transaction): (1) DB: session → `finalizing`, fixed `storedName`
  recorded; (2) FS: rename assembled file to `storedName` (same
  filesystem, atomic); (3) DB transaction: insert attachment row + recording
  row, session → `done`. `complete` and a startup/periodic reconciler are
  idempotent per step: `finalizing` with file at `storedName` and no row →
  do step 3; `finalizing` with file still in staging → redo step 2; file in
  the store with no attachment row and no session → orphan, deleted after
  24 h. Expired `uploading` sessions are aborted and their staging dirs
  removed. Interrupted `assembling` sessions are restarted from the chunks
  (partial `assembled` file discarded). All reservation checks use the full
  `reservedBytes` (2 × declared), not the declared size.
- Allowed types: mp4/webm/mkv/m4a/mp3/ogg/opus/wav, plus FLAC for derived
  audio (add to the validator; derived audio is internal, so Opus is the
  default to keep the validator change minimal).
- **Media purge path**: new `purgeMediaAttachment(id)` in `files.ts` that
  deletes the file permanently without `retainAttachmentVersion()`, allowed
  only for entity type `meeting_recording`. Accounting/wiki retention
  behavior is unchanged.
- Dependencies are explicit: `meeting_jobs.recordingId` and a
  `job_inputs` list of attachment ids per job. Purge is a job itself
  (`stage = purge`); its blocking check considers only *other* jobs in
  `queued|running` with an unexpired lease or pending retry. `failed` and
  `blocked` jobs do **not** pin media: when media expires they are set to
  `cancelled` (reason `media_expired`) in the purge transaction.
- Recording `purgeState`: `active → purging → purged`, plus
  `purge_failed` (retried with backoff, alerted in admin UI). Step 1 (DB):
  `purging` (jobs refuse to read). Step 2 (FS): unlink. Step 3 (DB):
  `purged` + attachment row removed + audit. Only `purged` is reported as
  deleted; a failed unlink leaves `purge_failed`, never `purged`.
- Playback via the existing file API with HTTP range
  (`src/lib/http-range.ts`) and the meeting ACL in `attachment-access.ts`.
- **Egress output** is written to the separate `egress_staging` volume
  (mounted into egress read-write and into the app at
  `/egress-staging`). Because that is a different filesystem from the
  upload store, finalization step 2 is **copy → fsync → sha256 verify into
  `UPLOADS_PATH/.staging/` → atomic rename within the store**, then the
  staging file is deleted after step 3. The three-step recoverable
  protocol and reconciler are otherwise identical to uploads, keyed by the
  egress attempt id.
- **Capacity**: a recording run may start only if
  `free disk − active reservations ≥ new reservation + 5 GB headroom`.
  Reservation = max duration × bounded bitrate (audio track 64 kbit/s ≈
  30 MB/h each, composite 720p ≈ 1.5 GB/h); it is increased (same check)
  for each late track and when video is enabled — if the check fails the
  extra egress is not started and the UI shows it. Limits: max 1 room
  composite and max 12 track egresses at once.
- **Limits that survive app failure**: Egress's own
  `session_limits.file_output_max_duration` (4 h) and the egress
  container's CPU/memory limits; the reconciler stops all egresses when
  free disk drops below the headroom and alerts admins; LiveKit room
  `empty_timeout` closes abandoned rooms.
- Retention: `videoRetentionDays` (default 30) and `audioRetentionDays`
  (default 90) set `expiresAt` per recording; transcripts and approved
  protocols are kept until the meeting is deleted. Purge also covers
  derived audio and staging/temp files. `docs/meetings.md` documents that
  backups (duplicati) keep purged media until backup expiry and recommends
  excluding meeting media from long-term backup sets.

### Worker (`meeting-processing.ts`)

Started from `src/instrumentation.ts` next to the PDF worker; one heavy job
at a time.

`meeting_jobs`: id, meetingId, sessionId (nullable), recordingId
(nullable), transcriptId (nullable), stage
(`ingest|extract_audio|transcribe|merge|protocol|purge`), inputRevision,
policyRevision, executionKey (unique: stage + subject id + inputRevision),
status (`queued|running|done|failed|blocked|cancelled`), attempts,
nextAttemptAt, claimToken, leaseUntil, heartbeatAt, lastError, plus
`job_inputs` (jobId, attachmentId).

- Claim = single conditional UPDATE … RETURNING on rows that are either
  `queued` with `nextAttemptAt ≤ now`, **or `running` with
  `leaseUntil < now`** (crash/hang recovery; counts as an attempt). Every
  claim writes a fresh random `claimToken` (never reused) and a new
  `leaseUntil` (5 min).
- Heartbeat (every 30 s) = UPDATE … WHERE id = ? AND claimToken = ? AND
  status = 'running' AND leaseUntil ≥ now; zero rows → the worker aborts
  the stage (kills ffmpeg/HTTP request) and discards its output.
- Completion = one transaction that first runs the same guarded UPDATE
  (token, running, unexpired lease) plus checks that the meeting's
  `policyRevision` and the recording's revision/`purgeState` still match
  the job; only then inserts outputs and the next job. Any mismatch → roll
  back, outputs discarded (temp files removed).
- On boot no special reset is needed: expired leases are reclaimed by the
  normal claim query.
- Exponential backoff, max attempts, then `failed` with a retry button
  (host). `blocked` when OpenAI is not configured.
- Re-runs create a new transcript/protocol revision; they never overwrite.
- `ffmpeg`/`ffprobe` run via `execFile` (no shell), with timeout, `nice`,
  output size limit, `-nostdin`, protocol whitelist `file` only, inside the
  app container (added to the Docker image; documented for local dev).
- LiveKit webhook handling and reconciliation are separate lightweight
  paths (see LiveKit integration), not queue stages.

Stages:
1. `ingest`: (upload) verify attachment; (LiveKit) finalize egress file,
   measure media start (see timing).
2. `extract_audio`: Opus 16 kHz mono derived audio per recording. Silence
   is **kept** (no trimming) so segment times map 1:1 to the file; cost of
   transcribing silent stretches is accepted (≈ N tracks × meeting length;
   documented). Composite video audio is never transcribed when per-track
   recordings exist.
3. `transcribe`: one job per recording (see Transcription).
4. `merge` (session-level): runs only after `recordingClosedAt` is set
   (run stopped, every egress request terminal, a reconciler pass after
   room end found nothing new) and every expected recording is terminal.
   Places every segment on the session timeline (`offsetMs +
   segment.startMs`), sorts, and writes a new session transcript revision
   with its input manifest. Possible echo duplicates (similar text,
   overlapping time, room-PC track vs. remote track) are only
   **annotated** (`possibleDuplicateOf`) and shown collapsible in the UI;
   nothing is deleted. A recording discovered later creates a new
   revision; it never alters an approved protocol.
5. `protocol`: prompt from the meeting's own material + merged transcript
   + current speaker map; validate schema and evidence; store as new
   version; set status `review`; notify host (existing notification
   mechanism).

### Transcription (OpenAI)

- Model `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-transcribe-diarize`)
  with `response_format: diarized_json`, `chunking_strategy: auto`,
  language hint `de` (overridable per meeting).
- Files are split into ≤ 20 MB Opus chunks (25 MB API limit) on silence
  boundaries without overlap; chunk timestamps are offset by chunk start
  (exact sample offsets recorded per chunk).
- **Single-speaker tracks** (`speakerScope = single`): diarization labels
  are ignored; every segment's speaker is the track owner.
- **Room-PC track and uploads** (`room`/`mixed`): diarization labels are
  chunk-local; they are reconciled into stable `speakerKey`s by passing
  short reference clips cut from the first chunk's speakers as
  known-speaker references (max 4 per request as the API allows; temporary
  clip files are deleted after the request). Unresolved speakers remain
  separate keys; the user always confirms/corrects the mapping.
- Fake engine (`MEETINGS_FAKE_AI=1`) returning fixture output for
  tests/E2E.

### Approval, editing and tasks

- Editing a protocol creates a new version (`ai_edited`/`manual`).
- Approve = CAS on `currentProtocolId`, records approver, pins revisions.
- Speaker remap → new speaker-map revision → optional "regenerate protocol"
  (new version, not approved).
- **Task creation**: extract the transactional core of task creation from
  the projects actions into a server-only domain function
  (`createTaskInTransaction(tx, input, actorId)` in
  `src/modules/projects/task-domain.ts`) that does no auth and no
  revalidation; existing `upsert…Task` actions keep their behavior and call
  it. `acceptActionItem` (meetings actions) authenticates, checks the actor
  is host/participant **and** may create tasks in the target project,
  then in one transaction: verify `protocolId` equals
  `meetings.approvedProtocolId` and that version contains `itemKey`; insert
  the decision row (unique (meetingId, itemKey) → a repeated or concurrent
  call hits the constraint and returns the existing decision/task); create
  the task from the approved snapshot (plus the user's explicit overrides
  of assignee/due date/project, validated); set `taskId`. Items cannot be
  accepted before approval.
  Revalidate after commit. The task description contains the item text and
  a link to the meeting (access-checked), not transcript excerpts —
  creating a task from a confidential meeting shows an audience warning.


### Publishing (Phase 4)

Publishing changes the audience, so it is its own authorized action:
- Dialog shows destination and resulting audience (wiki = all workspace
  members, see `attachment-access.ts`; email = listed recipients).
- Confidential meetings: publishing to the wiki is blocked; email only to
  users already in `meeting_access`, unless an admin overrides (audited).
- Wiki export: DOCX generated server-side via the existing wiki/ONLYOFFICE
  document path; PDF via a `print/` route; email via `src/lib/mail.ts`.
- Published copies are snapshots of the approved version; the meeting page
  lists where it was published.

## LiveKit integration (Phase 2)

Infrastructure (Compose profile `meetings`, opt-in like `cloudflare`;
LiveKit server, Egress and SDK versions pinned together; the Egress API
contract is chosen deliberately in Phase 0 because source-specific start
APIs are deprecated in current docs):
- `livekit` (`livekit/livekit-server`): `deploy/livekit.yaml` rendered at
  container start from env (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `LIVEKIT_NODE_IP` = tailnet IP); `rtc.use_external_ip: false`,
  `udp_port: 7882`, `tcp_port: 7881`, no TURN; `room.auto_create: false`;
  `empty_timeout` 5 min; webhook URL
  `http://app:3000/api/meetings/livekit-webhook`; Redis shared with egress.
  Ports published as `${LIVEKIT_NODE_IP}:7882:7882/udp` and
  `${LIVEKIT_NODE_IP}:7881:7881`, never 0.0.0.0.
- `egress` (`livekit/egress`): same Redis, `ws_url: ws://livekit:7880`,
  API key/secret, `session_limits.file_output_max_duration`, CPU/memory
  limits, only the `egress_staging` volume mounted (dedicated uid; the app
  reads and deletes), Chrome sandbox requirement for composite handled as
  the pinned image documents (documented in `docs/meetings.md`). Phase 0
  verifies that the egress container reaches the advertised tailnet media
  address (UDP and TCP fallback).
- `redis` (internal only, no host port).
- nginx: `/livekit/` allow-list as above, prefix stripped, WebSocket
  upgrade, long read timeout. The upstream is resolved at request time
  (`resolver 127.0.0.11` + variable `proxy_pass`) so nginx starts and the
  rest of the platform works when the `meetings` profile is off (requests
  then return 503 and the room page shows "meetings not enabled"). The
  webhook path is denied on the public proxy.
- `npm run dev`: `docker-compose.meetings-dev.yml` (`livekit-server
  --dev`, egress, redis), documented in `docs/meetings.md`.

Sessions and rooms:
- A session is opened by a server action (host or first participant):
  creates the `meeting_sessions` row and the LiveKit room explicitly via
  the server API (random name). Because `auto_create` is off, old tokens
  cannot recreate an ended room.
- **Join**: `getJoinToken(meetingId, endpointRole)` → `requireUserOrThrow`,
  check `meeting_access` (viewer role → `canPublish: false`), session
  open, and — if a recording run is active or recording is configured —
  **consent for the current `configRevision`**. Mints a token for a new
  endpoint identity (`u_<userId>_<endpointId>`) with `roomJoin`,
  `canSubscribe`, `canPublish` (participants only), `canPublishData`,
  `canUpdateOwnMetadata: false`; attributes (`inRoom`, endpoint role) are
  set server-side; **no `roomAdmin`** in browser tokens. TTL 10 min.
  Tokens are never logged.
- **Moderation** (mute, remove, end for all) only through platform server
  actions calling the LiveKit server API after host checks.
- **Revocation**: self-hosted LiveKit does not invalidate issued or
  refreshed tokens. Removing a user from `meeting_access`, deactivating an
  account, or "remove from this meeting" (which writes a
  `meeting_session_exclusions` row so the user cannot fetch a fresh token)
  triggers a durable **room rotation**, executed by the reconciler as an
  idempotent step machine:
  1. Transaction: session → `rotating` (token issuance returns
     "please retry" while rotating), insert room generation n+1
     `creating`.
  2. Create the LiveKit room n+1 (idempotent by its stored name).
  3. Transaction: room n+1 → `active`, session.currentRoomId = n+1,
     room n → `draining`, active run in room n → `desiredState off`,
     session → `open`.
  4. Stop room n's egresses, delete LiveKit room n (disconnects everyone);
     clients re-join via fresh tokens for room n+1; a new run is started
     there if recording was on.
  5. Room n → `deleted` once LiveKit confirms deletion and all its egress
     requests are terminal and ingested.
  A crash at any step resumes from the persisted state. Endpoints, runs
  and egress requests reference their room generation, so delayed
  webhooks and old-room completions are matched to the right generation;
  draining rooms keep being reconciled until step 5. Tokens are only ever
  minted for the session's `currentRoomId` while the session is `open`.
  "End meeting for all" drains and deletes the current room and ends the
  session.
- **Room page** `/meetings/[id]/room`: pre-join device check, endpoint
  role choice (`personal`, `room_pc`, `companion` = laptop of someone
  sitting in the room: mic and speaker off by default to avoid feedback),
  consent dialog, recording indicator showing the **actual** state
  (`starting / recording / partial / failed`, from confirmed egress
  status, not from the request), screen sharing, mute; host controls via
  server actions.

Consent:
- Consent is per session + `configRevision`. Any change to recording,
  video or AI policy bumps the revision.
- **Invariant: a room generation in which recording is running only ever
  admits endpoints whose users consented to that run's `configRevision`.**
  This is enforced at admission (token minting is the only way into a
  room generation, tokens are bound to one room name, and old generations
  are deleted), not by reacting to webhooks.
- While recording is on (or about to start), `getJoinToken` requires
  current consent; a user without it cannot join the recorded meeting
  (the host may instead stop recording, after which joining needs no
  recording consent).
- **Any consent-relevant change ends the run and rotates the room**:
  consent withdrawal, configuration change (video on, AI policy), adding
  a participant who has not consented, or a removal. Sequence: run
  `desiredState off` → stop all its egresses → wait for confirmed
  termination (`stopped`) → room rotation (new generation) → recording can
  resume only as a **new run** in the new generation, whose admission
  again requires consent for the then-current revision. Old tokens point
  at the deleted generation and cannot reconnect.
- **Stop tail**: the run stores `stopRequestedAt`. Media in a file after
  that instant (between stop request and confirmed termination) is cut
  off during `extract_audio` using the measured offsets, and is never
  transcribed; if the cut point cannot be determined reliably, the whole
  file of that interval is held for manual review instead of being
  transcribed automatically.
- **Room PC / physical presence**: adding a person to the presence list
  requires recording to be **paused first** (the UI disables "add person"
  while recording; operator presses pause = run stop as above). Resuming
  starts a new run after the operator confirms every present person's
  consent. Speech of non-consenting people physically in the room cannot
  be filtered technically, so such people must not be present while
  recording; this is stated in the room-PC consent text.
- **Starting** recording after an unrecorded period is also a
  consent-relevant change: it requires consent from everyone connected and
  a fresh room generation before the first egress starts.
- The order stop → confirmed termination → rotation also holds during
  crash recovery: the reconciler never rotates or resumes before the old
  run is confirmed `stopped`.
- Withdrawal is available to every participant at any time and triggers
  the sequence above; the withdrawing user is then only re-admitted after
  recording stops or they consent again.

Recording runs and egress:
- **Start**: host sets `desiredState = on` → capacity check + reservation
  → run `starting` → for each consented microphone track, persist a
  `meeting_egress_requests` row (`pending`, unique `requestKey`, output
  path containing the request id) → call StartEgress → store egressId,
  `requested`. Room composite likewise if `recordVideo`. The run becomes
  `recording` once at least one egress is confirmed active, otherwise
  `failed` with a visible error.
- **Ambiguous API failures**: each StartEgress call is one persisted
  attempt with its own output path; a timeout marks the attempt
  `unknown`. No new attempt is made while an attempt is `unknown`; the
  reconciler looks the attempt up by output path via ListEgress
  repeatedly for a resolution window (3 min). Found → `started`. Still
  absent after the window → `abandoned` and a new attempt (new output
  path) may start. If an abandoned attempt later appears, it is stopped
  immediately (`duplicate_stopped`); the request's canonical attempt is
  the earliest confirmed one, and duplicate outputs are discarded (kept
  only if the canonical attempt failed). Because paths are per attempt,
  two recorders never write the same file. While an attempt is
  unresolved, the UI shows "recording state uncertain" for that track.
- Late tracks (`track_published` webhook or reconciler) of admitted
  (thus consenting) endpoints get an egress while the run's
  `desiredState = on`.
- **Stop**: `desiredState = off` → run `stopping` → StopEgress for all
  active requests → `stopped`. The reconciler never starts egress for a
  run whose `desiredState` is off; stop then start creates a new run (new
  request keys for the same track).
- `EGRESS_LIMIT_REACHED` / failures: attempt and request `failed`, shown as "partial
  recording"; any output file that exists is still ingested.
- **Webhooks**: verified with the SDK `WebhookReceiver` (JWT signature +
  body hash), idempotent by event id, order-independent (state only moves
  forward). Webhooks are a hint, not a guarantee.
- **Reconciler** (every 30 s while a session is open, every 5 min
  otherwise, and on boot): compares DB runs/requests with LiveKit's room,
  participant and egress lists; adopts/marks egresses, starts missing
  egresses only for `desiredState = on` runs,
  resolves `unknown` attempts, advances room rotations, enqueues `ingest`
  per canonical completed attempt (`executionKey` = attempt id), closes
  sessions whose
  room is gone, and sets `recordingClosedAt` when nothing is pending.
- Native auto-egress is not used, because it bypasses consent and
  capacity gating.

Track timing (Phase 0 decides and documents one method before Phase 2):
- Candidates: (a) ffprobe of the Ogg file's first packet timestamp against
  the egress-reported file start, if Track Egress preserves mute gaps on a
  continuous timeline; (b) Participant Egress (audio-only) per endpoint
  otherwise. Egress start time is **not** assumed to equal media start.
- Spike cases: mute/unmute gaps, reconnect (new track → new egress → new
  file), late join, two endpoints of one user.
- `offsetMs` stores the measured media start.

## In-room and hybrid mode (Phase 3)

- Room PC: any logged-in member's browser on the shared PC with endpoint
  role `room_pc`; the operator maintains who is present (from
  `meeting_access`) and confirms each person's consent. Echo cancellation
  and noise suppression stay on; docs recommend a USB conference
  speakerphone. People in the room who also join on their laptop use
  `companion` mode (mic/speaker off).
- Speaker mapping UI after transcription: "Speaker A/B/C" on the room track
  → pick from present people; remote tracks are pre-labelled with their
  track owner and can be corrected.
- Persistent **voice profiles are deferred** (Phase 5, needs its own
  privacy/storage design: owner-only media, worker-only retrieval, consent
  re-check before each request, Art. 9 DSGVO consent). Room-track
  diarization + in-meeting reference clips + manual mapping cover the
  in-person requirement.

## Access control & privacy

- `meeting_access` is the only source of access; enforced in queries,
  join-token minting, file API (`attachment-access.ts`), FTS search, job
  outputs and any LLM context assembly.
- Mutations: Zod validation, `requireUserOrThrow` + host/participant
  check, revalidate after success.
- Media never leaves the tailnet except to OpenAI (audio for
  transcription). LiveKit media ports bound to the tailnet IP only; only
  allow-listed signaling paths are proxied; API secret only in env;
  webhook path not public; browser tokens carry no admin grants.
- Prompt injection: transcript is untrusted; LLM output never triggers
  actions; evidence validated.
- `docs/meetings.md`: setup (Tailscale requirement for all team devices,
  check of the Tailscale plan's user limit), Compose profile, DSGVO notes
  (purpose, retention, OpenAI as processor, consent),
  backup implications, recommended hardware (speakerphone).

## Search & Q&A (later)

- Release 1: FTS5 over segments and approved protocols, filtered by
  `meeting_access` in SQL.
- Later vector search: extend `vector-store.server.ts` with a
  `meetingSegment` kind, revision-aware ids, deletion on purge/meeting
  delete, and a viewer-aware `searchSimilar(viewerId, …)`. Q&A filters
  candidates by access and AI policy before building the prompt.

## Phases

- **Phase 0 – Spikes** (no product code; operator runs anything on the
  server): LiveKit on `banond` with media on the tailnet IP and signaling
  via nginx/Cloudflare Tunnel+Access (WebSocket upgrade works, Access
  cookie accepted, exact signaling paths of the pinned SDK, `/twirp`
  unreachable from outside, ICE connects over Tailscale from laptop and
  phone incl. TCP fallback and Tailscale reconnect); egress container →
  tailnet media connectivity; track timing method (see above); Room
  Composite CPU load at 720p/540p on the i7-6700T; room rotation UX;
  `gpt-4o-transcribe-diarize` quality on German room-mic audio with
  in-meeting reference clips; Tailscale plan user limit.
- **Phase 1 – Release 1**: module, schema, chunked upload, purge path,
  worker/jobs, OpenAI transcription, protocol draft, review/edit/approve,
  speaker mapping, idempotent tasks, FTS, retention, audit log,
  `docs/meetings.md`.
- **Phase 2 – LiveKit online meetings**: Compose profile, nginx route,
  explicit room creation, endpoint identities, join tokens, room page,
  consent revisions, room rotation, recording runs + egress requests
  (per-track audio + optional composite video), capacity/limits,
  webhooks + reconciler, egress ingest, attendance, merge stage, calendar "Online meeting" toggle and join buttons
  (calendar event + dashboard "next meeting").
- **Phase 3 – In-room/hybrid**: room-PC and companion modes, presence +
  consent list, diarized room track with reference clips, duplicate
  annotations, speaker mapping.
- **Phase 4 – Publishing**: wiki/PDF/email with audience checks; project
  meetings tab; open action items from the previous occurrence.
- **Phase 5 – Extras**: vector search, Q&A, agenda assistant,
  time-tracking suggestions, voice profiles (separate privacy design).

## Testing

Unit (Vitest):
- job claim/lease/heartbeat, expired-worker completion discarded, atomic
  output + next job, backoff, policy revision mismatch aborts job;
- AI policy: `none` blocks all OpenAI calls, recheck before retry, Release 1
  prompt contains only the meeting's own material;
- upload declaration required and validated; `none → openai` switch
  rejected without a new AI declaration;
- chunked upload: auth before bytes, size mismatch, interrupted upload
  cleanup, disk-space refusal, sha mismatch, atomic finalize; concurrent
  inits exceed reservations → second refused; crash between rename and row
  insert → reconciler completes; orphan file cleanup;
- retention vs. active jobs; purge does not write `.history`; purge with
  failed job → job cancelled, media purged; unlink failure → `purge_failed`;
- protocol schema + evidence validation; approval CAS on stale version;
- action items: acceptance refused before approval and for a non-approved
  version; a newer draft editing an item does not change the accepted
  snapshot/task; concurrent duplicate acceptance → one task;
- jobs: worker that never returns → reclaimed; late completion with old
  claimToken discarded; late completion after expiry discarded;
- LiveKit: join token only for `meeting_access` users, viewer cannot
  publish, no admin grants, consent required for current config revision,
  late joiner during active run must consent first; webhook signature
  rejection, duplicate/out-of-order events; ambiguous StartEgress timeout:
  no retry while `unknown`, adoption when it appears inside the window,
  and a first attempt that only becomes visible after a second attempt
  started is stopped as duplicate (one canonical file); stop/start race
  creates a new run and the reconciler never restarts a stopped run;
  room rotation: crash after each step resumes correctly, old-room
  completion arriving after rotation is attributed to its generation,
  removed user's fresh-token request is refused, old room cannot be
  recreated; token minting refused without current consent while
  recording; withdrawal / config change → run stopped, termination
  confirmed, room rotated, recording resumes only as a new run; an old
  token reconnect while a composite is running (with webhooks delayed or
  dropped) cannot join the new generation (integration test against a
  real `livekit-server --dev` + egress in CI-less manual/compose test);
  "add person" disabled while recording on the room PC; stop-tail media
  after `stopRequestedAt` is cut and not transcribed; withdraw and
  re-consent without unpublishing the track → two runs, two intervals with
  correct offsets, no uniqueness error, both in the manifest;
  capacity formula and late-track reservation increase; app down during
  recording → egress max duration and reconciler recovery on boot;
- nginx: platform starts with `meetings` profile off (503 page on
  `/livekit/`), `/livekit/twirp/*` denied with profile on;
- merge: waits for `recordingClosedAt`; late recording → new revision,
  approved protocol unchanged; offsets from measured media start;
  reconnect producing two files; duplicates annotated not dropped;
  single-speaker tracks ignore diarization labels; composite audio not
  transcribed;
- transcription chunk offsets and speaker-key reconciliation; reference
  clip temp files deleted.

E2E (Playwright, fake AI engine): upload fixture audio → transcript →
protocol → edit → approve → accept action item twice → one task;
non-participant gets 403 on meeting page, recording file, join token and
search. LiveKit room join is covered by a manual test checklist (real
devices over Tailscale) because the e2e environment has no SFU.

## Open questions for the user

1. Team size (Tailscale free-plan user limit) and whether every member's
   phone should be able to join (Tailscale app on phones).
2. Video recording: default off (audio only, video on demand) unless the
   user wants otherwise.
