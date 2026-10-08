"use client";

// Keyboard shortcuts of the calendar page, registered through the app's shared shortcut
// listener (components/use-keyboard-shortcut.ts), which already ignores key presses while
// typing, inside dialogs/menus and with unexpected modifiers. Single keys never clash with the
// global "G <key>" navigation sequences because a pending sequence is resolved first.
// The keys live in lib/app-shortcuts.ts (CALENDAR_PAGE_SHORTCUTS). Used by calendar-client.tsx;
// the help list is calendar-shortcuts-help.tsx.
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { CALENDAR_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import type { CalendarView } from "../../types";

export const CALENDAR_VIEW_SHORTCUTS: Record<CalendarView, string> = {
  day: CALENDAR_PAGE_SHORTCUTS.day,
  workweek: CALENDAR_PAGE_SHORTCUTS.workweek,
  week: CALENDAR_PAGE_SHORTCUTS.week,
  month: CALENDAR_PAGE_SHORTCUTS.month,
  agenda: CALENDAR_PAGE_SHORTCUTS.agenda,
  team: CALENDAR_PAGE_SHORTCUTS.team,
};

/** Focuses the calendar search field (sidebar on wide screens), or reports that none is visible. */
export function focusCalendarSearch() {
  const fields = Array.from(document.querySelectorAll<HTMLElement>("[data-calendar-search]"));
  const visible = fields.find((field) => field.getClientRects().length > 0);
  if (!visible) return false;
  visible.focus();
  if (visible instanceof HTMLInputElement) visible.select();
  return true;
}

export function useCalendarShortcuts({
  enabled,
  goToday,
  movePeriod,
  setView,
  newEvent,
  focusSearch,
  deselect,
  canDeselect,
  undo,
  canUndo,
  toggleHelp,
}: {
  /** False while a dialog of the page is open. */
  enabled: boolean;
  goToday: () => void;
  movePeriod: (direction: number) => void;
  setView: (view: CalendarView) => void;
  newEvent: () => void;
  focusSearch: () => void;
  deselect: () => void;
  /** Escape is only claimed while something is selected, so other Escape handlers keep working. */
  canDeselect: boolean;
  undo: () => void;
  canUndo: boolean;
  toggleHelp: () => void;
}) {
  const keys = CALENDAR_PAGE_SHORTCUTS;
  useKeyboardShortcuts(
    [
      { shortcut: keys.today, handler: goToday },
      { shortcut: keys.previous, handler: () => movePeriod(-1) },
      { shortcut: keys.next, handler: () => movePeriod(1) },
      ...(Object.entries(CALENDAR_VIEW_SHORTCUTS) as [CalendarView, string][]).map(([view, shortcut]) => ({
        shortcut,
        handler: () => setView(view),
      })),
      { shortcut: keys.newEvent, handler: newEvent },
      { shortcut: keys.search, handler: focusSearch },
      { shortcut: keys.help, handler: toggleHelp },
    ],
    { enabled },
  );
  // Separate so Ctrl/⌘+Z keeps its browser meaning when there is nothing to undo.
  useKeyboardShortcuts([{ shortcut: keys.undo, handler: undo }], { enabled: enabled && canUndo });
  useKeyboardShortcuts([{ shortcut: keys.deselect, handler: deselect }], { enabled: enabled && canDeselect });
}
