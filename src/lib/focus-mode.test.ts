import { describe, expect, it } from "vitest";
import {
  FOCUS_GLOBAL_ATTRIBUTE,
  FOCUS_READER_ATTRIBUTE,
  focusBootstrapScript,
  focusScopeForPathname,
  focusShortcutAction,
  focusStorageKey,
  preferencesAfterExit,
  resolveFocusState,
  type FocusPreferences,
  type FocusScope,
} from "./focus-mode";

const OFF: FocusPreferences = { global: false, pdf: false, note: false };

describe("focus mode route scopes", () => {
  it("recognizes PDF reader routes", () => {
    expect(focusScopeForPathname("/wiki/sources/source-1/read/document-1")).toBe("pdf");
    expect(focusScopeForPathname("/wiki/sources/source-1/read/document-1/")).toBe("pdf");
  });

  it("recognizes note editor routes", () => {
    expect(focusScopeForPathname("/wiki/pages/project-notes")).toBe("note");
    expect(focusScopeForPathname("/wiki/pages/project-notes/")).toBe("note");
  });

  it("does not focus surrounding workspace routes", () => {
    expect(focusScopeForPathname("/wiki/inbox")).toBeNull();
    expect(focusScopeForPathname("/wiki/pages")).toBeNull();
    expect(focusScopeForPathname("/wiki/sources/source-1")).toBeNull();
    expect(focusScopeForPathname("/projects/project-1")).toBeNull();
  });
});

describe("focus state", () => {
  it("hides the chrome for global focus everywhere", () => {
    for (const scope of [null, "pdf", "note"] as const) {
      expect(resolveFocusState({ preferences: { ...OFF, global: true }, scope, planning: false })).toEqual({
        readerFocused: false,
        chromeHidden: true,
        anyFocused: true,
      });
    }
  });

  it("applies a reader preference only on its own route", () => {
    const preferences = { ...OFF, pdf: true };
    expect(resolveFocusState({ preferences, scope: "pdf", planning: false }).chromeHidden).toBe(true);
    expect(resolveFocusState({ preferences, scope: "note", planning: false }).chromeHidden).toBe(false);
    expect(resolveFocusState({ preferences, scope: null, planning: false }).anyFocused).toBe(false);
  });

  it("counts focused planning as focus without owning the chrome", () => {
    expect(resolveFocusState({ preferences: OFF, scope: null, planning: true })).toEqual({
      readerFocused: false,
      chromeHidden: false,
      anyFocused: true,
    });
  });

  it("always shows the chrome after leaving focus", () => {
    const combinations = [true, false].flatMap((global) =>
      [true, false].flatMap((pdf) => [true, false].map((note) => ({ global, pdf, note }))),
    );
    for (const preferences of combinations) {
      for (const scope of [null, "pdf", "note"] as (FocusScope | null)[]) {
        const next = preferencesAfterExit(preferences, scope);
        expect(resolveFocusState({ preferences: next, scope, planning: false }).chromeHidden).toBe(false);
      }
    }
  });

  it("keeps the other reader preference when leaving focus", () => {
    expect(preferencesAfterExit({ global: true, pdf: true, note: true }, "note")).toEqual({
      global: false,
      pdf: true,
      note: false,
    });
  });
});

describe("focus shortcut", () => {
  const state = (preferences: FocusPreferences, scope: FocusScope | null, planning = false) =>
    resolveFocusState({ preferences, scope, planning });

  it("enters global focus outside reader routes", () => {
    expect(focusShortcutAction({ state: state(OFF, null), scope: null, embedded: false })).toBe("enterGlobal");
  });

  it("enters reader focus on reader routes", () => {
    expect(focusShortcutAction({ state: state(OFF, "pdf"), scope: "pdf", embedded: false })).toBe("enterReader");
  });

  it("leaves any active focus", () => {
    expect(focusShortcutAction({ state: state({ ...OFF, global: true }, "pdf"), scope: "pdf", embedded: false })).toBe("exit");
    expect(focusShortcutAction({ state: state({ ...OFF, note: true }, "note"), scope: "note", embedded: false })).toBe("exit");
    expect(focusShortcutAction({ state: state(OFF, null, true), scope: null, embedded: false })).toBe("exit");
  });

  it("lets workspace panes forward everything but reader focus", () => {
    expect(focusShortcutAction({ state: state(OFF, null), scope: null, embedded: true })).toBe("forwardToWorkspace");
    expect(focusShortcutAction({ state: state(OFF, "pdf"), scope: "pdf", embedded: true })).toBe("enterReader");
  });
});

describe("focus bootstrap script", () => {
  function run(script: string, { stored = {}, pathname = "/", frame = null as null | { getAttribute: (name: string) => string | null }, throwing = false } = {}) {
    const attributes = new Map<string, string>();
    const window = {
      frameElement: frame,
      get localStorage() {
        if (throwing) throw new Error("blocked");
        return { getItem: (key: string) => (stored as Record<string, string>)[key] ?? null };
      },
    };
    const document = { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } };
    new Function("window", "document", "location", script)(window, document, { pathname });
    return attributes;
  }

  it("applies the user's global preference", () => {
    const attributes = run(focusBootstrapScript("user-1"), { stored: { [focusStorageKey("global", "user-1")]: "true" } });
    expect(attributes.get(FOCUS_GLOBAL_ATTRIBUTE)).toBe("true");
    expect(run(focusBootstrapScript("user-2"), { stored: { [focusStorageKey("global", "user-1")]: "true" } }).size).toBe(0);
  });

  it("applies reader focus on its route, falling back to the legacy key", () => {
    const pathname = "/wiki/sources/s/read/d";
    expect(run(focusBootstrapScript("u"), { pathname, stored: { [focusStorageKey("pdf", "u")]: "true" } }).get(FOCUS_READER_ATTRIBUTE)).toBe("true");
    expect(run(focusBootstrapScript("u"), { pathname, stored: { "management-platform:focus-mode:pdf": "true" } }).get(FOCUS_READER_ATTRIBUTE)).toBe("true");
    expect(run(focusBootstrapScript("u"), { pathname, stored: { [focusStorageKey("pdf", "u")]: "false", "management-platform:focus-mode:pdf": "true" } }).size).toBe(0);
    expect(run(focusBootstrapScript("u"), { pathname: "/wiki/inbox", stored: { [focusStorageKey("pdf", "u")]: "true" } }).size).toBe(0);
  });

  it("never applies global focus inside workspace panes", () => {
    const frame = { getAttribute: (name: string) => (name === "data-workspace-pane" ? "true" : null) };
    expect(run(focusBootstrapScript("u"), { frame, stored: { [focusStorageKey("global", "u")]: "true" } }).size).toBe(0);
  });

  it("survives blocked storage", () => {
    expect(run(focusBootstrapScript("u"), { throwing: true }).size).toBe(0);
  });

  it("cannot close its script element", () => {
    expect(focusBootstrapScript("</script><script>alert(1)</script>")).not.toContain("</script>");
  });
});
