// The app's keyboard shortcut map, in one place so tooltips, handlers and the clash test
// (lib/shortcuts.test.ts) agree. Notation is documented in lib/shortcuts.ts.
//
// Rules for new bindings:
// - Letters are German mnemonics, taken from the German label of the action ("H" = Heute,
//   "K" = Kalender). When two actions share a first letter, the more frequent one keeps it and
//   the other takes the next distinctive sound of its German name ("G L" = Lohnverrechnung for
//   Personal, because "G P" is Projekte). Universal keys stay as they are on German systems
//   too (Strg+K search, Strg+Z undo, Strg+F find, Strg+S save, Strg+P print, arrows, Esc).
// - The same action uses the same key in every section (see PAGE_SHORTCUTS).
// - Global shortcuts with a modifier use Mod (Ctrl/⌘) + Shift or a key the browser does not
//   own; never Ctrl+T/W/N/L/R/P/S/F/D, Alt+digit or Ctrl+digit (tab switching).
// - Navigation uses "G <key>" sequences ("Gehe zu") and page actions use single keys; both are
//   ignored while typing and inside dialogs/menus (see isShortcutBlockedTarget).
import type { ModuleNavItem } from "@/modules/registry";

/** Shortcuts with their own long-standing listeners, listed here so tooltips can show them. */
export const GLOBAL_SHORTCUTS = {
  /** Suchen: Strg+K is the common command-palette key, also on German systems. */
  search: "Mod+K",
  /** Neue Aufgabe */
  newTask: "Mod+Shift+A",
  /** Neue Deadline */
  newDeadline: "Mod+Shift+D",
  /** Fehler melden */
  reportBug: "Mod+Shift+M",
  /** Positional rather than a mnemonic: Q sits next to Tab, so Alt+Q works like Alt+Tab. */
  switchTab: "Alt+Q",
  /** Fokusmodus */
  focusMode: "Mod+Shift+F",
} as const;

/** "G" = "Gehe zu", followed by the first letter of the German section name. */
export const NAVIGATION_SHORTCUTS: Record<ModuleNavItem["key"] | "settings", string> = {
  dashboard: "G Ü", // Übersicht
  calendar: "G K", // Kalender
  accounting: "G B", // Buchhaltung
  personnel: "G L", // Personal → Lohnverrechnung ("G P" is Projekte)
  time: "G Z", // Zeiterfassung
  projects: "G P", // Projekte
  wiki: "G W", // Wiki
  municipalities: "G G", // Gemeinden
  network: "G N", // Netzwerk
  meetings: "G S", // Besprechungen → Sitzungen ("G B" is Buchhaltung)
  settings: "G E", // Einstellungen
};

/**
 * The shared vocabulary for page shortcuts: wherever a section offers one of these actions,
 * it uses this key, so "N" always creates and "/" always searches.
 */
export const PAGE_SHORTCUTS = {
  /** Neu: the section's primary "create" action. */
  create: "N",
  /** Suchen: focus the section's search or filter field. */
  search: "/",
  /** Heute */
  today: "H",
  /** Tastenkürzel: show the page's shortcut help. */
  help: "?",
} as const;

export const PROJECTS_PAGE_SHORTCUTS = {
  timeline: "1",
  projectOverview: "2",
  week: "W", // Woche
  month: "M", // Monat
  quarter: "Q", // Quartal
  today: PAGE_SHORTCUTS.today,
  search: PAGE_SHORTCUTS.search,
  newProject: PAGE_SHORTCUTS.create,
  fitView: "E", // Einpassen
  criticalPath: "K", // Kritischer Pfad
  dependencyLines: "L", // Linien anzeigen
  /** Adds a subtask under the focused task (focus mode) or the selected task row. */
  newSubtask: "Shift+N",
} as const;

/**
 * Keys handled by the focused Gantt row or the schedule undo listener rather than
 * useKeyboardShortcut; listed here only so the help popover can show them.
 */
export const TIMELINE_KEY_HINTS = {
  focusTask: "F", // Fokus
  outdentTask: "Alt+←",
  indentTask: "Alt+→",
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",
} as const;

/** The calendar page. Shift picks the variant of a view: Shift+W Arbeitswoche, Shift+T Team. */
export const CALENDAR_PAGE_SHORTCUTS = {
  today: PAGE_SHORTCUTS.today,
  previous: "ArrowLeft",
  next: "ArrowRight",
  day: "T", // Tag
  workweek: "Shift+W", // Arbeitswoche
  week: "W", // Woche
  month: "M", // Monat
  agenda: "A", // Agenda
  team: "Shift+T", // Team
  newEvent: PAGE_SHORTCUTS.create,
  search: PAGE_SHORTCUTS.search,
  deselect: "Escape",
  undo: "Mod+Z",
  help: PAGE_SHORTCUTS.help,
} as const;

/** The single project page (/projects/<id>). */
export const PROJECT_PAGE_SHORTCUTS = {
  viewTasks: "1",
  viewKnowledge: "2",
  viewActivity: "3",
  newTask: PAGE_SHORTCUTS.create,
} as const;

/**
 * Page shortcuts of the network, accounting (with documents and funding), personnel, time,
 * meetings, municipalities and settings pages. They only reuse PAGE_SHORTCUTS: "N" triggers the
 * page's primary "Neu…" button (per tab where a section has several), "/" focuses its search field.
 */
export const SECTION_PAGE_SHORTCUTS = {
  /** Network pages: quick capture (header button) and the contact search. */
  network: { capture: PAGE_SHORTCUTS.create, search: PAGE_SHORTCUTS.search },
  /** Overview and Buchungen: new booking; Rechnungen/Dokumente: new invoice and invoice search; Kunden: new customer. */
  accounting: { newEntry: PAGE_SHORTCUTS.create, newInvoice: PAGE_SHORTCUTS.create, newCustomer: PAGE_SHORTCUTS.create, invoiceSearch: PAGE_SHORTCUTS.search },
  funding: { newProject: PAGE_SHORTCUTS.create },
  /** Personal, from every tab: switch to Personen and open the "add person" form. */
  personnel: { newPerson: PAGE_SHORTCUTS.create },
  /** Zeiterfassung: new entry and back to this week. */
  time: { newEntry: PAGE_SHORTCUTS.create, today: PAGE_SHORTCUTS.today },
  meetings: { newMeeting: PAGE_SHORTCUTS.create, search: PAGE_SHORTCUTS.search },
  municipalities: { search: PAGE_SHORTCUTS.search },
  /** Settings tabs Benutzer, Kategorien, Standorte: invite / add. */
  settings: { create: PAGE_SHORTCUTS.create },
} as const;

/** Handled by the quick-capture form itself: save from any field. */
export const QUICK_CAPTURE_KEY_HINTS = {
  save: "Mod+Enter",
} as const;

/**
 * Handled by the municipality analysis editor (use-analysis-shortcuts.ts). Quick add opens with
 * Shift pressed twice (like the wiki search), which the shortcut notation cannot express.
 */
export const MUNICIPALITY_ANALYSIS_KEY_HINTS = {
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",
} as const;
