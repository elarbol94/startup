// Keyboard helpers for presentation-editor.tsx: the format copy/paste chord, the
// single-letter insertion tools and the labels the menus and "Tastenkürzel" list show.
import type { EditorSearchCommand } from "../editor-command-search";
import type { PresentationShapeKind } from "../../lib/presentation";

/** Single keys that start placing a new element, like the toolbar buttons do. */
export const presentationToolKeys: Record<string, string> = { t: "addText", r: "addRect", o: "addEllipse", l: "addLine", f: "addFrame" };

/**
 * Ctrl/Cmd+Shift+C and +V copy and paste an object's format, as in PowerPoint; Ctrl/Cmd+Alt+C
 * and +V do the same. Matched on the physical key, because Option changes `event.key` on a
 * Mac; AltGr (reported as Ctrl+Alt on Windows) types characters and is left alone.
 */
export function formatShortcut(event: KeyboardEvent): string | undefined {
  if (event.shiftKey && !event.altKey) return event.code === "KeyC" ? "copyFormat" : event.code === "KeyV" ? "pasteFormat" : undefined;
  if (!event.altKey || event.shiftKey || event.getModifierState?.("AltGraph")) return undefined;
  return event.code === "KeyC" ? "copyFormat" : event.code === "KeyV" ? "pasteFormat" : undefined;
}

/** A single-letter tool, when no modifier is held; the caller has already ruled out typing. */
export function toolShortcut(event: KeyboardEvent): string | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return undefined;
  return presentationToolKeys[event.key.toLowerCase()];
}

export function presentationShortcutLabels(isMac: boolean): Record<string, string> {
  const modifier = isMac ? "⌘" : "Ctrl", alt = isMac ? "⌥" : "Alt";
  return {
    copy: `${modifier}+C`, cut: `${modifier}+X`, paste: `${modifier}+V`, duplicateSelection: `${modifier}+D`, selectAll: `${modifier}+A`,
    group: `${modifier}+G`, ungroup: `${modifier}+Shift+G`, undo: `${modifier}+Z`, redo: `${modifier}+Shift+Z / ${modifier}+Y`, save: `${modifier}+S`,
    deleteSelection: "Delete", editText: "Enter",
    front: `${modifier}+Shift+] / ${modifier}+Shift+↑`, back: `${modifier}+Shift+[ / ${modifier}+Shift+↓`, forward: `${modifier}+]`, backward: `${modifier}+[`,
    copyFormat: `${modifier}+Shift+C / ${modifier}+${alt}+C`, pasteFormat: `${modifier}+Shift+V / ${modifier}+${alt}+V`,
    ...Object.fromEntries(Object.entries(presentationToolKeys).map(([key, id]) => [id, key.toUpperCase()])),
  };
}

/** The shape tools behind R, O and L, listed with their keys in the shortcut help. */
export function presentationShapeToolCommands({ addShape, label, disabledReason, group }: {
  addShape: (shape: PresentationShapeKind) => void; label: (shape: PresentationShapeKind) => string; disabledReason?: string; group: string;
}): EditorSearchCommand[] {
  return ([["addRect", "rect"], ["addEllipse", "ellipse"], ["addLine", "line"]] as const)
    .map(([id, shape]) => ({ id, label: label(shape), execute: () => addShape(shape), disabledReason, group }));
}

/** "Text (T)": a toolbar tooltip naming the key that does the same. */
export function withToolKey(label: string, id: string, labels: Record<string, string>) {
  return labels[id] ? `${label} (${labels[id]})` : label;
}

/** The key shown next to a shape in the "Einfügen" menu. */
export function shapeToolKey(shape: PresentationShapeKind) {
  return ({ rect: "R", ellipse: "O", line: "L" } as Partial<Record<PresentationShapeKind, string>>)[shape];
}
