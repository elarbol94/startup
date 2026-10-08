import { describe, expect, it } from "vitest";
import { DEFAULT_PDF_SHORTCUT_BINDINGS, isReservedPdfShortcut, migratePdfShortcutBindings, normalizePdfShortcut, parsePdfShortcutBindings, shortcutConflicts } from "./pdf-shortcuts";

describe("PDF shortcuts", () => {
  it("normalizes Ctrl and Cmd combinations", () => {
    expect(normalizePdfShortcut({ key: "f", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe("Ctrl+F");
    expect(normalizePdfShortcut({ key: "ArrowLeft", ctrlKey: false, metaKey: true, altKey: true, shiftKey: false })).toBe("Ctrl+Alt+ArrowLeft");
    expect(normalizePdfShortcut({ key: "+", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe("Ctrl++");
    expect(normalizePdfShortcut({ key: "/", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe("Ctrl+/");
    expect(normalizePdfShortcut({ key: "f", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe("Ctrl+Shift+F");
    expect(normalizePdfShortcut({ key: "Shift", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBeNull();
  });

  it("fills missing bindings with defaults and detects collisions", () => {
    const bindings = parsePdfShortcutBindings({ search: "Ctrl+K" });
    expect(bindings.search).toBe("Ctrl+K");
    expect(bindings.printPdf).toBe(DEFAULT_PDF_SHORTCUT_BINDINGS.printPdf);
    expect(shortcutConflicts(bindings, "nextMatch", "Ctrl+K")).toBe("search");
  });

  it("matches Alt combinations on the physical key when Alt/Option changes the character", () => {
    expect(normalizePdfShortcut({ key: "ç", code: "KeyC", ctrlKey: false, metaKey: true, altKey: true, shiftKey: false })).toBe("Ctrl+Alt+C");
    expect(normalizePdfShortcut({ key: "b", code: "KeyB", ctrlKey: true, metaKey: false, altKey: true, shiftKey: false })).toBe("Ctrl+Alt+B");
    expect(normalizePdfShortcut({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true, metaKey: false, altKey: true, shiftKey: false })).toBe("Ctrl+Alt+ArrowUp");
  });

  it("rejects browser-reserved keys and the global bug report", () => {
    expect(isReservedPdfShortcut("Ctrl+Tab")).toBe(true);
    for (const shortcut of ["Ctrl+W", "Ctrl+Shift+W", "Ctrl+N", "Ctrl+Shift+N", "Ctrl+T", "Ctrl+Shift+T", "Ctrl+Shift+M"]) expect(isReservedPdfShortcut(shortcut)).toBe(true);
    expect(isReservedPdfShortcut("Ctrl+Y")).toBe(false);
    expect(isReservedPdfShortcut("Ctrl+F")).toBe(false);
  });

  it("uses no reserved, global or AltGr-typed key by default", () => {
    const altGrCharacters = ["Q", "E", "M", "2", "3", "7", "8", "9", "0", "ß", "+", "<"];
    // Tab / Shift+Tab are the contextual match navigation inside the search field, not recordable.
    for (const binding of Object.values(DEFAULT_PDF_SHORTCUT_BINDINGS).filter((value) => !value.endsWith("Tab"))) {
      expect(isReservedPdfShortcut(binding)).toBe(false);
      expect(["Ctrl+K", "Ctrl+R", "Ctrl+M", "Ctrl+H", "Ctrl+Q"]).not.toContain(binding);
      if (binding.startsWith("Ctrl+Alt+")) expect(altGrCharacters).not.toContain(binding.slice("Ctrl+Alt+".length));
    }
  });

  it("moves bindings still on a version 3 default to the new default and keeps custom ones", () => {
    const migrated = parsePdfShortcutBindings(migratePdfShortcutBindings({ fitWidth: "Ctrl+W", comments: "Ctrl+M", captureRegion: "Ctrl+Shift+R", outline: "Ctrl+Alt+3" }, 3));
    expect(migrated).toMatchObject({ fitWidth: "Ctrl+Alt+B", comments: "Ctrl+Alt+K", captureRegion: "Ctrl+Shift+R", outline: "Ctrl+Alt+L" });
    expect(migratePdfShortcutBindings({ comments: "Ctrl+M" }, 4)).toEqual({ comments: "Ctrl+M" });
  });

  it("leaves an action unassigned instead of duplicating a key another action claims", () => {
    // The user had put "Seite merken" on Ctrl+Alt+K, the new default for comments.
    const bindings = parsePdfShortcutBindings(migratePdfShortcutBindings({ bookmarkPage: "Ctrl+Alt+K", comments: "Ctrl+M" }, 3));
    expect(bindings.bookmarkPage).toBe("Ctrl+Alt+K");
    expect(bindings.comments).toBe("");
    // A reserved custom binding falls back to the default; a missing one too, unless it is taken.
    const fallback = parsePdfShortcutBindings({ fitWidth: "Ctrl+W", rotate: "Ctrl+Alt+G" });
    expect(fallback.fitWidth).toBe("Ctrl+Alt+B");
    expect(fallback.rotate).toBe("Ctrl+Alt+G");
    expect(fallback.fitPage).toBe("");
    const assigned = Object.values(fallback).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(shortcutConflicts(fallback, "fitPage", "")).toBeNull();
  });

  it("defines one unique binding for every fixed PDF command", () => {
    expect(DEFAULT_PDF_SHORTCUT_BINDINGS.createTask).toBe("Ctrl+Shift+A");
    expect(DEFAULT_PDF_SHORTCUT_BINDINGS.createDeadline).toBe("Ctrl+Shift+D");
    expect(Object.keys(DEFAULT_PDF_SHORTCUT_BINDINGS)).toHaveLength(36);
    expect(new Set(Object.values(DEFAULT_PDF_SHORTCUT_BINDINGS)).size).toBe(36);
  });
});
