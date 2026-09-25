// Which keyboard and clipboard events belong to the presentation editor, shared by its key
// handler and its clipboard listeners. Used by presentation-editor.tsx.

const TYPING = "input, textarea, select, [contenteditable=true]";
const OVERLAYS = "[role=dialog], [role=menu], [data-slot=dropdown-menu-content]";
/** Controls whose own Enter/Space/arrow keys must keep working when they have focus. */
const CONTROLS = "button, a, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=slider], [role=combobox]";

export type PresentationKeyScope = { target: HTMLElement; typing: boolean; onControl: boolean };

/**
 * Null when the event is none of the editor's business: outside it, in a dialog or menu.
 * Focus falls back to <body> when a clicked toolbar control disables itself or a menu
 * closes; while the editor is on screen, those keys are the editor's too.
 */
export function presentationKeyScope(event: Event, root: HTMLElement | null): PresentationKeyScope | null {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target || !root) return null;
  const fallback = (target === document.body || target === document.documentElement) && isOnScreen(root);
  if (!fallback && !root.contains(target)) return null;
  if (target.closest(OVERLAYS)) return null;
  return { target, typing: Boolean(target.closest(TYPING)), onControl: Boolean(target.closest(CONTROLS)) };
}

function isOnScreen(element: HTMLElement) {
  return typeof element.checkVisibility === "function" ? element.checkVisibility() : element.getClientRects().length > 0;
}

/** Keys that a focused control handles itself (activate, toggle, move within it). */
export function isControlKey(event: KeyboardEvent) {
  return !(event.ctrlKey || event.metaKey || event.altKey) && ["Enter", " ", "Spacebar", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key);
}

/**
 * Ctrl/Cmd shortcuts, except characters typed with AltGr: Windows reports AltGr as Ctrl+Alt,
 * so AltGr+8 on a German keyboard ("[") must not reorder the selection. Ctrl+Alt with a
 * letter or digit is still a shortcut.
 */
export function isModifierShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return false;
  const altGraph = event.altKey || event.getModifierState?.("AltGraph");
  return !(altGraph && event.key.length === 1 && !/^[a-z0-9]$/i.test(event.key));
}
