import { describe, expect, it } from "vitest";
import { GLOBAL_SHORTCUTS, NAVIGATION_SHORTCUTS, PROJECTS_PAGE_SHORTCUTS } from "./app-shortcuts";
import {
  ariaKeyShortcuts,
  isEditableTarget,
  isShortcutBlockedTarget,
  matchesShortcut,
  parseShortcut,
  resolveShortcut,
  shortcutDisplayKeys,
} from "./shortcuts";

const key = (value: string, modifiers: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}) => ({
  key: value, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers,
});

function fakeTarget(matches: string[], contentEditable = false) {
  return {
    isContentEditable: contentEditable,
    closest: (selector: string) => (matches.some((match) => selector.includes(match)) ? {} : null),
  } as unknown as EventTarget;
}

describe("matchesShortcut", () => {
  it("matches Mod with Ctrl or ⌘ and requires exact modifiers", () => {
    expect(matchesShortcut(key("k", { ctrlKey: true }), "Mod+K")).toBe(true);
    expect(matchesShortcut(key("K", { metaKey: true }), "Mod+K")).toBe(true);
    expect(matchesShortcut(key("k"), "Mod+K")).toBe(false);
    expect(matchesShortcut(key("K", { ctrlKey: true, shiftKey: true }), "Mod+K")).toBe(false);
    expect(matchesShortcut(key("A", { ctrlKey: true, shiftKey: true }), "Mod+Shift+A")).toBe(true);
  });

  it("keeps single-letter shortcuts off modified presses", () => {
    expect(matchesShortcut(key("t"), "T")).toBe(true);
    expect(matchesShortcut(key("t", { ctrlKey: true }), "T")).toBe(false);
    expect(matchesShortcut(key("T", { shiftKey: true }), "T")).toBe(false);
    expect(matchesShortcut(key("t", { altKey: true }), "T")).toBe(false);
  });

  it("ignores the layout Shift needed to type a symbol", () => {
    expect(matchesShortcut(key("/", { shiftKey: true }), "/")).toBe(true);
    expect(matchesShortcut(key("/"), "/")).toBe(true);
  });
});

describe("resolveShortcut", () => {
  const shortcuts = ["G P", "G T", "T", "N"].map(parseShortcut);

  it("completes a two-key sequence", () => {
    const first = resolveShortcut(shortcuts, key("g"), null);
    expect(first.index).toBeNull();
    expect(first.pending).not.toBeNull();
    expect(resolveShortcut(shortcuts, key("t"), first.pending)).toEqual({ index: 1, pending: null });
  });

  it("falls back to single keys when no sequence is pending or it does not complete", () => {
    expect(resolveShortcut(shortcuts, key("t"), null)).toEqual({ index: 2, pending: null });
    const { pending } = resolveShortcut(shortcuts, key("g"), null);
    expect(resolveShortcut(shortcuts, key("n"), pending)).toEqual({ index: 3, pending: null });
  });

  it("ignores lone modifier presses and keeps the pending step", () => {
    const { pending } = resolveShortcut(shortcuts, key("g"), null);
    expect(resolveShortcut(shortcuts, key("Shift", { shiftKey: true }), pending)).toEqual({ index: null, pending });
  });
});

describe("target guards", () => {
  it("blocks typing targets", () => {
    expect(isEditableTarget(fakeTarget(["input"]))).toBe(true);
    expect(isEditableTarget(fakeTarget([], true))).toBe(true);
    expect(isEditableTarget(fakeTarget([]))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it("also blocks dialogs and menus for page shortcuts", () => {
    expect(isShortcutBlockedTarget(fakeTarget(["role='dialog'"]))).toBe(true);
    expect(isShortcutBlockedTarget(fakeTarget(["role='menu'"]))).toBe(true);
    expect(isShortcutBlockedTarget(fakeTarget([]))).toBe(false);
  });
});

describe("display", () => {
  it("formats per platform", () => {
    expect(shortcutDisplayKeys("Mod+Shift+A", { mac: false, labels: { ctrl: "Strg" } })).toEqual([["Strg", "⇧", "A"]]);
    expect(shortcutDisplayKeys("Mod+K", { mac: true, labels: { ctrl: "Ctrl" } })).toEqual([["⌘", "K"]]);
    expect(shortcutDisplayKeys("G P", { mac: false, labels: { ctrl: "Ctrl" } })).toEqual([["G"], ["P"]]);
  });

  it("builds aria-keyshortcuts for single steps only", () => {
    expect(ariaKeyShortcuts("Mod+K")).toBe("Control+K Meta+K");
    expect(ariaKeyShortcuts("T")).toBe("T");
    expect(ariaKeyShortcuts("G P")).toBeUndefined();
  });
});

describe("app shortcut map", () => {
  const stepKey = (shortcut: string) => JSON.stringify(parseShortcut(shortcut));

  it("has no duplicate bindings across global, navigation and /projects shortcuts", () => {
    const all = [...Object.values(GLOBAL_SHORTCUTS), ...Object.values(NAVIGATION_SHORTCUTS), ...Object.values(PROJECTS_PAGE_SHORTCUTS)];
    expect(new Set(all.map(stepKey)).size).toBe(all.length);
  });

  it("never binds a single key that starts a navigation sequence", () => {
    const starters = new Set(Object.values(NAVIGATION_SHORTCUTS).map((shortcut) => JSON.stringify(parseShortcut(shortcut)[0])));
    for (const shortcut of Object.values(PROJECTS_PAGE_SHORTCUTS)) {
      expect(starters.has(JSON.stringify(parseShortcut(shortcut)[0]))).toBe(false);
    }
  });
});
