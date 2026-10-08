import { describe, expect, it } from "vitest";
import {
  CALENDAR_PAGE_SHORTCUTS,
  GLOBAL_SHORTCUTS,
  NAVIGATION_SHORTCUTS,
  PAGE_SHORTCUTS,
  PROJECT_PAGE_SHORTCUTS,
  PROJECTS_PAGE_SHORTCUTS,
  TIMELINE_KEY_HINTS,
} from "./app-shortcuts";
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

  it("keeps Shift+letter and the plain letter apart", () => {
    expect(matchesShortcut(key("T", { shiftKey: true }), "Shift+T")).toBe(true);
    expect(matchesShortcut(key("t"), "Shift+T")).toBe(false);
    expect(matchesShortcut(key("T", { shiftKey: true }), "T")).toBe(false);
    const shortcuts = [CALENDAR_PAGE_SHORTCUTS.day, CALENDAR_PAGE_SHORTCUTS.team].map(parseShortcut);
    expect(resolveShortcut(shortcuts, key("t"), null).index).toBe(0);
    expect(resolveShortcut(shortcuts, key("T", { shiftKey: true }), null).index).toBe(1);
  });

  it("matches Mod+Shift+M for the bug report but not Mod+M or Mod+Y", () => {
    expect(matchesShortcut(key("M", { ctrlKey: true, shiftKey: true }), GLOBAL_SHORTCUTS.reportBug)).toBe(true);
    expect(matchesShortcut(key("m", { metaKey: true, shiftKey: true }), GLOBAL_SHORTCUTS.reportBug)).toBe(true);
    expect(matchesShortcut(key("m", { ctrlKey: true }), GLOBAL_SHORTCUTS.reportBug)).toBe(false);
    expect(matchesShortcut(key("y", { ctrlKey: true }), GLOBAL_SHORTCUTS.reportBug)).toBe(false);
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

  it("resolves the umlaut sequence G Ü from the key \"ü\"", () => {
    const navigation = [NAVIGATION_SHORTCUTS.dashboard, NAVIGATION_SHORTCUTS.municipalities].map(parseShortcut);
    const { pending } = resolveShortcut(navigation, key("g"), null);
    expect(resolveShortcut(navigation, key("ü"), pending)).toEqual({ index: 0, pending: null });
    const again = resolveShortcut(navigation, key("g"), null);
    expect(resolveShortcut(navigation, key("g"), again.pending)).toEqual({ index: 1, pending: null });
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
    expect(shortcutDisplayKeys("Mod+Enter", { mac: false, labels: { ctrl: "Strg" } })).toEqual([["Strg", "↵"]]);
    expect(shortcutDisplayKeys("ArrowLeft", { mac: false, labels: { ctrl: "Strg" } })).toEqual([["←"]]);
    expect(shortcutDisplayKeys("G Ü", { mac: false, labels: { ctrl: "Ctrl" } })).toEqual([["G"], ["Ü"]]);
    expect(shortcutDisplayKeys("Shift+W", { mac: false, labels: { ctrl: "Ctrl" } })).toEqual([["⇧", "W"]]);
  });

  it("builds aria-keyshortcuts for single steps only", () => {
    expect(ariaKeyShortcuts("Mod+K")).toBe("Control+K Meta+K");
    expect(ariaKeyShortcuts("T")).toBe("T");
    expect(ariaKeyShortcuts("Shift+T")).toBe("Shift+T");
    expect(ariaKeyShortcuts("Alt+Q")).toBe("Alt+Q");
    expect(ariaKeyShortcuts("G P")).toBeUndefined();
  });
});

describe("app shortcut map", () => {
  const stepKey = (shortcut: string) => JSON.stringify(parseShortcut(shortcut));

  const pages = {
    projects: { ...PROJECTS_PAGE_SHORTCUTS, ...TIMELINE_KEY_HINTS },
    project: PROJECT_PAGE_SHORTCUTS,
    calendar: CALENDAR_PAGE_SHORTCUTS,
  };

  it.each(Object.entries(pages))("has no duplicate bindings across global, navigation and %s page shortcuts", (_, page) => {
    const all = [...Object.values(GLOBAL_SHORTCUTS), ...Object.values(NAVIGATION_SHORTCUTS), ...Object.values(page)];
    expect(new Set(all.map(stepKey)).size).toBe(all.length);
  });

  it("uses the shared vocabulary for common page actions", () => {
    expect(PROJECTS_PAGE_SHORTCUTS.today).toBe(PAGE_SHORTCUTS.today);
    expect(CALENDAR_PAGE_SHORTCUTS.today).toBe(PAGE_SHORTCUTS.today);
    expect(CALENDAR_PAGE_SHORTCUTS.newEvent).toBe(PAGE_SHORTCUTS.create);
    expect(PROJECT_PAGE_SHORTCUTS.newTask).toBe(PAGE_SHORTCUTS.create);
    expect(CALENDAR_PAGE_SHORTCUTS.search).toBe(PAGE_SHORTCUTS.search);
  });

  it("never binds a single key that starts a navigation sequence", () => {
    const starters = new Set(Object.values(NAVIGATION_SHORTCUTS).map((shortcut) => JSON.stringify(parseShortcut(shortcut)[0])));
    for (const shortcut of [...Object.values(pages), PAGE_SHORTCUTS].flatMap((page) => Object.values(page))) {
      expect(starters.has(JSON.stringify(parseShortcut(shortcut)[0]))).toBe(false);
    }
  });
});

describe("section page shortcuts", () => {
  // Imported here so this block stays self-contained at the end of the file.
  const load = () => import("./app-shortcuts");
  const stepKey = (shortcut: string) => JSON.stringify(parseShortcut(shortcut));

  it("only uses the shared page vocabulary", async () => {
    const { PAGE_SHORTCUTS: shared, SECTION_PAGE_SHORTCUTS } = await load();
    const vocabulary = new Set<string>(Object.values(shared));
    for (const section of Object.values(SECTION_PAGE_SHORTCUTS)) {
      for (const shortcut of Object.values(section)) expect(vocabulary.has(shortcut)).toBe(true);
    }
  });

  it("does not clash with global or navigation shortcuts", async () => {
    const { GLOBAL_SHORTCUTS: global, NAVIGATION_SHORTCUTS: navigation, SECTION_PAGE_SHORTCUTS, QUICK_CAPTURE_KEY_HINTS, MUNICIPALITY_ANALYSIS_KEY_HINTS } = await load();
    const taken = new Set([...Object.values(global), ...Object.values(navigation)].map(stepKey));
    const starters = new Set(Object.values(navigation).map((shortcut) => JSON.stringify(parseShortcut(shortcut)[0])));
    const pages = [...Object.values(SECTION_PAGE_SHORTCUTS), QUICK_CAPTURE_KEY_HINTS, MUNICIPALITY_ANALYSIS_KEY_HINTS];
    for (const shortcut of pages.flatMap((page) => Object.values(page))) {
      expect(taken.has(stepKey(shortcut))).toBe(false);
      expect(starters.has(JSON.stringify(parseShortcut(shortcut)[0]))).toBe(false);
    }
  });
});
