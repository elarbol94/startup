# Plan: Platform-wide Focus Mode ("Fokusmodus") — revision 2

Repository: /srv/management-software/.claude/worktrees/management-platform-focus-mode-876bcb
(Next.js 16 App Router, SQLite/Drizzle, next-intl de/en, see AGENTS.md)

## Goal

One platform-wide way to shut out the management chrome and work on one
thing, optionally as a time-boxed focus session tied to a task and the time
tracker. Existing pockets of focus that must keep working:

- Reader focus: `src/components/focus-mode.tsx` + `src/lib/focus-mode.ts`,
  per-scope (`pdf`, `note`) localStorage preference on wiki reader/note pages;
  `AppSidebar` returns null; requests browser fullscreen; Ctrl+Shift+F in the
  PDF reader (`src/modules/wiki/lib/pdf-shortcuts.ts`).
- Gantt focused planning: URL-driven, `data-project-focus-root` marker +
  `:has()` CSS in `src/app/(app)/layout.tsx` hides `[data-app-chrome]` and
  `[data-workspace-toolbar]`; exited via its own focus rail (URL change).
- Calendar `kind: "focus"` events; time tracking with one running timer per
  user (`src/modules/time/timer-actions.ts`).

## Scope of this plan
- Phase 1: Zen chrome focus (client only, no DB). Ships alone.
- Phase 2: focus sessions (server state, timer + optional calendar block).
- Explicitly deferred (separate plan later): muting toasts/reminders, presence
  badges, pause. No UI option for them is shown until they work.

---

## Phase 1 — Zen chrome focus

### UX
- Toggle: user menu item, Mod+K command, shortcut `Mod+Shift+F`, and a button
  in the page header area.
- On: sidebar rail, mobile header and workspace tab strip are hidden; content
  takes full width. A small floating focus pill (bottom-center) offers: exit,
  open search (Mod+K), and (Phase 2) session info. It fades to low opacity
  after inactivity on pointer devices but stays fully visible on touch
  (`@media (hover: none)`), and is always reachable by keyboard.
- Global focus does not request browser fullscreen (reader scopes keep their
  current fullscreen behaviour unchanged).
- Persisted per user per device; survives reload without a flash.

### State model (explicit, in `src/lib/focus-mode.ts`, pure + unit-tested)
Three independent sources:
1. `global` — new per-user per-device preference.
2. `reader[scope]` — existing `pdf`/`note` preferences (keys namespaced per user, see provider section).
3. `planning` — Gantt URL focus (read-only from the DOM marker / route).

Derived values:
- `chromeHidden = global || reader[currentScope] || planning`.
- Operations:
  - `toggleGlobal()` — flips only `global`.
  - `toggleReader()` — existing reader behaviour, only on reader pages.
  - `exitFocus()` — clears `global` AND the current page's reader preference
    (and leaves fullscreen); if `planning` is active it navigates to the
    non-focus URL of the Gantt view (reuse the focus rail's exit handler via a
    small registered callback in context). After `exitFocus()` chrome is
    guaranteed visible.
- Shortcut semantics for `Mod+Shift+F`: if any focus is active → `exitFocus()`;
  else on reader pages → enable reader focus (existing behaviour), elsewhere →
  enable global. The PDF reader's existing listener is changed to call the
  shared handler so exactly one handler acts (the global listener skips events
  with `defaultPrevented`; the reader handler calls `preventDefault`).
  Add `focusMode: "Mod+Shift+F"` to `GLOBAL_SHORTCUTS` and run the clash test.
- `Escape` is deliberately NOT an exit path (dialogs, menus, editors, the PDF
  reader and fullscreen all own Escape; a coordinated path is not worth the
  risk). Exit paths are: pill button, `Mod+Shift+F`, user menu, Mod+K command.

### Provider hierarchy (decided)
- `FocusModeProvider` moves from root `src/app/layout.tsx` into
  `src/app/(app)/layout.tsx` directly inside `UserIdentityProvider` and takes
  `userId` as a prop (only the authenticated app uses focus; `(auth)` and
  `print/` never did — verify no consumer outside `(app)`).
- Storage key: `management-platform:focus-mode:global:<userId>`. All
  localStorage access wrapped in try/catch with an in-memory fallback store
  (useSyncExternalStore over a tiny module-level store that mirrors storage
  when available). Cross-tab sync via the existing `storage` event.
- Reader preferences are namespaced too:
  `management-platform:focus-mode:<scope>:<userId>`. Legacy migration: if the
  user-scoped key is missing and the legacy unscoped key exists, copy its value
  once into the current user's key and delete the legacy key (worst case
  another user on the same device starts with reader focus off — acceptable,
  it is a UI preference).
