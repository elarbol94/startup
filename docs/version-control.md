# Version Control

Administrators open **Settings → Version Control** (German: **Einstellungen →
Versionskontrolle**) to search saved-record history, compare earlier versions with
current values, download complete JSON snapshots, and restore supported records.

## Capture and scope

Migration `0061_platform_version_control.sql` adds a row journal and a restore
audit table. After migrations, the application installs persistent SQLite triggers
on every schema-owned business table selected by `policy.ts`. Installation writes
an initial snapshot of existing records and enables triggers in the same immediate
transaction. It is idempotent and refreshes trigger definitions after schema changes.
Startup awaits migration and trigger installation before seeding or starting workers.

Triggers capture every actual insert, update and delete, including cascades, raw
SQL, worker updates and writes through separate database connections. Rolled-back
transactions leave no history. No-op updates are skipped. Snapshots retain NULL
values and composite primary keys. History has no foreign keys to live records,
so removing a record cannot cascade-delete its recovery trail. Existing domain
revision tables are also captured, preserving their contents after a purge.

History begins at activation. It cannot reconstruct earlier edits, unsaved browser
changes, software releases, or files removed before retention was enabled. Git
continues to manage application code. Login credentials, public
sharing tokens, invitations, temporary sessions/leases/presence, collaboration binary
state, notifications, performance events and derived indexes are excluded. The
existing collaborative document projection is journaled after each durable save.
Account profile changes are captured for inspection but cannot restore access rights.
Original edits retain the authorship fields provided by their owning module; the
journal does not invent an actor for background or raw SQL writes.

## Recovery behavior

The panel exposes the values before and after each change. A restore is a new
mutation with its own history, administrator identity, explanation, selected source
version and resulting journal range in `platform_restores`. Earlier history is
never rewritten. Select the version immediately before a restore to undo it.

Preview binds both the current row and the latest revision for that record into a
concurrency token. Confirmation rechecks it under one immediate write transaction;
even an intervening change that returns to the same value invalidates the preview.
No database write or route refresh occurs for conflicts or rejected restorations.
Database constraints, primary-key identity, schema compatibility and parent cycles
are checked. Counters/timestamps advance rather than moving backwards. Queries and
both preview/restore server actions independently require an administrator.

Restoration replaces **one record**, not an entire project or the whole database.
Recover deleted parents before their children. Child records and links have their
own histories; recreating a parent does not silently reset or recreate its children.
An absent version is not a shortcut around a module's deletion checks.

- Customer/contact records, company settings, categories, preferences, simple wiki
  metadata and similar independent records support direct restoration.
- Project/task metadata supports direct restoration. Changes to dates, completion,
  hierarchy or other coordinated scheduling fields must use the project planner.
  Deleted project/task records can be recreated when their dependencies exist.
- Wiki documents and presentations restore through the existing collaborative room
  mutation path, updating the durable shared state and publishing a new live update.
  Document projections, search and derived links follow the existing saving code.
  Missing dependencies or unavailable presentation media reject the transaction.
- Financial/personnel/funding transactions, access membership, calendar workflows,
  source/index maintenance, graphics synchronization, evidence relationships,
  scheduling relations and existing revision/audit records remain inspectable and
  downloadable but are not directly overwritten. `policy.ts` is the explicit list.
  These require corrections through their domain workflows. This preserves invoice
  numbering, payment transitions, audit history and multi-record invariants.

This is a platform-wide history foundation with guarded record restoration, not
a universal one-click rewind of every domain workflow. Add a tested domain adapter
before enabling restoration for another coordinated record type. Do not simply
remove a table from the protection list.

## Files, retention and operations

`src/lib/files.ts` copies immutable attachment bytes into `uploads/.history/<sha256>`
before deletion or overwrite. SVG folder synchronization uses the same hook. A
restore verifies the digest and uses the current bytes or writes a fresh attachment
path from the archive, preserving a different current file. Access still goes
through the existing attachment API. Historical metadata alone cannot recover a
file whose bytes are missing. Generated PDF/OCR output is not a file backup.

There is deliberately no automatic history expiry or purge UI in this initial
implementation. Database and file history grow with edits, including autosaves and
large records. Include the **entire database and uploads directory (including hidden
.history)** in normal backups and monitor disk space. History is recovery data, not
an independent backup or tamper-proof compliance archive. A privileged database
operator can still alter the database. Large imports may take longer because each
changed row is captured transactionally.

Deploy through the existing manual Git/pull/restart workflow. Back up before upgrade;
normal startup applies the additive migration, captures baselines and installs
triggers. No homeserver deployment is performed by this implementation task.

## Focused validation

Only affected tests:

```sh
npx vitest run src/modules/settings/version-control src/lib/files-history.test.ts src/modules/wiki/collaboration/store.test.ts src/modules/wiki/figure-assets.test.ts src/modules/wiki/svg-assets.test.ts --maxWorkers=1
```

Also run type checking and lint on the changed TypeScript files. Migration and
browser checks should use a disposable database; do not reset the normal database.
