# management-platform

Self-hosted all-in-one management app for a small Austrian start-up:

- **Buchhaltung** — Einnahmen-Ausgaben-Rechnung (cash basis): income/expense
  ledger with Austrian VAT rates (20/13/10/0 %), receipt attachments,
  monthly/yearly Auswertung with VAT overview, semicolon-CSV export for the
  Steuerberater, invoices with gapless per-year numbering (§ 11 UStG) and an
  A4 print view.
- **Projekte** — projects with kanban boards (drag & drop), tasks with
  assignees, due dates and priorities, "Meine Aufgaben" on the dashboard.
- **Wiki** — hierarchical pages with a rich-text editor (Tiptap), autosave,
  full-text search (SQLite FTS5), internal page links and backlinks.
- **i18n** — German (default) and English, switchable per user in the user menu.

## Stack

Next.js (App Router) · TypeScript · SQLite (better-sqlite3, WAL) · Drizzle ORM
· Better Auth · next-intl · shadcn/ui (Base UI) + Tailwind CSS · Tiptap ·
dnd-kit · Vitest · Playwright

## Development

```bash
npm install
npm run dev            # http://localhost:3000
```

PDF uploads that need OCR require Poppler (`pdfinfo`, `pdftotext`, and
`pdftoppm`) and Tesseract to be installed locally. On Windows, install them
with your preferred package manager and restart the dev server afterwards. If
Tesseract is not on `PATH`, set `TESSERACT_PATH` in `.env.local` to its
executable (for example `C:\\Program Files\\Tesseract-OCR\\tesseract.exe`). The
Docker image already includes both tools and the German/English OCR packs.

- The sign-in page accepts only a username and password. The first account
  created through the guarded `/api/auth/sign-up/email` bootstrap endpoint
  becomes the administrator.
  Afterwards public signup is disabled — admins invite people under
  *Einstellungen → Benutzer* or from **Benutzer einladen** on the profile page.
  Enter the recipient's email and role (member, personnel/accounting, or admin).
  They receive an email and choose their own nickname and password. The nickname
  is also their login username. No account exists until they finish setup.
  Invitation links expire after seven days and can create exactly one account.
  Opening or previewing a link does not consume it. Sending another invitation
  to the same address replaces the earlier link after successful email delivery.
  Pending invitations appear below the users list. Existing accounts stay intact.
  Administrators can also remove other users here. Removal revokes account access
  while retaining their name and existing business records for history.
  See [docs/user-invitations.md](docs/user-invitations.md) for email configuration.
- Migrations and default categories are applied automatically on server boot
  (`src/instrumentation.ts`). Manual commands: `npm run db:migrate`,
  `npm run db:seed`, `npx drizzle-kit studio`.
- Under *Settings → Profile → Appearance*, choose System (default), Light, or
  Dark for the whole platform. System follows operating-system changes
  automatically; the preference is remembered in the current browser.
- Configuration lives in `.env.local` (see `.env.example`).

For automatic live document and presentation collaboration, see
[docs/live-collaboration.md](docs/live-collaboration.md).

For wiki presentation editing, save recovery, live following and PDF export,
see [docs/presentations.md](docs/presentations.md).

For Wiki document saving, recovery, templates, Word import and validation,
see [docs/wiki-documents.md](docs/wiki-documents.md). Image captions, references,
figure lists and live laptop/server folder setup are covered in
[docs/wiki-figures.md](docs/wiki-figures.md).

### Schema changes

Edit the module schema (`src/modules/*/schema.ts`), re-export it from
`src/db/schema.ts`, then:

```bash
npx drizzle-kit generate --name <change>   # writes drizzle/NNNN_<change>.sql
npm run db:migrate
```

### Tests

```bash
npm run check   # typecheck + lint + unit tests (Vitest)
npm run e2e     # Playwright end-to-end suite
```

The e2e suite starts its own dev server on port 3100 with a throwaway
database (`data/e2e.db`). **Stop the normal dev server first** — Next.js
allows only one dev server per project.

## Deployment (Docker)

```bash
# .env next to docker-compose.yml:
#   BETTER_AUTH_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
#   BETTER_AUTH_URL=https://startup.elarbol.me
docker compose up --build -d
```

Repeat Docker builds reuse dependency downloads and the Next.js production
compilation cache. Keep Docker build caches between deployments to benefit;
the first build still performs a full compilation. Production filesystem caching
is experimental in Next.js 16.2.10 and can be disabled by setting
`experimental.turbopackFileSystemCacheForBuild` to `false` in `next.config.ts`.
Development caching and deployment commands are unchanged. Local worktrees and
generated reports (`.worktrees/`, `output/`, `playwright-report/`, `test-results/`)
are excluded from Docker builds. Local TypeScript incremental files
(`*.tsbuildinfo`) are also excluded so running a local type check does not
invalidate Docker's compilation layer; Docker retains its own TypeScript cache
under `.next/cache`.

`npm run build` generates current Next.js route types, runs the pinned native
TypeScript checker, and only then compiles the application. A failed check stops
the build. `npm run build:verified` uses the same sequence before checking the
performance budget. Docker already invokes this build command.

The native checker uses `tsconfig.build.json` to exclude stale development route
types while retaining the project's strict checks, and stores its incremental
cache separately under `.next/cache/native.tsbuildinfo`. The preview compiler is
pinned to the version tested with this project. The standard TypeScript package
remains available for Next.js, editor tooling, and `npm run typecheck`.
Direct `next build` calls still perform the standard TypeScript check; the build
runner skips that duplicate check only after native validation succeeds.

To put the application behind Cloudflare Access using the opt-in Tunnel
sidecar, follow [docs/cloudflare-access.md](docs/cloudflare-access.md).

The container stores everything under the `app_data` volume (`/data`):
`app.db` (SQLite) + `uploads/`. Put Caddy or Traefik in front for TLS.

> **Windows note:** Docker Desktop needs the WSL 2 backend. If `docker` hangs,
> install a WSL distribution first (`wsl --install`) and let Docker Desktop
> finish its first-time setup.

## Backup

The entire application state is the `/data` volume (or `./data` in dev):

```bash
sqlite3 /data/app.db ".backup /backups/app-$(date +%F).db"
rsync -a /data/uploads /backups/uploads
```

## Adding a module

1. Create `src/modules/<name>/` with `schema.ts`, `queries.ts`, `actions.ts`,
   `components/`.
2. Re-export the schema from `src/db/schema.ts` and generate a migration.
3. Add a route group under `src/app/(app)/<name>/`.
4. Register it in `src/modules/registry.ts` (sidebar) and add a `nav.<name>`
   key plus a message namespace to `messages/de.json` and `messages/en.json`.

### Personal identity

Settings → Profile → Your identity assigns the account's existing personal color
across avatars, assignments, calendar people, wiki comments and PDF evidence,
and live document/presentation collaboration. Names and initials accompany color.
Changing a color preserves authorship and recolors existing contributions.
Open pages refresh the identity palette every 15 seconds while visible and on
focus, without reloading editors or replacing their unsaved content. The saving
page updates immediately. Existing unique-color availability rules still apply.

### Version Control

Administrators can inspect saved-record history under **Settings → Version Control**,
compare/download earlier values, and restore supported records with conflict checks
and an audit trail. History starts at activation; coordinated financial and other
protected workflows retain their module-specific correction rules. Include hidden
`uploads/.history` files in backups. See [docs/version-control.md](docs/version-control.md)
for coverage, restoration boundaries, retention and focused validation.
