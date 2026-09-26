import { describe, expect, it } from "vitest";
import { formatShortcut } from "./presentation-shortcuts";

const key = (code: string, modifiers: Partial<KeyboardEvent> = {}, altGraph = false) =>
  ({ code, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, getModifierState: (name: string) => altGraph && name === "AltGraph", ...modifiers }) as unknown as KeyboardEvent;

describe("formatShortcut", () => {
  it("copies and pastes the format with Ctrl+Shift+C and Ctrl+Shift+V, as in PowerPoint", () => {
    expect(formatShortcut(key("KeyC", { shiftKey: true }))).toBe("copyFormat");
    expect(formatShortcut(key("KeyV", { shiftKey: true }))).toBe("pasteFormat");
  });
  it("keeps Ctrl+Alt+C and Ctrl+Alt+V", () => {
    expect(formatShortcut(key("KeyC", { altKey: true }))).toBe("copyFormat");
    expect(formatShortcut(key("KeyV", { altKey: true }))).toBe("pasteFormat");
  });
  it("leaves AltGr characters and plain Ctrl+V alone", () => {
    expect(formatShortcut(key("KeyC", { altKey: true }, true))).toBeUndefined();
    expect(formatShortcut(key("KeyV"))).toBeUndefined();
  });
});
