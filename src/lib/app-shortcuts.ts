// The app's keyboard shortcut map, in one place so tooltips, handlers and the clash test
// (lib/shortcuts.test.ts) agree. Notation is documented in lib/shortcuts.ts.
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
  network: "G N",
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
  fitView: "Z",
  criticalPath: "C",
  dependencyLines: "L",
  /** Adds a subtask under the focused task (focus mode) or the selected task row. */
  newSubtask: "Shift+N",
} as const;

/**
 * Keys handled by the focused Gantt row or the schedule undo listener rather than
 * useKeyboardShortcut; listed here only so the help popover can show them.
 */
export const TIMELINE_KEY_HINTS = {
  focusTask: "F",
  outdentTask: "Alt+←",
  indentTask: "Alt+→",
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",
} as const;

/** The single project page (/projects/<id>). */
export const PROJECT_PAGE_SHORTCUTS = {
  viewTasks: "1",
  viewKnowledge: "2",
  viewActivity: "3",
  newTask: "N",
} as const;
