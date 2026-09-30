# Frontend design pack

A snapshot of the presentation layer of the management platform, meant to be
opened in Claude Design (or any design tool) and improved without the backend
around it. Nothing here is compiled, linted or type-checked by the app.

## Layout

```
design/
  README.md          this file
  source/            generated snapshot, mirrors the repo layout
    src/app/globals.css        design tokens (oklch CSS variables, light + dark), Tailwind v4 setup
    src/app/layout.tsx         root layout, providers, fonts
    src/app/(app)/**           authenticated routes: layouts, pages, loading states
    src/app/(auth)/**          sign-in and invite pages
    src/app/print, share       print (invoice, presentation) and share pages
    src/components/ui/**       shared primitives (button, dialog, table, tabs, ...)
    src/components/**          app shell: sidebar, page header, user menu, focus mode
    src/modules/*/components   feature UI per module (accounting, projects, wiki, ...)
    src/modules/registry.ts    top-level navigation and icons
    messages/de.json, en.json  every UI string, German and English
```

Server code (schema, queries, actions, API routes) is deliberately left out.
Pages import data helpers that are not in the snapshot, so read them as layout
and markup rather than runnable code.

## Stack

- Next.js App Router, React, TypeScript strict
- Tailwind CSS v4 (`@theme inline` in `globals.css`), `tw-animate-css`, `@tailwindcss/typography`
- shadcn "base-nova" style on `@base-ui/react`, neutral base colour, CSS variables
- Icons: `lucide-react`; toasts: `sonner`; rich text: TipTap; drag and drop: dnd-kit; graphs: `@xyflow/react`; maps: MapLibre
- Fonts: system Segoe UI Variable stack (`--font-geist-sans` is a system stack, not Geist)
- Light and dark theme through the `.dark` class; radius token `--radius: 0.625rem`

## Modules (see `source/src/modules/registry.ts`)

Dashboard, Calendar, Accounting (invoices, bookings, customers, funding
projects, planning, report), Personnel, Time, Projects (portfolio, tasks,
Gantt), Wiki (pages, sources, PDF reader, presentations), Municipalities
(map, analysis, filter), Network (contacts, organizations, opportunities),
Settings.

## Constraints to keep when redesigning

- Every user-facing string lives in `messages/de.json` and `en.json`; add both
  when adding text. German strings are often longer, so leave room.
- The UI is used on desktop and phone (`mobile-bottom-sheet`, responsive rail).
- Both light and dark themes must work; use the token variables, not raw colours.
- Per-user accent colours are used in places (for example the Word editor).
- Keep files small: thin entry component, pieces in a sibling folder.

## Workflow

Refresh the snapshot from the current app code:

```bash
npm run design:sync
```

This overwrites `design/source/`. Bring design changes back by copying the
edited files to the same path under `src/` (drop the `design/source/` prefix),
then run `npm run check`. Do not edit `design/source/` and `src/` in parallel
without syncing first, or the sync will discard the design edits.
