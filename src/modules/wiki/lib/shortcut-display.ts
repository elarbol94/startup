/** Words that differ by locale. Arrow glyphs do not, so they stay in this module. */
export type ShortcutKeyLabels = { ctrl: string; delete: string };

const keyGlyphs: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
const macModifiers: Record<string, string> = { Ctrl: "⌘", Alt: "⌥", Shift: "⇧" };

/** Splits "Ctrl+Alt+B" into modifiers and key; "Ctrl++" keeps "+" as the key. */
function splitShortcut(shortcut: string) {
  if (shortcut.endsWith("++")) return { modifiers: shortcut.slice(0, -2).split("+").filter(Boolean), key: "+" };
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  return { modifiers: parts, key };
}

/**
 * Renders a stored binding such as "Ctrl+Alt+ArrowUp" for display.
 *
 * The modifier words are passed in rather than hardcoded: this used to substitute "Strg"
 * and "Entf" unconditionally, so every shortcut hint in the app read German regardless of
 * the chosen locale. Lib files cannot reach next-intl, so the caller supplies them. On macOS
 * ("mac", see useIsMacPlatform) the modifiers become ⌘ ⌥ ⇧, as in lib/shortcuts.ts
 * shortcutDisplayKeys, because the reader treats ⌘ like Ctrl.
 */
export function displayShortcut(shortcut: string, labels: ShortcutKeyLabels, { mac = false }: { mac?: boolean } = {}) {
  if (!shortcut) return "";
  const { modifiers, key } = splitShortcut(shortcut);
  const shownKey = keyGlyphs[key] ?? (key === "Delete" ? labels.delete : key);
  if (mac) return [...modifiers.map((modifier) => macModifiers[modifier] ?? modifier), shownKey].join("");
  return [...modifiers.map((modifier) => modifier === "Ctrl" ? labels.ctrl : modifier), shownKey].join("+");
}
