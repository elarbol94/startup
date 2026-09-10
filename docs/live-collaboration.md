# Live document and presentation collaboration

Wiki pages/documents and presentations automatically join a shared editing session.
At least three users can work on the same content; there is no editor-count cap.
Existing permissions apply. Presentation viewers/commenters use the redacted read
API and never receive the shared state containing speaker notes.

## Editing and recovery

Document text and presentation rich text use Yjs/Tiptap collaboration. Both the
presentation canvas text editor and its properties editor share the same fragment.
Speaker notes also synchronize live in the editor and the authorized presenter view.
Independent property changes merge; concurrent writes to the same scalar converge
to Yjs's deterministic winner. Deleted presentation identities stay deleted when
an older peer sends movement/text updates. Viewports and selections remain local;
collaborator names, document cursors and selected presentation objects are visible.
Undo tracks the current editor's operations rather than restoring an old snapshot
of everybody's work. Structural history restoration is an explicit shared edit.

The status shows connecting, saving, saved, reconnecting, access ended or an error.
Saved means the server has committed the submitted changes. New edits during an
in-flight request remain pending. Save/export/navigation waits for pending writes.
Connection loss keeps edits locally and reconnect retries them idempotently.
Recovery storage is separated by account, item and browser tab; an acknowledgement
in one tab cannot delete another tab's offline journal. Storage failure is visible.
Do not close the editor until it says Saved if local recovery is unavailable.
Access removal or deletion stops synchronization and further server writes; pending
local changes are retained. Restoring access requires reopening the editor.

Existing single-editor snapshot journals from an older application version are
not automatically applied over a collaborative document. They remain in browser
storage; the CRDT recovery journal is used for all new collaborative edits.

## Server and persistence

`/api/wiki/collaboration/[kind]/[id]` accepts kind `page` or `presentation`:

- GET returns the initial base64 Yjs state, durable sequence and current identity.
- GET with `stream=1&after=N` streams `update`, `presence` and `denied` events.
  Reconnection supports Last-Event-ID. Updates are read from SQLite every 250 ms;
  no process-local event bus or extra service is required. Send periodic SSE
  heartbeats and disable reverse-proxy buffering for this endpoint.
- POST takes `{client, update?, presence?}`. The update is base64 Yjs binary;
  presence contains document relative cursor positions or presentation element IDs.
  Identity is taken from the authenticated account, never from the payload.

Each update is applied and validated in a synchronous immediate transaction. The
shared state, materialized JSON, revision history and document-derived indexes are
committed before acknowledgement. Embedding indexing is debounced separately.
The complete snapshot is persisted every commit; the newest 100 incremental
updates are retained. Older reconnect cursors receive a complete snapshot instead.
Presence expires after 15 seconds; it is not revision content. Streams recheck the
account, session expiry and edit permission on every tick.

Migration `0060_live_collaboration.sql` adds room, update and presence tables. Existing
items are initialized from their JSON exactly once under a write transaction.
Exports, search, document links and public presentation players continue reading
existing JSON projections. Legacy whole-document saves are rejected after a room
exists, preventing a stale browser from overwriting collaborative edits. Imports
and templates enter through the current editor; restoration, renaming and speaker
notes use the same shared state on the server.

Update bodies are limited to 4.1 MB, shared state to 8 MB, with existing document,
presentation and media validations retained. These limits are not an editor-count
limit. Extended large-document/offline endurance testing remains useful.

## Verification and deployment

Run `npm run check`, `npm run build`, and `npm run e2e --
e2e/multi-user-collaboration.spec.ts e2e/collaboration-restart.spec.ts`. Focused state/persistence/recovery tests are
`npx vitest run src/modules/wiki/collaboration --maxWorkers=1`.
The browser suite uses its worktree's disposable `data/e2e.db`; configure an unused
`PLAYWRIGHT_PORT` when other worktrees have test servers. On a heavily loaded host,
`PLAYWRIGHT_SERVER_TIMEOUT=360000` allows extra cold-start compilation time.

Deploy through the existing manual workflow, taking the usual database backup.
All active browser tabs should reload after upgrade. No paid service, additional
port or separate collaboration server is needed. Keep application instances on
one shared SQLite database; independent databases will not synchronize.

The implementation follows the official [Yjs document update API](https://docs.yjs.dev/api/document-updates) and [Tiptap collaboration interface](https://tiptap.dev/docs/editor/extensions/functionality/collaboration).

Client session and heading IDs use a UUID generator backed by Web Crypto, including on private HTTP previews where `crypto.randomUUID` is unavailable. IDs remain opaque; authentication and authorization still come from the signed-in session.
