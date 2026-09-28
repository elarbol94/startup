# Live presentation collaboration

Presentations automatically join a shared editing session. At least three users
can work on the same presentation; there is no editor-count cap. Existing
permissions apply. Viewers and commenters use the redacted read API and never
receive the shared state containing speaker notes.

Wiki documents are Word documents edited in ONLYOFFICE, which has its own
co-editing; see [office-documents.md](office-documents.md). The old wiki-page
editor and its WebSocket server (`/collab`) were removed.

## Editing and recovery

Presentation rich text uses Yjs/Tiptap collaboration. The canvas text editor and
the properties editor share the same fragment. Speaker notes also synchronize
live in the editor and the authorized presenter view. Independent property
changes merge; concurrent writes to the same scalar converge to Yjs's
deterministic winner. Deleted presentation identities stay deleted when an older
peer sends movement/text updates. Viewports and selections remain local;
collaborator names and selected presentation objects are visible. Undo tracks the
current editor's operations rather than restoring an old snapshot of everybody's
work. Structural history restoration is an explicit shared edit.

The status shows connecting, saving, saved, reconnecting, access ended or an error.
Saved means the server has stored everything the tab shows (it compares its own
Yjs state vector with the one reported for each stored version).

Connection loss keeps edits locally and reconnect retries them idempotently.
Recovery storage is separated by account, item and browser tab; an acknowledgement
in one tab cannot delete another tab's offline journal. Storage failure is visible.
Application-section buttons and the wiki navigation picker wait for the current
editor to save. If saving fails, navigation is blocked and the draft stays open
with an error message; retry after the connection recovers. Access removal or
deletion stops synchronization and further server writes; pending local changes
are retained. Restoring access requires reopening the editor.

## Server and persistence (HTTP transport)

`/api/wiki/collaboration/presentation/[id]`:

- GET returns the initial base64 Yjs state, durable sequence and current identity.
- GET with `stream=1&after=N` streams `update`, `presence` and `denied` events.
  Reconnection supports Last-Event-ID. Updates are read from SQLite every 250 ms;
  no process-local event bus or extra service is required. Send periodic SSE
  heartbeats and disable reverse-proxy buffering for this endpoint.
- POST takes `{client, update?, presence?}`. The update is base64 Yjs binary;
  presence contains the selected presentation element IDs. Identity is taken from
  the authenticated account, never from the payload.

Each update is applied and validated in a synchronous immediate transaction. The
shared state, materialized JSON and revision history are committed before
acknowledgement. The complete snapshot is persisted every commit; the newest 100
incremental updates are retained. Older reconnect cursors receive a complete
snapshot instead. Presence expires after 15 seconds; it is not revision content.
Streams recheck the account, session expiry and edit permission on every tick.

Migration `0060_live_collaboration.sql` adds room, update and presence tables.
Rooms of old wiki pages (`page:<id>`) are only read by the Word conversion, which
uses their last stored state when converting a page.

Update bodies are limited to 4.1 MB, shared state to 8 MB, with existing
presentation and media validations retained. These limits are not an
editor-count limit.

## Verification and deployment

Run `npm run check`, `npm run build`, and `npm run e2e --
e2e/multi-user-collaboration.spec.ts e2e/editor-navigation.spec.ts`. Focused
state/persistence/recovery tests are `npx vitest run src/modules/wiki/collaboration --maxWorkers=1`.
The browser suite uses its worktree's disposable `data/e2e.db`; configure an unused
`PLAYWRIGHT_PORT` when other worktrees have test servers.

Deploy through the existing manual workflow, taking the usual database backup.
Run a single application instance; it uses one shared SQLite database.

The implementation follows the official [Yjs document update API](https://docs.yjs.dev/api/document-updates) and [Tiptap collaboration interface](https://tiptap.dev/docs/editor/extensions/functionality/collaboration).
