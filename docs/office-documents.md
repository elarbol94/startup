# Office documents (ONLYOFFICE)

Word documents are wiki pages whose body is a DOCX file edited in an embedded,
self-hosted **ONLYOFFICE Docs Community** editor (`documentEngine = "office"`).
The editor provides pagination, tables, track changes, comments and real-time
co-editing; the app keeps storage, access, versions and every connection to the
rest of the workspace. Plain wiki pages and quick notes keep the TipTap editor
(`documentEngine = "tiptap"`).

Because an office document is still a `wiki_pages` row with the same id,
tasks and deadlines (`task_contexts`), project context links, network links,
attachments, favourites and the wiki tree work unchanged.

Office documents are not presentation sources: they are excluded from
"presentation from page", the source picker and source previews.

## Topology

```text
browser ──> proxy (nginx, one origin, 127.0.0.1:3007)
              /          → app:3000
              /collab    → app:3001   (TipTap live collaboration)
              /office/   → onlyoffice (virtual path, WebSockets)
onlyoffice ──> http://app:3000/api/wiki/office/{file,callback}   (private network)
app        ──> http://onlyoffice/{command,converter}              (private network)
```

- **Same origin.** The workspace plugin is served by the app
  (`public/onlyoffice-plugins/management`) and calls app APIs with the normal
  session cookie. One Cloudflare Access application covers everything.
- **Trust decision.** ONLYOFFICE's JavaScript runs with the app's origin
  privileges. We accept this because:
  - the image is pinned and self-hosted;
  - macros are off;
  - bundled and marketplace plugins are disabled (`PLUGINS_ENABLED=false`), so
    only our plugin is loaded;
  - session cookies are HttpOnly.
- **Mobile.** The Community edition edits on desktop browsers only; on phones
  documents are view-only. The page shows a notice.
- **Licence.** The image is used unmodified under the AGPL. The Community
  edition allows 20 simultaneous connections.

## Configuration

