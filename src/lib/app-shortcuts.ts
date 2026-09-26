// The app's keyboard shortcut map, in one place so tooltips, handlers and the clash test
// (app-shortcuts.test.ts) agree. Notation is documented in lib/shortcuts.ts.
//
// Rules for new bindings:
// - Global shortcuts with a modifier use Mod (Ctrl/⌘) + Shift or a key the browser does not
//   own; never Ctrl+T/W/N/L/R/P/S/F/D, Alt+digit or Ctrl+digit (tab switching).
// - Navigation uses "G <key>" sequences and page actions use single keys; both are ignored
//   while typing and inside dialogs/menus (see isShortcutBlockedTarget).
import type { ModuleNavItem } from "@/modules/registry";

/** Shortcuts with their own long-standing listeners, listed here so tooltips can show them. */
export const GLOBAL_SHORTCUTS = {
  search: "Mod+K",
  newTask: "Mod+Shift+A",
  newDeadline: "Mod+Shift+D",
  reportBug: "Mod+Y",
  switchTab: "Alt+Q",
} as const;

export const NAVIGATION_SHORTCUTS: Record<ModuleNavItem["key"] | "settings", string> = {
  dashboard: "G H",
  calendar: "G C",
  accounting: "G A",
  personnel: "G E",
  time: "G T",
  projects: "G P",
  wiki: "G W",
  municipalities: "G M",
  settings: "G S",
};

export const PROJECTS_PAGE_SHORTCUTS = {
  timeline: "1",
  projectOverview: "2",
  week: "W",
  month: "M",
  quarter: "Q",
  today: "T",
  search: "/",
  newProject: "N",
} as const;
