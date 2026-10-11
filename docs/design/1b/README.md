# Handoff: Direction 1b – „Gruppierte Navigation“ (Desktop + Mobil)

Target repo: `elarbol94/startup` (Next.js App Router, Tailwind v4, shadcn base-nova on `@base-ui/react`, lucide-react, sonner, next-intl, next-themes).

## Overview
Direction 1b is a visual and structural refresh of the whole app:
- teal brand accent and grey-green surfaces (replaces the near-black primary),
- sidebar grouped into **Arbeit / Finanzen / Wissen** with an always-visible „Neu“ button and search,
- reworked **Übersicht** (tasks grouped by due date, KPI tiles, „Als Nächstes“, „Neuigkeiten“),
- consistent page headers and underline sub-tabs in every module,
- a proper phone layout (≤ 767 px): stacked table rows, calendar day list, sticky Gantt labels, edge-to-edge scrolling tabs.

## About the design files
Everything in this folder is a **design reference built in HTML/React-in-the-browser**, not production code. Recreate it inside the existing codebase with its own patterns: shadcn components in `src/components/ui`, Tailwind classes, `next-intl` messages, server queries/actions in `src/modules/*`. Do **not** copy the `.jsx` files or `1b.css` into the app.

Open `explorations/Direction 1b.html` (desktop, resize below 767 px for mobile) and `explorations/Direction 1b Mobil.html` (12 phone frames) in a browser to see it. URL params for the desktop file: `?screen=overview|calendar|projects|time|meetings|accounting|personnel|wiki|municipalities|network|settings&mode=Hell|Dunkel&data=Daten|Leer|Laden&drawer=1`.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii and states are final. Data in the mocks is sample data. Screens marked „Konzept – kein Screenshot“ in the mock (Besprechungen, Gemeinden, Netzwerk) are proposals; keep the app's existing content/features there and only apply the 1b styling.

## What already exists vs. what is new
Most behaviour already exists in the app. Treat this as a restyle plus a few additions.

