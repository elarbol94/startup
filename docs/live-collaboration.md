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
Saved means the server has stored everything the tab shows (it compares its own
Yjs state vector with the one reported for each stored version).

### Wiki pages: WebSocket transport (Hocuspocus)

Wiki pages synchronize over a WebSocket served by [Hocuspocus](https://github.com/ueberdosis/hocuspocus)
(MIT), the open-source Yjs server from the Tiptap team:

- Only changed parts travel over the socket; nothing is polled. Awareness
  (names, cursors) uses the standard Yjs awareness protocol; identities are
  always overwritten with the signed-in account on the server.
- Each tab keeps an IndexedDB copy per account and page (`y-indexeddb`). Edits
  made offline survive closing the tab and merge when the socket reconnects.
  Offline journals left in localStorage by the previous HTTP transport are
  merged once and then removed.
- The server holds open documents in memory and stores them through the existing
  room store: debounced (2 s, at most every 10 s while typing), immediately when
  a tab asks (export, navigation, templates) and when the last person leaves.
  Heading IDs and the JSON projection, revisions and indexes are updated exactly
  as before, just far less often.
- A store the server refuses (document too large, invalid content) is reported
  with its reason but never locks the editor; undoing the change lets the next
  store succeed. Oversized pastes (> 1 MB of text) and oversized Word imports are
  refused before they reach the document.
- Only lost access locks the editor: sessions and page deletion are re-checked
  every second for every connection, and such connections are closed.
- Server-side writes (history restore, version-control restore, tabs still on
  the HTTP transport during an upgrade) are merged into the open live document
  immediately, and every store merges the stored room state first, so no writer
  can overwrite another.

The WebSocket server starts with the application (instrumentation) on
`COLLAB_PORT` (default 3001; the Playwright server uses its port + 1). The editor
asks `/api/wiki/collaboration/socket` where to connect:

- `COLLAB_PUBLIC_URL`, if set (for example `wss://startup.example.at/collab`);
- otherwise in production `/collab` on the host the browser used, which the
  reverse proxy or Cloudflare Tunnel must route to `COLLAB_PORT`;
- otherwise in development `ws://<host>:<COLLAB_PORT>`.

Handshakes are accepted only from `BETTER_AUTH_URL` and
`BETTER_AUTH_TRUSTED_ORIGINS`; the session cookie authenticates the socket.
`COLLAB_DISABLED=true` skips starting the server (pages then cannot be edited).

### Presentations: HTTP transport

Presentations still use the HTTP transport described below; it also remains
available for pages so that tabs opened before an upgrade keep working.

Connection loss keeps edits locally and reconnect retries them idempotently.
Recovery storage is separated by account, item and browser tab; an acknowledgement
in one tab cannot delete another tab's offline journal. Storage failure is visible.
Application-section buttons, the wiki navigation picker and quick-note creation
wait for the current editor to save. If saving fails, navigation is blocked and
the draft stays open with an error message; retry after the connection recovers.
Access removal or deletion stops synchronization and further server writes; pending
local changes are retained. Restoring access requires reopening the editor.

Existing single-editor snapshot journals from an older application version are
not automatically applied over a collaborative document. They remain in browser
storage; the CRDT recovery journal is used for all new collaborative edits.

## Server and persistence (HTTP transport)

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
e2e/multi-user-collaboration.spec.ts e2e/collaboration-restart.spec.ts
e2e/reliable-wiki-editor.spec.ts e2e/editor-navigation.spec.ts`. Focused state/persistence/recovery tests are
`npx vitest run src/modules/wiki/collaboration --maxWorkers=1`.
The browser suite uses its worktree's disposable `data/e2e.db`; configure an unused
`PLAYWRIGHT_PORT` when other worktrees have test servers. On a heavily loaded host,
`PLAYWRIGHT_SERVER_TIMEOUT=360000` allows extra cold-start compilation time.

Deploy through the existing manual workflow, taking the usual database backup.
All active browser tabs should reload after upgrade. No paid service or separate
container is needed, but the WebSocket port must be reachable: Docker Compose
publishes it as `COLLAB_HOST_PORT` (default 3008, loopback only), and the
Cloudflare Tunnel needs a second route for path `collab` on the same hostname
(see `docs/cloudflare-access.md`). Run a single application instance: open
documents live in that process' memory, and it uses one shared SQLite database.

The implementation follows the official [Yjs document update API](https://docs.yjs.dev/api/document-updates) and [Tiptap collaboration interface](https://tiptap.dev/docs/editor/extensions/functionality/collaboration).

Client session and heading IDs use a UUID generator backed by Web Crypto, including on private HTTP previews where `crypto.randomUUID` is unavailable. IDs remain opaque; authentication and authorization still come from the signed-in session.
