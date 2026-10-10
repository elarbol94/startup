# Office documents (ONLYOFFICE)

Word documents are wiki pages whose body is a DOCX file edited in an embedded,
self-hosted **ONLYOFFICE Docs Community** editor (`documentEngine = "office"`).
The editor provides pagination, tables, track changes, comments and real-time
co-editing; the app keeps storage, access, versions and every connection to the
rest of the workspace. It is the only document editor: the old TipTap page
editor was removed. A page still stored as TipTap (`documentEngine = "tiptap"`,
only possible after restoring it from the trash) opens read-only with its old
text as HTML and, for admins, a "convert to Word document" button.

Because an office document is still a `wiki_pages` row with the same id,
tasks and deadlines (`task_contexts`), project context links, network links,
attachments, favourites and the wiki tree work unchanged.

Office documents are not presentation sources: they are excluded from
"presentation from page", the source picker and source previews.

## Topology

```text
browser ──> proxy (nginx, one origin, 127.0.0.1:3007)
              /          → app:3000
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
  it. See `page-derived-data.ts`.

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

### Trash and purge

Moving a page to the trash does not wait for the document server. A save that
arrives later is still stored as a version, but the page stays out of full-text
and semantic search until it is restored (`page-derived-data.ts` checks
`deleted_at`, and `indexText` checks again before it writes vectors).

Purging (`page-trash.ts`) takes the office lock of every page in the subtree,
in sorted order, and checks the subtree again while holding them. A page is
skipped as "open in the editor" while it has an active operation or an `open`
session that reported in within the last 24 hours. `idle` sessions do not block
a purge; they are deleted with the page. Edits the document server never saved
(for example after a save error) are then lost. That is accepted because the
page was already in the trash and an admin chose to delete it permanently.

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
Zitat, Literatur aktualisieren, PDF-Nachweis, Wiki-Link, Aufgabe, Frist,
Verknüpfung entfernen, Grammatik and Dokument formatieren.

**House styles.** New and converted documents use the paragraph styles in
`src/modules/wiki/lib/docx-styles.ts`: body text with 6 pt after each
paragraph and 1.15 line spacing, bold headings with space above and below that
stay with the next paragraph, and captions. "Dokument formatieren" applies the
same values to the styles of the open document (older documents had no heading
spacing). It changes styles only: text formatted directly keeps its formatting.
The plugin keeps its own copy of the values; `docx-styles.test.ts` checks that
both match.

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
| `mp:section-edit:{"id":…,"user":…,"at":…}` | Temporary lock around a section that is open in a section tab (see "Editing a section separately"); ignored by `docx-extract.ts` |

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

**Reading position.** The plugin reports the cursor's paragraph (debounced,
`onTargetPositionChanged`); the page keeps it per document in localStorage
(`wiki:office-position:<pageId>`, so per browser) and, when the plugin is ready and the
position is past the first ~15 paragraphs, shows a small "continue where you left
off" button for 5 seconds; clicking it sends `goToParagraph`. Links with `?task=`, `?deadline=`, `?insertEvidence=` or
`?officeAction=` skip the restore. A position beyond the end of a shortened
document is ignored.

**Mentions.** An @mention in an ONLYOFFICE comment creates a wiki
notification that carries the editor's `actionLink`
(`wiki_notifications.office_action_link`). Opening it jumps to the comment
(`?officeAction=`).

## Spelling and grammar

**Spelling while typing** is ONLYOFFICE's own checker. It follows the text
language shown in the status bar. New and converted documents start in the
page's proofing language.

**Grammar check.** "Grammatik" in the Workspace tab checks the whole document
with the app's LanguageTool service (`/api/wiki/spellcheck`), using the same
shared dictionary as the old editor, so no text leaves the server:
1. The plugin reads the non-empty paragraphs.
2. The page checks them in batches (80 paragraphs / 24 000 characters) and
   lists the issues in a side panel.
3. Clicking an issue selects it in the text. A suggestion replaces it,
   "Ignorieren" hides it, and "Ins Wörterbuch" adds a word to the shared
   dictionary.

A replacement locates its target with the editor's search (the n-th
occurrence in that paragraph) and is refused if the text there changed since
the check. Editor range positions count formatting boundaries, so plain
offsets would drift.

## Editing a section separately

Right-clicking in the document text offers **Abschnitt separat bearbeiten**
(plugin context-menu item; the navigation pane's own heading menu cannot be
extended). ONLYOFFICE cannot hide parts of a document per viewer, so the
section opens in a second editor holding only that section, on its own
platform page in a new **platform tab** (the workspace tab strip, labelled
with the section heading): `/wiki/pages/<slug>/section?edit=<lock id>` (same
access check as the document page). The document stays open in its own tab. Code:
`public/onlyoffice-plugins/management/section.js`,
`src/modules/wiki/components/office/section-editor/` and
`src/app/(app)/wiki/pages/[slug]/section/page.tsx`.

1. **Section.** The plugin reads the top-level blocks (outline level via
   `GetParaPr().GetOutlineLvl()`, so style-defined levels count) and the block
   holding the cursor. `section-logic.ts` picks the nearest heading above the
   cursor down to the next heading of the same or a higher level; text above
   the first heading is "Anfang des Dokuments". Headings inside tables or
   content controls do not count.
2. **Refusals.** It is refused while "Änderungen nachverfolgen" is on in the
   document (checked again on applying), when the section already contains a
   section-edit lock, and while another section is open in this page.
3. **Lock.** The plugin selects the blocks and wraps them in a block content
   control `mp:section-edit:{"id","user","at"}`, locked with
   `sdtContentLocked` and titled "Wird separat bearbeitet: Name". Co-editors
   see the section but cannot change it. If the section contains comments, the
   page warns first that replies may be lost (cancelling removes the lock).
4. **Section tab.** The wrapper is serialised with `ToJSON` (with its
   styles and numberings) and the document asks the workspace for a platform
   tab (`requestWorkspaceTab` in `src/components/workspace/model.ts`; from a
   pane it goes to the parent workspace as a message). The tab label is the
   section page's `h1`, i.e. the heading. If the workspace refuses (tab limit),
   the document shows a button "Abschnitt in neuem Tab öffnen". While the section is open, the document
   shows a banner "Abschnitt „…“ wird in einem anderen Tab bearbeitet" with
   **Verwerfen** (removes the lock and tells the section tab). The section
   tab gets the JSON from the document tab (see "Section channel" below) and
   loads it into its editor with `Api.FromJSON`. Its Workspace tab has no "Literatur aktualisieren",
   "Grammatik" or "Dokument formatieren"; new citations show `[…]` until the
   section is applied. Track changes is not offered there.
5. **Apply ("Übernehmen und schließen").** The section editor's body goes back
   as JSON; the main document replaces the wrapper's content with it, removes
   the wrapper (keeping the content) and, if the section contains citations,
   runs "Literatur aktualisieren" once. The document tab confirms, and the
   section tab closes itself (it asks the workspace to close its platform tab,
   `closeOwnWorkspaceTab`; as a browser tab it tries `window.close()`, and
   otherwise navigates back to the document). If applying fails, the section tab stays
   open with a message. **Verwerfen** in the section tab only removes the lock.
   Leaving the section tab, or the document tab, while a section is open asks
   for confirmation; the document tab is needed to apply.
6. **Scratch document.** The second editor uses its own document key
   `scratch-<uuid>` (`/api/wiki/office/[pageId]/section-config`). The document
   server fetches a blank DOCX built in memory from `/api/wiki/office/scratch`
   (short-lived token bound to that key), and the callback accepts and discards
   every save for scratch keys. No page, version, attachment or session row is
   created.

**Section channel.** The tabs talk over a same-origin `BroadcastChannel`
`mp-section-edit:<pageId>` (`section-channel.ts`). The section content travels
only there: never in the URL and never through the server.
- *Open.* The section tab takes the Web Lock `mp-section-tab:<lock id>` for its
  lifetime and sends `hello`; the document tab that made the lock answers with
  `open` (title and JSON). Without an answer within 5 s the tab explains that
  the section is no longer available (e.g. it was reloaded after the document
  tab was closed) and links to the document. If the Web Lock is already held,
  the section is open in another tab and the page says so.
- *Apply.* The section tab asks `who` and sends `apply` to exactly one
  document tab: the one that made the lock, otherwise the first that answered
  (the document opened again after its tab was closed). That tab commits and
  answers `applied`. If no document tab answers (or none confirms within 40 s)
  the section tab keeps its editor and offers "Dokument in neuem Tab öffnen";
  a document tab announces `mainReady` when its plugin is ready, and the
  section tab then retries.
- *Closing the section tab* means discarding. The document tab waits on the
  section tab's Web Lock; when it is freed and the tab does not come back
  within 10 s (a reload), the document tab removes the lock. Without the Web
  Locks API (non-secure origin) only the banner's **Verwerfen** and the
  stale-lock check remove it.

**Stale locks.** A lock can stay behind when a tab is closed or crashes while
a section is open. Whenever the main document opens, the plugin reports the
locks it finds and the page releases (unwraps, keeping the content) those that
are not in use:
- locks whose section tab (holding the section) or document tab is open in
  this browser (answered `ping`/`pong` on the section channel) are kept;
- locks older than 24 hours are released;
- the user's own locks are released otherwise;
- another user's lock is kept while that user is connected to the document
  (the document server's user list from the save callbacks, shown by the
  status route) and released once they are not.

If the same user has a section tab open on another device, opening the
document elsewhere releases that lock; applying there then fails with a
message and the section tab stays open so the text can be copied.

**Trade-offs (accepted).**
- `FromJSON` creates new list definitions on every apply, so a numbered list
  that continues past the section boundary may restart.
- Images are re-inserted from the JSON (base64).
- Comments in the section are recreated and may lose replies.
- `FromJSON` adds copies of the styles it carries even when the document has
  an identical style; the plugin removes those copies afterwards. This uses
  internal ONLYOFFICE objects (`Document.Get_Styles()`, `Is_Similar`); if an
  upgrade changes them, duplicate style entries may appear.
- A section that ends with a table gets an empty paragraph after it, because a
  document must end with a paragraph.

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
- **User colours.** Each user has their app colour (Settings → Profile) in the
  editor too: comment avatars, co-editors' cursors and selections, track
  changes and the header avatars. There is no DocsAPI option for this, so
  `office-user-colors.ts` seeds the editor's colour cache
  (`AscCommon.setUserColorById`) through the same-origin frame and wraps
  `AscCommon.getUserColorById` so co-editing connection ids (`user.id` plus an
  index) and author names resolve too. It runs on the frame's `load` event,
  on `onAppReady` and whenever the app's identities change. These are
  internal ONLYOFFICE functions: if an image upgrade removes them, the editor
  falls back to its own colours.
- **Logo.** The ONLYOFFICE logo stays; the licence requires it.
- **Focus mode.** The focus-mode button hides the app chrome and the details
  panel.
- **Content blockers.** Blockers such as uBlock Origin block the editor's
  `Analytics.js` module because of its name, and the editor then never
  finishes loading. Allow the site in the blocker.

## Converting old-editor documents

Word documents are the only document type. Every "new" action (the
**Neues Dokument** menu, quick notes in the inbox and sidebar, sub-documents and
the empty-state button) creates an office document. Every remaining TipTap page,
with or without the old document layout, is listed under Settings →
Word-Umstellung and can be converted; converted Word documents stay listed as
"Umgewandelt". Code blocks become shaded monospace paragraphs (one per line),
inline code keeps a monospace font.

**Dry run first.** Run it on a copy of the database and uploads. It is
read-only and writes a report plus the DOCX files:

```bash
DATABASE_PATH=/copy/app.db UPLOADS_PATH=/copy/uploads npx tsx --tsconfig tsconfig.json scripts/office-conversion-dry-run.ts --out ./dry-run
```

**Real conversion.** Only an admin can run it, from Settings → Word-Umstellung
(`convertPageToOffice`, inside the running app, one page at a time):
1. The page is marked `converting`, so every TipTap/Yjs writer refuses.
2. Open editors are disconnected, and edits held only in memory are merged
   into the stored room.
3. The body is converted and verified (`office/convert.ts`). The following
   make it fail:
   - unsupported content;
   - unresolved suggestions;
   - unreadable images;
   - any difference in citations, PDF evidence, wiki links, tasks, deadlines
     or text.

   A failure puts the page back in the old editor, unchanged.
4. Version 1 (`conversion`) is stored and the engine becomes `office`. The last
   TipTap body is kept both as a `conversion` revision and as the stored JSON,
   and "Fassung vor der Umstellung" in the editor menu shows it as read-only
   HTML.
5. Open comment threads that contain comments become Word comments. Threads
   without any comment are not carried over.

**Interruptions.** A restart during a conversion is resolved at startup: pages
left in `converting` become `office` if version 1 exists, otherwise they go
back to `tiptap`.

**Backups.** Back up `app.db` and `uploads` before converting.

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
- Two users see their app colours on comments, cursors and track changes.
- "Abschnitt separat bearbeiten": the section opens alone in the dialog with
  headings, lists, tables, images and citations; a co-editor sees it locked;
  "Übernehmen und schließen" writes it back and renumbers citations;
  "Verwerfen" leaves it unchanged; closing the tab and reopening the document
  releases the lock; no duplicate styles appear in the style gallery.

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
