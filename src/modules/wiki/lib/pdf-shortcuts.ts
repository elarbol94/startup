export const PDF_SHORTCUT_ACTIONS = [
  "previousPage", "nextPage", "zoomOut", "zoomIn", "fitWidth", "fitPage", "actualSize",
  "continuousView", "singlePageView", "doublePageView", "search", "previousMatch", "nextMatch",
  "caseSensitive", "wholeWord", "navigatorPages", "navigatorSearch", "outline", "captureRegion",
  "bookmarkPage", "comments", "previousAnnotation", "nextAnnotation", "backToComments", "copyCitation",
  "editAnnotation", "deleteAnnotation", "createTask", "createDeadline", "rotate", "toggleNavigator", "openOriginal", "download", "printPdf",
  "focusMode", "shortcuts",
] as const;

export type PdfShortcutAction = typeof PDF_SHORTCUT_ACTIONS[number];
export type PdfShortcutBindings = Record<PdfShortcutAction, string>;

export type PdfShortcutGroup = "navigation" | "views" | "search" | "navigator" | "annotations" | "document";

/** Labels are message keys, resolved by the component: this lib cannot reach next-intl. */
export const PDF_SHORTCUT_GROUPS: Array<{ label: PdfShortcutGroup; actions: PdfShortcutAction[] }> = [
  { label: "navigation", actions: ["previousPage", "nextPage", "zoomOut", "zoomIn", "fitWidth", "fitPage", "actualSize"] },
  { label: "views", actions: ["continuousView", "singlePageView", "doublePageView"] },
  { label: "search", actions: ["search", "previousMatch", "nextMatch", "caseSensitive", "wholeWord"] },
  { label: "navigator", actions: ["navigatorPages", "navigatorSearch", "outline", "toggleNavigator"] },
  { label: "annotations", actions: ["captureRegion", "bookmarkPage", "comments", "previousAnnotation", "nextAnnotation", "backToComments", "copyCitation", "editAnnotation", "deleteAnnotation", "createTask", "createDeadline"] },
  { label: "document", actions: ["rotate", "openOriginal", "download", "printPdf", "focusMode", "shortcuts"] },
];

// Letters are German mnemonics from the German action labels (see src/lib/app-shortcuts.ts):
// - Strg+Alt+B "An Breite anpassen", Strg+Alt+G "Ganze Seite".
// - Strg+Umschalt+G "Groß-/Kleinschreibung" (Alt+G is Ganze Seite), Strg+Alt+W "Nur ganze Wörter".
// - Navigator: Strg+Alt+S "Seiten", Strg+Alt+F "Finden" (the Strg+F family; S is Seiten),
//   Strg+Alt+L "Gliederung" (G is Ganze Seite), Strg+Alt+N "Navigator ein-/ausblenden".
// - Strg+Umschalt+B "Bereich markieren" (M is Mac's minimise and the global bug report),
//   Strg+Umschalt+S "Seite merken", Strg+Alt+K "Kommentare", Strg+E "Annotation editieren",
//   Strg+Alt+R "dRehen" (Cmd+Alt+D toggles the macOS Dock), Strg+O "Original öffnen".
// - Strg+Umschalt+C copies with the citation: the universal Strg+C plus Shift.
// Universal keys stay: Strg+F, Strg+S, Strg+P, Strg+0/+/-, Strg+/, Strg+←/→, Tab, Strg+1/2/3
// (views, by position), and the app-wide Strg+Umschalt+A/D/F (Aufgabe, Deadline, Fokusmodus).
// Avoided: keys the browser keeps (Strg+W/N/T, Strg+Umschalt+W/N/T), Strg+R (reload), Cmd+M/H/Q
// on macOS, Strg+K and Strg+Umschalt+M (global search and bug report), and Strg+Alt+<key> where
// AltGr on a German Windows layout types a character (Q @, E €, M µ, 2 ², 3 ³, 7–0 {[]}, ß \, + ~, < |).
export const DEFAULT_PDF_SHORTCUT_BINDINGS: PdfShortcutBindings = {
  previousPage: "Ctrl+ArrowLeft", nextPage: "Ctrl+ArrowRight", zoomOut: "Ctrl+-", zoomIn: "Ctrl++",
  fitWidth: "Ctrl+Alt+B", fitPage: "Ctrl+Alt+G", actualSize: "Ctrl+0", continuousView: "Ctrl+1", singlePageView: "Ctrl+2", doublePageView: "Ctrl+3",
  search: "Ctrl+F", previousMatch: "Shift+Tab", nextMatch: "Tab", caseSensitive: "Ctrl+Shift+G", wholeWord: "Ctrl+Alt+W",
  navigatorPages: "Ctrl+Alt+S", navigatorSearch: "Ctrl+Alt+F", outline: "Ctrl+Alt+L", captureRegion: "Ctrl+Shift+B", bookmarkPage: "Ctrl+Shift+S", comments: "Ctrl+Alt+K",
  previousAnnotation: "Ctrl+Alt+ArrowUp", nextAnnotation: "Ctrl+Alt+ArrowDown", backToComments: "Ctrl+Alt+ArrowLeft", copyCitation: "Ctrl+Shift+C", editAnnotation: "Ctrl+E", deleteAnnotation: "Ctrl+Delete",
  createTask: "Ctrl+Shift+A",
  createDeadline: "Ctrl+Shift+D",
  rotate: "Ctrl+Alt+R", toggleNavigator: "Ctrl+Alt+N", openOriginal: "Ctrl+O", download: "Ctrl+S", printPdf: "Ctrl+P", focusMode: "Ctrl+Shift+F", shortcuts: "Ctrl+/",
};

