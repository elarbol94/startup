# Management Platform

Self-hosted management application for a small Austrian startup: accounting,
projects/tasks, calendar, personnel, research/wiki, and German/English UI.
Read `README.md` before non-trivial work and the relevant `docs/` file before
changing its subject area.

## Commands

Run commands from the repository root.

- Install: `npm install`; develop: `npm run dev` (http://localhost:3000)
- Type check: `npm run typecheck`; lint: `npm run lint`; unit tests: `npm run test`
- Standard validation: `npm run check`; production build: `npm run build`
- End-to-end tests: `npm run e2e`

The Playwright suite starts its own server on port 3100 and uses a throwaway
SQLite database. Stop the normal development server before running it.

## Project map

- `src/app/`: App Router routes; `(app)` is authenticated UI, `(auth)` sign-in,
  `api/` route handlers, and `print/` print pages.
- `src/modules/`: domain code, normally `schema.ts`, `queries.ts`, `actions.ts`,
  and `components/`.
- `src/db/`: SQLite, Drizzle schema/migrations, and seeds. `drizzle/` is the
  ordered generated migration history.
- `src/components/ui/`: shared UI primitives. `src/i18n/` and `messages/*.json`
  provide localisation. Unit tests live as `src/**/*.test.ts`; E2E is in `e2e/`.

## Architecture and conventions

- Use TypeScript strict mode and the `@/` alias. Follow existing module and
  component patterns; keep route pages/handlers thin and domain logic in the
  owning module's queries/actions.
- Validate mutation input with Zod, use `requireUserOrThrow`/`requireAdmin`, and
  revalidate affected paths only after successful mutations.
- Add German and English messages for every UI string. New top-level modules
  must be registered in `src/modules/registry.ts` and both message files.
- For schema changes: update the owning schema, re-export it from
  `src/db/schema.ts`, run `npm run db:generate`, review generated SQL, then use
  `npm run db:migrate`. Preserve user data; avoid destructive migrations.
- Keep accounting operations transactional and auditable: retain integer cents,
  VAT/invoice invariants, and gapless per-year invoice numbering.
- Use `src/lib/files.ts` and the existing file API for attachments; do not create
  another upload store or bypass its validation.
- Keep source files small enough to read in one pass: aim for under ~500 lines
  and split files that pass ~700. Large client components keep a thin entry file
  and put pieces in a sibling folder named after the feature (for example
  `projects/components/portfolio/`): `*-types.ts`, `*-utils.ts`, `use-*.ts`
  hooks and sub-components. Server actions are grouped into sibling
  `<topic>-actions.ts` files; never re-export from a `"use server"` file.

## Important operational constraints

- Never commit secrets, `.env.local`, databases, uploads, or local runtime data;
  use `.env.example` for configuration.
- `src/instrumentation.ts` runs migrations/seeding and starts the wiki PDF worker.
  OCR requires Poppler and Tesseract; preserve documented local/Docker behavior.
- Before writing Next.js code, read the relevant guide in
  `node_modules/next/dist/docs/`. The project uses Next.js 16.3.6.

## Focused documentation

- `README.md`: setup, deployment, backup, and adding a module.
- `ACCOUNTING_INTEGRATION_CONTRACT.md`: accounting/migration invariants.
- `docs/cloudflare-access.md`: Cloudflare Tunnel/Access deployment.
- `docs/municipality-kennzahlen.md`: Ausgangsdaten vs. Kennzahlen, and how to add one.
- `docs/office-documents.md`: Word documents in ONLYOFFICE (topology, secrets,
  versions/restore, workspace plugin, local development).
- `docs/calendar-sync.md`: Google Calendar/iCal subscriptions and `.ics` imports.
- `docs/meetings.md`: meeting recordings, AI protocols, consent, retention.

## Development and deployment workflow

- Develop and test locally on the laptop.
- Commit and push completed changes to Git.
- Deploy manually on `banond`, the machine that runs the production Docker
  stack (`management-platform-*` containers), by pulling the target branch and
  restarting the application as needed. The tailnet host named `homeserver` is
  a separate Nextcloud server, not the deploy target.
- Do not pull on the production checkout, restart or rebuild the production
  containers, or otherwise modify production on `banond` unless explicitly
  asked.
- Before handoff, report the validation run and whether the change is ready to
  commit/push/deploy.
