# Bug reporting

Signed-in users choose **Report a bug / Fehler melden** in desktop or mobile
navigation. The dialog stays on the current page. Title and observed behavior
are required; reproduction steps and expected behavior are optional. Drafts
survive dialog closing and failed requests while the application remains open;
they are not stored across page reloads.

Reports are ordinary, unassigned, medium-priority tasks in a shared Bugs project.
The first successful submission creates the project and New / Investigating /
Fixed columns (localized to the first reporter's language), mapped to dashboard
workflow stages. The project identity is stored separately from its display name.
It can be renamed or archived; archived projects reject new reports with a message
to contact an administrator. Its identity foreign key prevents deleting the
dedicated project; archive it instead. Existing report retries still work.

The additive 0064 migration creates report metadata, a project identity row, and
screenshot retry identifiers. It does not create a project or change existing
tasks. Report numbers are monotonic SQLite autoincrement IDs. Submission UUIDs
are unique and bound to the original reporter. Immediate transactions serialize
project creation, report creation, and screenshot persistence.

Reports include the pathname (without query or fragment), server build identifier,
browser user agent, authenticated reporter, and server submission time. The dialog
previews this information; preview time is replaced with actual submission time.
No page content, console output, or automatic screen capture is collected.

Up to five PNG, JPEG or WebP screenshots, 10 MB each, can be pasted or uploaded.
**Select affected area** temporarily hides the dialog and lets the reporter draw
a rectangle on the current page. Arrow keys create/move a selection; Shift plus
arrows resizes it. Escape or Cancel returns to the intact draft. Confirm renders
only the selected crop into a local PNG preview, which can be removed before
submission. Touch selection is supported. The page stays at its current scroll
position; selection controls and password field values are excluded from the
capture. Capture is rendered locally with a lazily loaded html2canvas-pro bundle,
without screen-sharing permission or an external screenshot service. Embedded,
cross-origin, and some WebGL content may not render; manual screenshot upload
remains available. Resizing the viewport clears selection (or cancels an ongoing
capture) to avoid a shifted crop, including when a phone keyboard closes.
The existing `/api/files` endpoint and task attachment store are reused, with
server-side size, MIME and signature checks for bug report tasks. Only the reporter
uploads screenshots; all signed-in users can read them under existing shared task
permissions. Upload UUIDs make retries idempotent. Saved reports survive upload
failure; the dialog retries unsaved screenshots and permits removing failed items.
Successful submissions link directly to the task, whose project and dashboard
editors show report metadata and screenshots.

Validation: `reports.test.ts` covers persistence, retry identity, shared project
creation, archived handling, authentication, and screenshot limits. The browser
test covers submission, upload retry, task detail views, workflow synchronization,
and narrow-screen navigation. No external issue service, mail, or recording is used.
