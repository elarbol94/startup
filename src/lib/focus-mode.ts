// Focus mode has three independent sources that can hide the app chrome:
// - global: the platform-wide toggle (Mod+Shift+F, user menu, search), per user and device;
// - reader: the wiki PDF/note preference, remembered per scope, applied on those routes only;
// - planning: the Gantt "focused planning" URL, owned by the projects page.
// Each is switched on by itself; leaving focus always clears all of them for the current page.

export type FocusScope = "pdf" | "note";
export type FocusPreferenceKind = "global" | FocusScope;

export const FOCUS_SCOPES: readonly FocusScope[] = ["pdf", "note"];

const STORAGE_PREFIX = "management-platform:focus-mode";

/** Pre-namespacing keys shared by every account in a browser; migrated once per user. */
export const LEGACY_FOCUS_MODE_STORAGE_KEYS: Record<FocusScope, string> = {
  pdf: `${STORAGE_PREFIX}:pdf`,
  note: `${STORAGE_PREFIX}:note`,
};

export function focusStorageKey(kind: FocusPreferenceKind, userId: string): string {
  return `${STORAGE_PREFIX}:${kind}:${userId}`;
}

/** Attributes on <html>; the (app) layout's CSS hides the chrome from them before hydration. */
export const FOCUS_GLOBAL_ATTRIBUTE = "data-focus-global";
export const FOCUS_READER_ATTRIBUTE = "data-focus-reader";

const PDF_ROUTE = /^\/wiki\/sources\/[^/]+\/read\/[^/]+\/?$/;
const NOTE_ROUTE = /^\/wiki\/pages\/[^/]+\/?$/;

export function focusScopeForPathname(pathname: string): FocusScope | null {
  if (PDF_ROUTE.test(pathname)) return "pdf";
  if (NOTE_ROUTE.test(pathname)) return "note";
  return null;
}

export type FocusPreferences = { global: boolean } & Record<FocusScope, boolean>;

export type FocusState = {
  /** The reader preference of the current route's scope. */
  readerFocused: boolean;
  /** App sidebar, mobile header and wiki rail are hidden. */
  chromeHidden: boolean;
  /** Any source is active, so the shortcut leaves focus. */
  anyFocused: boolean;
};

export function resolveFocusState({
  preferences,
  scope,
  planning,
}: {
  preferences: FocusPreferences;
  scope: FocusScope | null;
  planning: boolean;
}): FocusState {
  const readerFocused = scope ? preferences[scope] : false;
  const chromeHidden = preferences.global || readerFocused;
  return { readerFocused, chromeHidden, anyFocused: chromeHidden || planning };
}

/** Preferences after leaving focus on a page: global and the current scope are cleared. */
export function preferencesAfterExit(preferences: FocusPreferences, scope: FocusScope | null): FocusPreferences {
  return { ...preferences, global: false, ...(scope ? { [scope]: false } : {}) };
}

export type FocusShortcutAction = "exit" | "enterReader" | "enterGlobal" | "forwardToWorkspace";

/**
 * Mod+Shift+F: leave any active focus, otherwise enter the page's reader focus or the global
 * one. Workspace panes own no global focus; outside reader routes they ask the main window.
 */
export function focusShortcutAction({
  state,
  scope,
  embedded,
}: {
  state: FocusState;
  scope: FocusScope | null;
  embedded: boolean;
}): FocusShortcutAction {
  if (embedded && !scope) return "forwardToWorkspace";
  if (state.anyFocused) return "exit";
  return scope ? "enterReader" : "enterGlobal";
}

/**
 * Runs while the HTML is parsed, before the first paint: applies the stored preferences of
 * this user as <html> attributes so the hidden chrome never flashes. Mirrors the provider.
 */
export function focusBootstrapScript(userId: string): string {
  const keys = {
    global: focusStorageKey("global", userId),
    pdf: focusStorageKey("pdf", userId),
    note: focusStorageKey("note", userId),
    legacyPdf: LEGACY_FOCUS_MODE_STORAGE_KEYS.pdf,
    legacyNote: LEGACY_FOCUS_MODE_STORAGE_KEYS.note,
  };
  // JSON is valid JS; escaping "<" keeps any value from closing the script element.
  const data = JSON.stringify({ keys, pdf: PDF_ROUTE.source, note: NOTE_ROUTE.source }).replace(/</g, "\\u003c");
  return `(function(){try{var c=${data},d=document.documentElement,s=window.localStorage,e=false;`
    + `try{e=!!window.frameElement&&window.frameElement.getAttribute("data-workspace-pane")==="true"}catch(x){}`
    + `if(!e&&s.getItem(c.keys.global)==="true")d.setAttribute("${FOCUS_GLOBAL_ATTRIBUTE}","true");`
    + `var p=location.pathname,k=new RegExp(c.pdf).test(p)?"pdf":new RegExp(c.note).test(p)?"note":null;`
    + `if(k){var v=s.getItem(c.keys[k]);if(v===null)v=s.getItem(k==="pdf"?c.keys.legacyPdf:c.keys.legacyNote);`
    + `if(v==="true")d.setAttribute("${FOCUS_READER_ATTRIBUTE}","true")}}catch(x){}})()`;
}