- Account switch: all keys are user-scoped, so another user never inherits
  focus. The provider sets `data-focus-global` from the current user's value
  on every change (removing the attribute when false) and removes it on
  unmount, so a stale attribute from the bootstrap or a previous user cannot
  persist.

### No-flash rendering
- A tiny inline script rendered by the `(app)` layout before the shell reads
  the user-scoped key and sets `document.documentElement.dataset.focusGlobal =
  "true"`. The userId is embedded with `JSON.stringify` (cuid, but serialize
  safely anyway); the script contains no other dynamic data. The script must
  satisfy any CSP in use (check `next.config` / headers; reuse nonce if one
  exists).
- CSS in the `(app)` layout extends the existing rules:
  `html[data-focus-global="true"] [data-app-shell] > [data-app-chrome]`,
  `[data-workspace-toolbar]`, `[data-workspace-content]` height — mirroring the
  planning rules. The rules are emitted in the same server-rendered `<style>`
  block that already exists in the `(app)` layout, which precedes the shell in
  the HTML, so both the attribute and the rules are in effect before the shell
  markup is parsed. React keeps the attribute in sync after hydration.

### Sidebar and navigation guarantee
- `AppSidebar` currently `return null` when focused, which also unmounts
  `WorkspaceSearch` (Mod+K) and the `G x` navigation shortcuts. Change:
  extract `WorkspaceSearch` + navigation shortcut registration into a small
  `AppCommandLayer` component rendered by `AppWorkspace` outside
  `[data-app-chrome]`, so they are always mounted. `AppSidebar` then hides via
  CSS for global focus and keeps its `isReaderFocused` early return only for
  the reader scopes (or also moves to CSS — preferred, single mechanism).
- Mobile: the mobile header lives in `AppSidebar` inside `[data-app-chrome]`,
  so it is hidden too; the pill provides search + exit.

### Workspace iframes
- Embedded panes (`data-workspace-embedded`) never render chrome, never render
  the pill and never own focus state: `FocusModeProvider` short-circuits when
  `isWorkspaceFrame()` is true (read-only, `chromeHidden=false`, no listeners).
- `Mod+Shift+F` pressed inside an iframe is forwarded to the parent via the
  existing workspace postMessage pattern (`app-workspace-*` messages, same
  origin + `event.source` checks as today), new message type
  `app-workspace-focus-toggle`; the parent runs the shared handler.
- In global focus with split view, both panes stay; the tab strip is hidden.
  The pill gets a "Tabs anzeigen" action that temporarily reveals the toolbar.

### Accessibility
- Pill is a `role="toolbar"` with an accessible name; exit button labelled;
  faded state is opacity only, never `visibility:hidden`/`aria-hidden`.
- Respect `prefers-reduced-motion` for fade animations.

### Phase 1 files
- `src/lib/focus-mode.ts` (+ `focus-mode.test.ts` extended)
- `src/components/focus-mode.tsx` (state, operations, provider move)
- new `src/components/focus/focus-pill.tsx`, `focus-bootstrap-script.tsx`
- `src/app/layout.tsx` (remove provider), `src/app/(app)/layout.tsx`
- `src/components/app-sidebar.tsx`, new `src/components/app-command-layer.tsx`,
  `src/components/workspace/app-workspace.tsx`, `src/components/user-menu.tsx`
- `src/lib/app-shortcuts.ts`, PDF reader shortcut wiring,
  `src/modules/wiki/components/{pdf-reader,research-sidebar}.tsx`,
  `office-document-shell.tsx` (consume new `chromeHidden`/reader API)
- Gantt focus rail: register its exit callback
- `messages/de.json`, `messages/en.json` (new `focus` namespace; reader
  toggles reuse shared keys)
- `e2e/focus-mode.spec.ts`

### Phase 1 tests
- No-flash test (e2e): with focus enabled, block all `/_next/static/chunks/**`
  JS via `page.route` (hold the requests, i.e. hydration cannot run), navigate,
  wait until `[data-app-shell]` is attached, then assert
  `html[data-focus-global="true"]` is present and `[data-app-chrome]` has
  computed `display: none` and the rail is not visible. Release the routes and
  assert the state is unchanged after hydration. Same test with focus off
  asserts the sidebar is visible pre-hydration (proves the test can fail).
- Unit: state derivation for every combination of global/reader/planning;
  `exitFocus` always yields `chromeHidden=false`; storage-throwing fallback;
  shortcut decision function.