| 1b feature | Status in repo | Where |
|---|---|---|
| Workspace tabs (open pages as tabs) | **Exists** (iframe panes, split view, Alt+Q) | `src/components/workspace/app-workspace.tsx`, `model.ts` – restyle only |
| Search / Strg+K palette | **Exists** | `src/modules/context/components/workspace-search` – restyle to match `CommandPalette.jsx`; add groups „Erstellen“, „Navigation“ if missing |
| „Neu“ menu (Aufgabe, Termin, Deadline, Kontakt) | **Exists** in sidebar | `app-sidebar.tsx` (`useTaskCreator`, Deadline/Contact providers) – move to a full-width primary button at top of sidebar |
| Mobile header + navigation sheet | **Exists** | `app-sidebar.tsx` (`app-mobile-header`, `Sheet`) – restyle; show grouped nav inside |
| Sidebar collapse to rail | Check `app-sidebar.tsx`; if missing → **new** | persist in `localStorage` key per user |
| Nav groups Arbeit / Finanzen / Wissen | **New** | add `group` to `ModuleNavItem` in `src/modules/registry.ts` |
| Nav item counters (e.g. Übersicht 16, Wiki 9) | **New** (optional) | server counts: open tasks for user, unread wiki inbox, contacts due, meetings in draft |
| Übersicht: tasks grouped by due date | **New** grouping | `src/modules/tasks/overview-*`; buckets Überfällig / Diese & nächste Woche / Später |
| Übersicht: „Meine / Alle“ toggle | Check `overview-filter-model.ts`; extend if needed | |
| Übersicht: KPI tiles, Als Nächstes, Neuigkeiten | Partly exists (`overview-metric`, `overview-news`) | restyle; add „Als Nächstes“ (next deadline + today's events) |
| Theme toggle in sidebar footer | **New placement** | `next-themes` `setTheme` |
| Calendar mobile day list | **New** responsive view | `src/modules/calendar/components` – on < 768 px default to Agenda-style list (existing `agenda` view can be reused) |
| Tables as stacked rows on mobile | **New** responsive styling | `src/components/ui/table.tsx` variant or per-table card list |
| Gantt sticky label column on mobile | **New** responsive styling | `src/modules/projects/components` Gantt |
| Empty states with actions | Partly exists | use one shared `EmptyState` (see `reference-components/EmptyState.jsx`) |

Keep every existing route, shortcut (`src/lib/app-shortcuts.ts`), focus-mode rule and workspace attribute (`data-app-shell`, `data-app-chrome`, `data-workspace-*`) working.

## Implementation plan (suggested PR order)
1. **Tokens** – add the `[data-theme="1b"]` and `.dark[data-theme="1b"]` blocks from `tokens/theme-1b.css` to `src/app/globals.css` (after `:root`/`.dark`). Set `data-theme="1b"` on `<html>` in `src/app/layout.tsx`. Optionally ship Cascadia Code from `assets/fonts` + `tokens/fonts.css`. Verify all shadcn components in light + dark.
2. **Registry groups** – `group: "work" | "finance" | "knowledge"` on each `moduleNav` entry; i18n labels `nav.groups.*` („Arbeit“, „Finanzen“, „Wissen“). Order: Arbeit = dashboard, calendar, projects, time, meetings · Finanzen = accounting, personnel · Wissen = wiki, municipalities, network. Settings stays in the footer.
3. **Sidebar** – rebuild the desktop sidebar per `GroupedSidebar.jsx`; reuse the existing Neu menu, search, user menu, mobile sheet.
4. **Workspace tab strip** – restyle per `WorkspaceTabs.jsx`. Hide the strip below 768 px (the mobile header shows the current title).
5. **PageHeader + sub-tabs** – update `src/components/page-header.tsx` and `ui/tabs.tsx` (underline variant) to the 1b spec.
6. **Übersicht** – grouping, KPI tiles, Als Nächstes, Neuigkeiten.
7. **Module screens** – Kalender, Projekte, Zeiterfassung, Buchhaltung, Personal, Wiki, Einstellungen; then the concept screens (styling only).
8. **Mobile pass** – tables, calendar, Gantt, header actions (rules below). Test at 390 × 844 and 360 × 780.

## Layout spec

### App shell (desktop ≥ 768 px)
- Row: sidebar (248 px, collapsed 64 px) | main column.
- Main column: workspace tab strip (44 px) above scrollable page.
- Page padding 24 px 28 px, vertical gap 20 px, content max-width none (cards fill).

### Sidebar
- Background `--sidebar`, right border `--sidebar-border`.
- Top: brand row (mark 28 px, company name 14/600, ellipsis).
- Actions row: primary „Neu“ button (flex 1, 36 px, opens menu: Neue Aufgabe `Strg+Shift+A`, Neuer Termin, Neue Deadline `Strg+Shift+D`, Neuer Kontakt) + 36 px outline search icon button (tooltip „Suchen Strg K“).
- Groups: label 10.5 px/600, letter-spacing .14em, uppercase, `--text-tertiary`, padding 16 px 12 px 6 px.
- Item: 36 px (44 px on touch), radius 8 px, icon 18 px, label 13.5 px/500. Hover `--accent`. Active: `--brand-soft` background, `--brand-ink` text/icon. Counter: right-aligned 11.5 px tabular, muted.
- Footer: Einstellungen item, divider, avatar 30 px + name 13/500 + email 12 muted (ellipsis) + theme toggle (ghost icon button, Sun/Moon).
- Collapsed: icons only, tooltips with label, Neu becomes icon-only.

### Workspace tab strip
- 44 px, bottom border `--border`, background `--sidebar`.
- Tab: 32 px, radius 8 px, max-width 220 px, icon 14 px + title 13 px ellipsis + close (×) on hover/active. Active tab: `--card` background, 1 px `--border`, foreground text.

### Page header
- Eyebrow 11 px/600/.14em uppercase `--brand-ink` (optional).
- Title 26 px/600, letter-spacing −.025em, line-height 1.2 (22 px on mobile).
- Description 13.5 px muted, margin-top 4 px.
- Actions right-aligned, gap 8 px, wrap. On mobile: actions go below the title, full width, primary button stretches.

### Sub-tabs (module tabs)
- Underline style, 40 px, 13.5 px/500, muted; active = foreground + 2 px `--brand` bar at bottom (inset 12 px). Group labels inside the strip (Einstellungen: „Persönlich“, „Administration“) in the eyebrow style.
- Horizontally scrollable, no scrollbar. Mobile: edge-to-edge (negative 16 px margins) with a fade mask on the right.

### Cards, lists, tables
- Card: `--card`, 1 px `--border`, radius 12 px, `--elev-card` shadow (light only).
- Card header 52 px: title 14.5 px/600 + muted count + right-aligned actions.
- List row: padding 11 px 18 px, 13.5 px, hover `--accent`.
- Table: header 36 px 11.5 px/500 muted; rows 42 px (48 px mobile), hairline `--line-soft`.
- KPI tile grid: label 12 px muted, value 22 px/600 tabular; overdue value in `--late`.
- Pills: 11.5 px/500, full radius; priority Hoch/Mittel, status Aktiv (brand-soft), Entwurf, Freigegeben.

### Übersicht
- Two columns: tasks card (flex) | 320 px side column.
- Task card header: „Meine Aufgaben“ + „N offen“, segmented „Meine | Alle“, Filter, Board.
- Buckets: „Überfällig · n“ (red, warning icon), „Diese & nächste Woche · n“, „Später · n“. Bucket label style = group label.
- Row grid: checkbox 18 | title (flex, ellipsis) 150 project | 140 people stack | 120 due | 64 priority. ≤ 760 px hide project + people; ≤ 420 px hide due, title wraps to 2 lines.
- Checking a task marks it done (strike-through, muted) – call the existing task completion action, optimistic update.
- Side column: KPI 2×2 (Offene Aufgaben, Überfällig, Deadlines · 7 Tage, Termine heute), „Als Nächstes“, „Neuigkeiten“ (avatar 24 + title + „<Name> hat dich erwähnt · 14:12“).

## Responsive rules (≤ 767 px)
- Hide desktop sidebar and workspace tab strip; show the 56 px mobile header (menu · current page title · search). Menu opens the grouped sidebar in the existing `Sheet` (width min(20rem, 88vw)), closes on navigation.
- Page padding 16 px 16 px 24 px, gap 16 px.
- Touch targets ≥ 40 px (buttons, segmented buttons), nav items 44 px.
- All two/three-column splits become one column; KPI grids 2 columns.
- **Tables** become stacked rows: no thead; each row = flex-wrap block, padding 12 px 16 px; first cell full width (14 px), other cells inline below (13 px, gap 6 px 12 px). Empty cells hidden.
- **Calendar**: hide the week grid; show a day list: per day 44 px date column (weekday label + day number 18/600) and events (radius 8 px, 3 px left border in calendar colour, title 13.5/500, time „09:00–10:00“ mono 11.5) plus „n Aufgaben fällig“; empty days „Keine Termine“ / „Wochenende“. Today highlighted with `--brand-soft`.
- **Calendar header** view switcher (Tag … Team) scrolls horizontally.
- **Projects Gantt**: label column 150 px, `position: sticky; left: 0`, card background, hide drag/more/open icons; timeline scrolls horizontally.
- Search fields full width.

## Interactions & states
- Hover: rows/items `--accent`; buttons per shadcn.
- Focus: 2 px `--ring` (= brand) outline, offset 2 px, for buttons, links, tabs, nav items.
- Transitions: 150 ms ease-out (sheet/drawer fade + slide, menus).
- Loading: skeleton layout (header bars, 4 KPI blocks, 5 list rows) – see `SkeletonPage` in `explorations/1b/Shell.jsx`; use `ui/skeleton.tsx` in each route's `loading.tsx`.
- Empty states (see `data=Leer` in the mock) for each module, with icon 18 px in 40 px tile, title 14.5/600, description, 1–2 actions. Copy is in the screen files.
- Zeiterfassung timer: start/stop button, live `H:MM:SS` in mono 34/600 (brand ink while running), „Läuft · <Projekt>“. Use existing `src/modules/time/timer-actions.ts`.
- Besprechungen: selecting a recording on the left shows its protocol on the right (selected row `--brand-soft`).

## Design tokens
Authoritative values: `tokens/theme-1b.css` (light and dark). Key values:
- Brand: light `oklch(0.52 0.09 185)`, ink `oklch(0.42 0.08 185)`; dark `oklch(0.74 0.11 182)`, ink `oklch(0.84 0.09 182)`, on-brand `#06201d`.
- Surfaces light: background `#f5f7f6`, card `#ffffff`, sidebar `#fbfcfb`, muted `#eef1f0`, border `#e2e7e5`.
- Surfaces dark: background `#0e0f0f`, card `#141616`, popover `#171919`.
- Text: secondary `#4b5552`, tertiary `#636e6a` (light). Late/overdue `#dc2626`.
- Money amounts stay neutral (`--money-positive: var(--foreground)`), teal never means „positive“.
- Radii: card 12 px, button/input 10 px, item/tab 8 px, pill full.
- Shadow: `0 1px 2px rgb(16 24 22 / .05)` on cards in light mode only.
- Type: existing Segoe UI Variable stack; mono Cascadia Code. Sizes 11 / 12 / 12.5 / 13.5 / 14.5 / 22 / 26 px.
- All text meets WCAG AA in both modes.

## Assets
- Icons: lucide (already used). Names used in the mock: LayoutDashboard, CalendarDays, SquareKanban, Timer, Video, Calculator, UserRoundCog, BookOpen, MapPinned, Handshake, Settings, Plus, Search, ClipboardPlus, CalendarPlus, CalendarClock, UserPlus, Menu, Sun, Moon.
- Font: `assets/fonts/` Cascadia Code (optional, mono only).
- No images.

## Files in this folder
(`.jsx.txt` files are plain JSX source, renamed so they are not treated as components; read them as JSX.)
- `explorations/Direction 1b.html` – full interactive mock, all 11 screens, light/dark, empty/loading.
- `explorations/Direction 1b Mobil.html` – 12 phone frames.
- `explorations/1b/Shell.jsx` – shell, sidebar, Neu menu, tabs, mobile header/drawer, skeleton.
- `explorations/1b/ScreensWork.jsx` – Übersicht, Kalender, Projekte, Zeiterfassung, Besprechungen.
- `explorations/1b/ScreensMore.jsx` – Buchhaltung, Personal, Wiki, Gemeinden, Netzwerk, Einstellungen.
- `explorations/1b/1b.css` – all layout + responsive rules of the mock.
- `tokens/theme-1b.css` – tokens to port into `globals.css`.
- `reference-components/*.jsx` – GroupedSidebar, WorkspaceTabs, CommandPalette, KpiStrip, SegmentedControl, FilterChip, PersonStack, EmptyState (structure + class names; styles in `components/extended.css`).
- `styles.css`, `tokens/`, `components/*.css`, `_ds_bundle.js`, `assets/` – only needed so the HTML mocks render.

## Prompt for Claude Code
> Read `docs/design/1b/README.md`. Implement Direction 1b in this repo following the PR order in „Implementation plan“. Use existing shadcn components, Tailwind and next-intl; do not copy the mock's JSX/CSS. Keep all existing routes, shortcuts, focus mode and workspace behaviour. After each step run lint, typecheck and tests, and check the UI at 1440 px and 390 px in light and dark mode against `explorations/Direction 1b.html`.