| Variable | Purpose |
|---|---|
| `ONLYOFFICE_INBOX_SECRET` | Signs editor configs and CommandService/ConvertService requests (also the document server's `browser` secret) |
| `ONLYOFFICE_OUTBOX_SECRET` | Verifies the document server's save callbacks; use a different value |
| `ONLYOFFICE_INTERNAL_URL` | Document server as seen from the app (`http://onlyoffice`) |
| `APP_INTERNAL_URL` | App as seen from the document server (`http://app:3000`) |
| `ONLYOFFICE_PUBLIC_PATH` | Browser path of the document server (`/office`) |
| `OFFICE_DISABLED` | `true` shows office documents as downloads only |

Both secrets must be at least 32 characters. The image supports only a single
`JWT_SECRET`, so `deploy/onlyoffice-entrypoint.sh` renders separate secrets
into `local-production-linux.json`. It also enables `autoAssembly`, which
force-saves open documents every 5 minutes.

The document server verifies the browser config token with the **inbox**
secret (confirmed against 9.4.0.1). File URLs the document server fetches carry
an app-only token derived from `BETTER_AUTH_SECRET` (HKDF). It is bound to one
page, version and resource (`docx` or `changes`) and expires after an hour.

## Storage and versions

Tables: `wiki_office_documents` (head pointer), `wiki_office_sessions`,
`wiki_office_versions` and `wiki_office_operations`. They are excluded from
Settings → Version Control. Office history is its own UI.

- **Files.** Each version is a DOCX attachment (`entityType =
  "wikiOfficeDocument"`, read-only through `/api/files`). The changes ZIP from
  the callback is stored alongside it.
- **Staging.** Files are staged under unique immutable names before the database
  transaction. A failed commit deletes only the files it staged. A daily sweep
  removes unregistered `.docx`/`.zip` files older than an hour.
- **Head.** `head_version_id` is the authoritative version, and search text, FTS,
  embeddings, backlinks, cited sources and PDF evidence are always derived from
  it. See `page-derived-data.ts`, which is shared with the TipTap save path.

### Sessions and callbacks

An editing session is one ONLYOFFICE document key. `getOrOpenSession`:
- reuses the current session while it is `open` or `idle`, including after
  status 3/4/7, because the document server keeps its changes for that key;
- mints a new key from the head only after the session was `finalized`
  (status 2) or `superseded` (restore).

Reopening a key after status 2 does not work, which the spike confirmed.

Callbacks are processed one at a time per page (in-process lock; the app runs
as a single Node process). Only the verified JWT `payload` is used.

| Status | Effect |
|---|---|
| 1 | Session `open`, connected users recorded |
| 6 (forcesave: command, Save button, autoAssembly) | Version stored, key kept |
| 2 (last editor left) | Version `final`, session `finalized`, next open gets a new key |
| 3 / 7 | Error recorded; session stays reusable; nothing replaced |
| 4 | Session `idle` (no changes) |

**Ordering.** `lastsave` has one-second resolution. A save becomes head only
when it comes from the current session and `lastsave >= head_lastsave` of that
session; ties are broken by arrival order under the lock. Everything else is
stored as a `branch` version: it is recoverable from "Versionen" and never
promoted automatically, and the header then shows "Wiederhergestellte
Änderungen".

**Downloads.** Result URLs reported by the document server use the public
origin. `office-http.ts` accepts only `…/cache/files/…` paths and always fetches
them from `ONLYOFFICE_INTERNAL_URL`, with no redirects, a 30 s timeout and a
50 MB cap. Callback DOCX files are unpacked under explicit limits
(`docx-safety.ts`) before being parsed.

### Restore

Restore is a persisted operation (`wiki_office_operations`, at most one active
operation per page):
1. It records the current session and head.
2. It sends CommandService `drop` to all editors.
3. It waits until their final save is stored: status 2, status 4, or the session
   was already idle.
4. It commits a `restore` version as head.

Saves arriving meanwhile still advance head. If nothing is stored within 60 s,
the restore **fails and changes nothing**, so no edits are lost. At startup,
operations still `created` resend the drop, and those past their deadline fail.

### Save state in the UI

- **"Synchronisiert"** means the document server has the edits.
- **"Gespeichert: Version n"** comes from `/api/wiki/office/[pageId]/status`: the
  head the app stored.
- **"Version speichern"** reports success only when the status-6 callback that
  carries its operation id was stored.

## Export

- **From the open editor:** "Als PDF/DOCX exportieren" uses DocsAPI `downloadAs`,
  which converts the live editor state, including unsaved typing.
- **Outside the editor:** `/api/wiki/office/[pageId]/export?format=pdf|docx[&version=]`
  exports a stored version. PDF goes through ConvertService.

## Workspace tab and connections

The plugin (`public/onlyoffice-plugins/management`) runs in the background for
every editor. It adds a **Workspace** tab to the toolbar with these buttons:
Zitat, Literatur aktualisieren, PDF-Nachweis, Wiki-Link, Aufgabe, Frist and
Verknüpfung entfernen.

**How the buttons reach the app.** Buttons that need a choice ask the page,
through a `BroadcastChannel` named per editor instance (`bridgeId` from the
config route), to open the app's own dialogs:
- `office-insert-dialog.tsx` for sources, PDF highlights and wiki pages;
- the regular task and deadline dialogs.

The page answers with commands that the plugin applies to the document
(`use-office-bridge.ts`).

**Connections are content controls with tags:**

| Tag | Meaning |
|---|---|
| `mp:cite:{"ids":[…],"loc":"…"}` | Citation(s) with an optional locator. "Literatur aktualisieren" renumbers them and rewrites the `mp:bibliography` block, using the page's citation style and locale. Inserts inside the bibliography are refused |
| `mp:evidence:{"id":…}` | PDF highlight quote with a link to the reader |
| `mp:task:{"id":…}`, `mp:deadline:{"id":…}` | Selection turned into a task or deadline; `?task=`/`?deadline=` links select the control again |

Normal hyperlinks to `/wiki/pages/<slug>` become backlinks.

On every stored version `docx-extract.ts` reads these controls back:
- tracked deletions and empty controls do not count;
- tracked insertions do;
- footnotes, headers and footers are searchable.

Deleting a control, or its text, removes the relation with the next save.

**Details panel.** "Verknüpfungen im Text" lists the document's tasks,
deadlines, cited sources and PDF evidence (`/api/wiki/office/[pageId]/connections`).
Clicking an entry selects its passage in the editor.

**Save version.** "Version speichern" also stores a PDF of that version as a
page attachment ("Titel – Version n.pdf").

**Mentions.** An @mention in an ONLYOFFICE comment creates a wiki
notification that carries the editor's `actionLink`
(`wiki_notifications.office_action_link`). Opening it jumps to the comment
(`?officeAction=`).

## Look and feel

- **Theme.** The editor follows the app's light/dark appearance
  (`customization.uiTheme`). The editor stores its own theme choice in
  localStorage, which would win over the config, so the page clears it when it
  no longer matches the app.
- **Toolbar.** The tabs Zeichnen, Schutz and Plugins are hidden. The
  Community edition ignores `customization.layout` and `customization.logo`,
  because they need a commercial licence. The editor frame is same-origin, so
  the page injects a small stylesheet on `onAppReady` instead. If ONLYOFFICE
  changes its markup, those tabs simply show again.
- **Logo.** The ONLYOFFICE logo stays; the licence requires it.
- **Focus mode.** The focus-mode button hides the app chrome and the details
  panel.
- **Content blockers.** Blockers such as uBlock Origin block the editor's
  `Analytics.js` module because of its name, and the editor then never
  finishes loading. Allow the site in the blocker.

## Local development

```bash
# .env.local
ONLYOFFICE_INBOX_SECRET=<32+ chars>
ONLYOFFICE_OUTBOX_SECRET=<32+ chars, different>
ONLYOFFICE_INTERNAL_URL=http://localhost:8085
APP_INTERNAL_URL=http://host.docker.internal:3000
```

```bash
docker compose -f docker-compose.office-dev.yml --env-file .env.local up -d
npm run dev -- -H 0.0.0.0
```

Open the app on **http://localhost:8086**, the proxy's single origin. On
Linux, `host.docker.internal` resolves through `extra_hosts: host-gateway`.

## Tests

- **Unit** (`src/modules/wiki/office/*.test.ts`): tokens, bounded unzip,
  extraction, URL mapping, and the callback/session/restore/checkpoint state
  machines. The callback tests use payloads captured from the pinned server
  (`__fixtures__/callbacks-9.4.json`).
- **E2E:** `e2e/office-documents.spec.ts` runs without a document server by
  signing callbacks itself.
- **Release gate:** before upgrading the image, rerun the real-server checks in
  the checklist below.

### Real-server checklist (pinned image)

- Create a document and type; "Version speichern" stores a version.
- A second editor joins the same session.
- A plugin citation and bibliography create `wiki_page_sources`.
- Live PDF export includes the last keystrokes.
- Stored PDF export works.
- Closing all editors produces a `final` version.
- Restoring an old version works while another editor is connected.
- Restarting the document server mid-edit still delivers the final callback.
- An @mention in a comment creates a wiki notification.

## Spike results (9.4.0.1, 2026-09-28)

**Verified:**
- the JWT header-token callback format;
- forcesave `userdata` round-trip and `error 4` (no changes);
- `info` and `drop`;
- same-key reconnect after status 4;
- `autoAssembly` (`forcesavetype` 2);
- content-control tags surviving in the saved DOCX;
- `plugins.options` reaching the plugin;
- the plugin's `fetch` carrying the app cookie;
- `downloadAs` and ConvertService;
- final callback delivery after `docker restart`.

**Not verified automatically:**
- `onRequestSendNotify` for @mentions (manual check);
- WebSockets through the production Cloudflare Tunnel.