- E2E: toggle via shortcut, user menu and Mod+K; sidebar + toolbar hidden;
  reload keeps focus without the sidebar ever being visible (assert on first
  paint, see no-flash test below); Mod+K works while focused; exit via pill,
  shortcut, user menu; wiki PDF reader focus
  still works and global+reader exit together; Gantt focus URL + global, exit
  restores chrome; Escape inside a dialog while focused closes only the dialog
  (regression guard that Escape is not an exit path); iframe pane shortcut
  toggles parent; mobile viewport: pill
  visible, header hidden; second user in same browser does not inherit focus.

---

## Phase 2 — Focus sessions

### UX
- "Fokus-Session starten" dialog (pill, task details, dashboard, time page):
  task (optional), duration 25/50/90/custom (5–240 min), "Zeit erfassen"
  (only available when a task is chosen; default on; booked on the task and
  its project — project-only tracking is out of scope for this phase), "Im
  Kalender blockieren" (default off).
- Starting a session turns Zen focus on for the starting device only.
- Other devices that observe an active session (via sync) do not change their
  Zen state; they show a compact session chip (in the sidebar footer / mobile
  header) with remaining time and a "Fokus aktivieren" button that turns on
  Zen there (recorded locally like a manual start, see restoration).
- Pill shows task title (link), remaining time (visual only, not announced
  continuously; an `aria-live="polite"` region announces only at 5 min left and
  at the end), "+10 min", "Beenden".
- When remaining time reaches 0, the session stays active and the pill switches
  to "Zeit um — beenden?" with the summary card: elapsed, "Timer stoppen" /
  "Timer weiterlaufen lassen" (only if the session owns the timer), "Aufgabe
  erledigt", "Noch eine Session".
- No pause in this phase.

### Data model (additive migration)
Table `focus_sessions` in new module `src/modules/focus/schema.ts`:
- `id`, `userId` → user (cascade on user delete consistent with other
  user-owned tables), `taskId` → tasks (set null), `startedAt`,
  `plannedEndAt` (single source of truth for the deadline; extend moves it),
  `endedAt` (null while active), `endReason` (`completed` | `ended_early` |
  `superseded`), `timeEntryId` → time_entries (set null), `ownsTimer` (bool:
  the session started that timer), `calendarEventId` → calendar events
  (set null), `calendarEventUpdatedAt` (timestamp_ms, the event's `updatedAt`
  after our last write; null when no block), `version` (int, incremented on
  every update), `createdAt`, `updatedAt`. No Zen/restore data on the server —
  that is device-local (see synchronization).
- Partial unique index one active session per user (`ended_at IS NULL`).
- Re-export from `src/db/schema.ts`, `npm run db:generate`, review SQL (must be
  CREATE TABLE/INDEX only), `npm run db:migrate`, then verify upgrade on a copy
  of an existing dev database and that `src/instrumentation.ts` startup
  migration applies it cleanly.

### State machine (server-enforced)
States: `active` → `ended`. Transitions:
- `start`: no active session for user (else return `alreadyActive` with the
  active session so the UI offers to show it — no implicit ending).
- `extend(sessionId, expectedVersion, minutes)`: only `active`; adds to
  `plannedEndAt` (cap total 8 h); if a calendar block exists, try to extend
  its end (see calendar rules).
- `end(sessionId, expectedVersion, { stopTimer })`: only `active`; sets
  `endedAt`, `endReason`. Idempotent: ending an already-ended session returns
  `ok` with the stored result, no side effects.
- All updates are conditional `WHERE id = ? AND user_id = ? AND ended_at IS
  NULL AND version = ?`; zero rows → return `stale` + current session so the
  client refreshes. All actions: Zod, `requireUserOrThrow`, only own sessions
  (cross-user IDs behave like not found).

### Timer rules
- Extract non-"use server" helpers from `timer-actions.ts` (e.g.
  `src/modules/time/timer-core.ts`): `startTimerTx(tx, userId, assignment)`,
  `stopTimerTx(tx, userId, { expectedEntryId, breakMinutes })` keeping the
  existing validation and sub-minute discard behaviour; existing server actions
  call them (no behaviour change, covered by existing tests).
- Session start with "Zeit erfassen":
  - no running timer → `startTimerTx`, `ownsTimer=true`.
  - running timer on the same task → link it, `ownsTimer=false`.
  - running timer on another assignment → return `timerConflict` with the
    running entry ID. UI asks: "Laufenden Timer (Projekt X) beenden und neuen
    für Aufgabe Y starten?" On confirm the client resends start with
    `replaceRunningEntryId`; the server stops exactly that entry (fails with
    `stale` if the running entry ID changed) and starts a new one for the task.
    We never call `updateRunningTimer` here, so earlier time is never
    reattributed. Alternative choice "ohne Zeiterfassung starten".
- Matching ("same assignment") always compares the full assignment
  `(projectId, taskId, kind)`; a timer with the same task but a different kind
  or project counts as a different assignment → conflict flow.