/** Defaults up to preferences version 3; stored bindings equal to these follow the new defaults. */
const LEGACY_V3_DEFAULT_BINDINGS: Partial<PdfShortcutBindings> = {
  fitWidth: "Ctrl+W", fitPage: "Ctrl+Shift+W", caseSensitive: "Ctrl+Alt+C",
  navigatorPages: "Ctrl+Alt+1", navigatorSearch: "Ctrl+Alt+2", outline: "Ctrl+Alt+3",
  captureRegion: "Ctrl+R", bookmarkPage: "Ctrl+B", comments: "Ctrl+M", toggleNavigator: "Ctrl+N",
};

const canonicalKey = (key: string) => key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
// Browser-owned keys that a page cannot (reliably) intercept, plus the app-wide bug report.
const reservedShortcuts = new Set(["Ctrl+Shift+M", "Ctrl+W", "Ctrl+Shift+W", "Ctrl+N", "Ctrl+Shift+N", "Ctrl+T", "Ctrl+Shift+T"]);
const reservedShortcutKeys = new Set(["Tab", "Escape", "F5", "F11", "F12"]);

export function normalizePdfShortcut(input: { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey?: boolean }) {
  if (!(input.ctrlKey || input.metaKey) || ["Control", "Shift", "Alt", "Meta"].includes(input.key)) return null;
  // With Alt (⌥ on macOS) the key often reports the layout's special character ("ç" for ⌥C);
  // fall back to the physical letter or digit so Strg+Alt+<letter> bindings match everywhere.
  const physical = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(input.code ?? "");
  const key = input.altKey && physical && !/^[a-z0-9]$/i.test(input.key) ? (physical[1] ?? physical[2]) : canonicalKey(input.key);
  // On many keyboard layouts, characters such as + and / intrinsically need
  // Shift. The semantic key already contains that character, so recording the
  // physical Shift modifier would make the configured shortcut impossible to match.
  const implicitCharacterShift = key.length === 1 && !/[\p{L}\p{N}]/u.test(key);
  return ["Ctrl", input.altKey ? "Alt" : "", input.shiftKey && !implicitCharacterShift ? "Shift" : "", key].filter(Boolean).join("+");
}

export function isReservedPdfShortcut(shortcut: string) {
  return reservedShortcuts.has(shortcut) || reservedShortcutKeys.has(shortcut.split("+").at(-1) ?? "");
}

/**
 * Moves bindings stored before preferences version 4 to the new defaults when they still
 * equal the old default; customised bindings are kept. Runs before parsePdfShortcutBindings.
 */
export function migratePdfShortcutBindings(value: unknown, version: number | undefined): unknown {
  if ((version ?? 0) >= 4 || !value || typeof value !== "object") return value;
  const migrated: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [action, legacy] of Object.entries(LEGACY_V3_DEFAULT_BINDINGS)) {
    if (migrated[action] === legacy) migrated[action] = DEFAULT_PDF_SHORTCUT_BINDINGS[action as PdfShortcutAction];
  }
  return migrated;
}

/**
 * Reads stored bindings. Missing or reserved ones fall back to the default; a default another
 * action already claims stays unassigned ("") rather than creating a duplicate, and if a
 * migration left two actions on the same key, the later one is unassigned.
 */
export function parsePdfShortcutBindings(value: unknown): PdfShortcutBindings {
  const candidate = value && typeof value === "object" ? value as Partial<Record<PdfShortcutAction, unknown>> : {};
  const stored = (action: PdfShortcutAction) => {
    const binding = candidate[action];
    return typeof binding === "string" && !isReservedPdfShortcut(binding) ? binding : null;
  };
  const claimed = new Set<string>();
  const bindings = {} as PdfShortcutBindings;
  for (const action of PDF_SHORTCUT_ACTIONS) {
    const binding = stored(action);
    if (binding === null) continue;
    bindings[action] = binding && claimed.has(binding) ? "" : binding;
    if (binding) claimed.add(binding);
  }
  for (const action of PDF_SHORTCUT_ACTIONS) {
    if (action in bindings) continue;
    const fallback = DEFAULT_PDF_SHORTCUT_BINDINGS[action];
    bindings[action] = claimed.has(fallback) ? "" : fallback;
    claimed.add(fallback);
  }
  return Object.fromEntries(PDF_SHORTCUT_ACTIONS.map((action) => [action, bindings[action]])) as PdfShortcutBindings;
}

export function shortcutConflicts(bindings: PdfShortcutBindings, action: PdfShortcutAction, shortcut: string) {
  if (!shortcut) return null;
  return PDF_SHORTCUT_ACTIONS.find((candidate) => candidate !== action && bindings[candidate] === shortcut) ?? null;
}
