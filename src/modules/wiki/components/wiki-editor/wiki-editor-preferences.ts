// Locally stored wiki editor preferences: custom shortcut bindings (and the TipTap defaults
// they must capture) and display preferences. Used by wiki-editor.tsx.
import { readEditorStorage } from "../../lib/editor-draft";
import { DEFAULT_WIKI_SHORTCUT_BINDINGS, parseWikiShortcutBindings } from "../../lib/wiki-shortcuts";
import type { WikiEditorPreferences } from "../wiki-typography-dialog";

export const WIKI_SHORTCUTS_KEY = "wiki:editor-shortcuts:v1";
// These are TipTap's built-in editing combinations. Capture them as well when
// a user has moved the corresponding action, otherwise TipTap would still run
// the old command after the custom shortcut handler intentionally ignores it.
export const LEGACY_TIPTAP_SHORTCUTS = new Set([
  "Ctrl+B", "Ctrl+I", "Ctrl+U", "Ctrl+Shift+S", "Ctrl+E",
  "Ctrl+Alt+1", "Ctrl+Alt+2", "Ctrl+Alt+3", "Ctrl+Shift+7", "Ctrl+Shift+8", "Ctrl+Shift+9",
]);

export function loadEditorPreferences(): WikiEditorPreferences {
  if (typeof window === "undefined") return { statusVisible: true, minimalToolbar: false, typewriterMode: false };
  try {
    const stored = JSON.parse(readEditorStorage("wiki-editor-preferences") ?? "{}") as Partial<WikiEditorPreferences>;
    return { statusVisible: stored.statusVisible ?? true, minimalToolbar: stored.minimalToolbar ?? false, typewriterMode: stored.typewriterMode ?? false };
  } catch {
    return { statusVisible: true, minimalToolbar: false, typewriterMode: false };
  }
}

export function loadWikiShortcutBindings() {
  if (typeof window === "undefined") return { ...DEFAULT_WIKI_SHORTCUT_BINDINGS };
  try {
    return parseWikiShortcutBindings(JSON.parse(readEditorStorage(WIKI_SHORTCUTS_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_WIKI_SHORTCUT_BINDINGS };
  }
}