- Ownership is defined as: `ownsTimer` AND the running entry id equals
  `timeEntryId` AND its current full assignment equals the session's
  (task, task's project, `work`). An entry reassigned away and back counts as
  owned again — this is the explicit definition, no assignment revision is
  tracked. Anything else → not owned, leave running and tell the user.
- Session end with `stopTimer=true`: stops only an owned timer, in the same
  transaction as the session update.
- `ownsTimer=false` sessions never stop the timer.

### Calendar block rules
- Only offered when the user has a writable personal/default calendar; the
  block uses a new helper extracted from the existing focus-block action that
  supports an optional task (title falls back to "Fokuszeit"/"Focus time"),
  keeps the existing authorization, validation and conflict checks
  (`allowConflicts: false`), executed inside the same transaction.
- Conflict on start → session still starts without a block; the response
  carries `calendarSkipped: "conflict"` and the UI shows it.
- Every write to the event (extend and early-end shorten) first checks: event
  still exists and `id = calendarEventId`, user can still edit it, and its
  `updatedAt` equals `calendarEventUpdatedAt`; after a successful write the new
  `updatedAt` is stored back. Any mismatch → leave the event untouched.
- Extend → move the event end; stale/conflict/missing permission → keep the
  old end, report `calendarNotExtended`.
- Early end → shorten event end to now only if: event still exists, still
  linked, editable and unchanged (checks above) and now > event start;
  otherwise leave the event untouched (we never delete it).
- Revalidate `/`, `/time`, `/calendar` only after successful mutations.

### Synchronization across tabs/devices
- Layout loads `getActiveFocusSession(userId)` and passes it with `serverNow`
  to `FocusSessionProvider` (countdown computed like `TimerCard`, no hydration
  mismatch).
- Client refresh: a small authenticated server action
  `getMyActiveFocusSession()` polled every 60 s while the document is visible,
  plus on `visibilitychange`/`focus`, plus immediately after own mutations.
  Same-browser tabs get instant updates via `BroadcastChannel`
  (`focus-session:<userId>`) after each mutation.
- Zen restoration is device-local. Each device keeps a monotonic integer
  `zenRevision` (localStorage, per user) incremented on every manual Zen
  change. When a session turns Zen on here (start on this device or "Fokus
  aktivieren" on the chip), the device stores
  `focus-restore:<userId>:<sessionId> = { priorZen, revisionAfterEnable }`.
  When that session ends (locally or observed via sync), the device restores
  `priorZen` only if its current `zenRevision === revisionAfterEnable` (no
  manual change since), then deletes the record. Devices without a record do
  nothing. No client/server clock comparison is involved. Stale records for
  sessions that are no longer active are deleted on load.

### Phase 2 files
- new `src/modules/focus/{schema,queries,session-actions,session-core}.ts`
  (+ `session-core.test.ts`), `src/db/schema.ts`, `drizzle/` migration
- `src/modules/time/timer-core.ts` (extracted), `timer-actions.ts`
- `src/modules/calendar/` focus-block helper extraction
- new `src/components/focus/{focus-session-provider,focus-session-dialog,
  focus-session-summary,use-focus-countdown}.tsx`
- entry points: task details (`src/modules/tasks/components/item-details.tsx`),
  dashboard, time page
- messages de/en, `e2e/focus-session.spec.ts`

### Phase 2 tests
- Unit (restore logic, pure): restore when unchanged; no restore after manual
  change; no record → no-op; stale record cleanup.
- Unit (session-core with in-memory SQLite like existing action tests): start
  when active → `alreadyActive`; concurrent starts → exactly one row; timer
  conflict + stale `replaceRunningEntryId`; end twice → idempotent; stale
  version → `stale`; end only stops the owned, unchanged timer; reassigned
  timer survives end; same task but different kind/project → conflict; extend
  cap; calendar extend/shorten skipped when event edited elsewhere; task/time entry/calendar event deletion sets
  null and session still ends; cross-user ids rejected; calendar skip on
  conflict, shorten rules.
- E2E: start with task → timer running on task; end + stop → timer stopped,
  entry on task; start while another timer runs → confirm dialog, old entry
  keeps its task; reload during session → pill + countdown restored; second
  tab sees end via BroadcastChannel; calendar block appears and is shortened
  on early end.

## Validation and handoff
- `npm run check`, `npm run build`, `npm run e2e` (one suite at a time, own
  port, per local Playwright setup), migration applied on a copy of a real dev
  DB. Report results and readiness to commit/push/deploy.

## Open questions for the user
- Is Phase 1 alone the first release, with Phase 2 following?
- Calendar block default off — OK?
