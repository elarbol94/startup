// Pure keyboard-shortcut logic shared by the global shortcut manager
// (components/keyboard-shortcuts.tsx) and the shortcut tooltips (components/ui/shortcut-tooltip.tsx).
//
// Notation: steps are separated by a space ("G P" = press G, then P); keys inside a step are
// joined by "+" ("Mod+Shift+A"). "Mod" is Ctrl on Windows/Linux and ⌘ on macOS.

export type KeyStep = { key: string; mod: boolean; shift: boolean; alt: boolean };
export type ParsedShortcut = KeyStep[];
export type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/** How long the first key of a sequence ("G" in "G P") waits for the second one. */
export const SEQUENCE_TIMEOUT_MS = 1500;

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock"]);

/** Letters and digits carry Shift explicitly; for symbols Shift is part of the layout ("/" is Shift+7 on German keyboards). */
function isAlphanumeric(key: string) {
  return key.length === 1 && /[\p{L}\p{N}]/u.test(key);
}

function normalizeKey(key: string) {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  return shortcut.trim().split(/\s+/).map((step) => {
    // "Mod++" style keys are not used; a trailing "+" would be ambiguous, so the key is the last segment.
    const parts = step.split("+");
    const key = parts.pop() ?? "";
    const modifiers = new Set(parts.map((part) => part.toLowerCase()));
    return {
      key: normalizeKey(key),
      mod: modifiers.has("mod") || modifiers.has("ctrl"),
      shift: modifiers.has("shift"),
      alt: modifiers.has("alt"),
    };
  });
}

export function matchesStep(event: KeyEventLike, step: KeyStep): boolean {
  if (MODIFIER_KEYS.has(event.key)) return false;
  if (normalizeKey(event.key) !== step.key) return false;
  if ((event.ctrlKey || event.metaKey) !== step.mod) return false;
  if (event.altKey !== step.alt) return false;
  return isAlphanumeric(step.key) ? event.shiftKey === step.shift : true;
}

export function matchesShortcut(event: KeyEventLike, shortcut: string | ParsedShortcut): boolean {
  const steps = typeof shortcut === "string" ? parseShortcut(shortcut) : shortcut;
  return steps.length === 1 && matchesStep(event, steps[0]);
}

function sameStep(a: KeyStep, b: KeyStep) {
  return a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
}

/**
 * Decides what a key press does given the registered shortcuts and the pending first key of
 * a sequence. Returns the index of the matched shortcut (or null) and the new pending step.
 * A sequence that is started but not completed falls back to single-key matching, so a stray
 * "G" never swallows the next shortcut.
 */
export function resolveShortcut(
  shortcuts: readonly ParsedShortcut[],
  event: KeyEventLike,
  pending: KeyStep | null,
): { index: number | null; pending: KeyStep | null } {
  if (MODIFIER_KEYS.has(event.key)) return { index: null, pending };
  if (pending) {
    const index = shortcuts.findIndex((steps) => steps.length === 2 && sameStep(steps[0], pending) && matchesStep(event, steps[1]));
    if (index >= 0) return { index, pending: null };
  }
  const starter = shortcuts.find((steps) => steps.length === 2 && matchesStep(event, steps[0]));
  if (starter) return { index: null, pending: starter[0] };
  const index = shortcuts.findIndex((steps) => steps.length === 1 && matchesStep(event, steps[0]));
  return { index: index >= 0 ? index : null, pending: null };
}

/** Shortcuts must not fire while the user is typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== "function") return false;
  const element = target as HTMLElement;
  return element.isContentEditable || element.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

/**
 * Single-key page shortcuts must not fire from inside open dialogs, menus or listboxes: those
 * use letters for type-ahead and should not trigger actions on the page behind them.
 */
export function isShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (isEditableTarget(target)) return true;
  if (!target || typeof (target as HTMLElement).closest !== "function") return false;
  return (target as HTMLElement).closest("[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [data-shortcuts-ignore]") !== null;
}

export type ShortcutKeyLabels = { ctrl: string };

/** Display keys per step, e.g. "Mod+Shift+A" → [["Ctrl", "⇧", "A"]], "G P" → [["G"], ["P"]]. */
export function shortcutDisplayKeys(shortcut: string, { mac, labels }: { mac: boolean; labels: ShortcutKeyLabels }): string[][] {
  return parseShortcut(shortcut).map((step) => [
    ...(step.mod ? [mac ? "⌘" : labels.ctrl] : []),
    ...(step.alt ? [mac ? "⌥" : "Alt"] : []),
    ...(step.shift ? ["⇧"] : []),
    step.key.length === 1 ? step.key.toUpperCase() : step.key,
  ]);
}

/** Value for aria-keyshortcuts; sequences cannot be expressed there, so they return undefined. */
export function ariaKeyShortcuts(shortcut: string): string | undefined {
  const steps = parseShortcut(shortcut);
  if (steps.length !== 1) return undefined;
  const [step] = steps;
  const key = step.key.length === 1 ? step.key.toUpperCase() : step.key;
  const rest = [step.alt ? "Alt" : "", step.shift ? "Shift" : "", key].filter(Boolean).join("+");
  return step.mod ? `Control+${rest} Meta+${rest}` : rest;
}
