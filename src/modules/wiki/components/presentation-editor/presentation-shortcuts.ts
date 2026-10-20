// Keyboard helpers for presentation-editor.tsx: the format copy/paste chord, the
// single-letter insertion tools and the labels the menus and "Tastenkürzel" list show.
import type { EditorSearchCommand } from "../editor-command-search";
import { rotateElements, type PresentationElement, type PresentationShapeKind } from "../../lib/presentation";
import type { TextFormatKey } from "../../lib/presentation-keyboard-edits";

/**
 * Single keys that start placing a new element. PowerPoint has none -- typing on a selected
 * shape types into it -- so, following PowerPoint, there are none here either.
 */
export const presentationToolKeys: Record<string, string> = {};

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

/** Key words that differ by locale ("Strg"/"Ctrl", "Entf"/"Del", "Eingabe"/"Enter"); from messages. */
export type PresentationKeyLabels = { ctrl: string; delete: string; enter: string };

export function presentationShortcutLabels(isMac: boolean, keys: PresentationKeyLabels): Record<string, string> {
  const modifier = isMac ? "⌘" : keys.ctrl, alt = isMac ? "⌥" : "Alt", shift = isMac ? "⇧" : "Shift";
  return {
    copy: `${modifier}+C`, cut: `${modifier}+X`, paste: `${modifier}+V`, duplicateSelection: `${modifier}+D`, selectAll: `${modifier}+A`,
    group: `${modifier}+G`, ungroup: `${modifier}+${shift}+G`, undo: `${modifier}+Z`, redo: `${modifier}+${shift}+Z / ${modifier}+Y`, save: `${modifier}+S`,
    deleteSelection: isMac ? "⌫" : keys.delete, editText: keys.enter,
    // Ctrl+]/[ change the font size, as in PowerPoint; layers keep the Shift variants.
    front: `${modifier}+${shift}+]`, back: `${modifier}+${shift}+[`,
    copyFormat: `${modifier}+${shift}+C / ${modifier}+${alt}+C`, pasteFormat: `${modifier}+${shift}+V / ${modifier}+${alt}+V`,
    ...Object.fromEntries(Object.entries(presentationToolKeys).map(([key, id]) => [id, key.toUpperCase()])),
  };
}

/** The shape tools behind V, E and L, listed with their keys in the shortcut help. */
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
  const id = ({ rect: "addRect", ellipse: "addEllipse", line: "addLine" } as Partial<Record<PresentationShapeKind, string>>)[shape];
  const key = Object.entries(presentationToolKeys).find(([, tool]) => tool === id)?.[0];
  return key?.toUpperCase();
}

/**
 * PowerPoint's text keys on a selected box or shape: Ctrl+B/I/U, Ctrl+L/E/R alignment, and
 * font size with Ctrl+]/[ or Ctrl+Shift+>/<. Matched on the physical key so they also work on
 * German keyboards, where ">" is Shift on the "<" key next to the left Shift.
 */
export function textFormatKey(event: KeyboardEvent): TextFormatKey | undefined {
  if (!event.shiftKey) {
    const plain: Record<string, TextFormatKey> = { KeyB: "bold", KeyI: "italic", KeyU: "underline", KeyL: "alignLeft", KeyE: "alignCenter", KeyR: "alignRight", BracketRight: "fontBigger", BracketLeft: "fontSmaller" };
    return plain[event.code];
  }
  if (event.key === ">" || event.code === "Period") return "fontBigger";
  if (event.key === "<" || event.code === "Comma") return "fontSmaller";
  return undefined;
}

/** Alt+Left/Right: each selected object turns around its own centre, as in PowerPoint. */
export function rotateElementsIndividually(elements: PresentationElement[], ids: string[], degrees: number): PresentationElement[] {
  return ids.reduce((current, id) => {
    const element = current.find((candidate) => candidate.id === id);
    return element ? rotateElements(current, new Set([id]), degrees, { x: element.x + element.width / 2, y: element.y + element.height / 2 }) : current;
  }, elements);
}
