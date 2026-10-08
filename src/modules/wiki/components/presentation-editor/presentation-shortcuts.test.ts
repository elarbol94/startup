import { describe, expect, it } from "vitest";
import { formatShortcut, presentationShortcutLabels, shapeToolKey, toolShortcut } from "./presentation-shortcuts";

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

describe("tool keys", () => {
  const press = (eventKey: string, modifiers: Partial<KeyboardEvent> = {}) =>
    ({ key: eventKey, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers }) as unknown as KeyboardEvent;

  it("uses German mnemonics: Text, Viereck, Ellipse, Linie, Rahmen", () => {
    expect(["t", "v", "e", "l", "r"].map((letter) => toolShortcut(press(letter)))).toEqual(["addText", "addRect", "addEllipse", "addLine", "addFrame"]);
    expect(toolShortcut(press("o"))).toBeUndefined();
    expect(toolShortcut(press("f"))).toBeUndefined();
    expect(toolShortcut(press("v", { ctrlKey: true }))).toBeUndefined();
    expect([shapeToolKey("rect"), shapeToolKey("ellipse"), shapeToolKey("line")]).toEqual(["V", "E", "L"]);
  });

  it("shows localised key names", () => {
    const de = presentationShortcutLabels(false, { ctrl: "Strg", delete: "Entf", enter: "Eingabe" });
    expect(de).toMatchObject({ group: "Strg+G", deleteSelection: "Entf", editText: "Eingabe", addRect: "V", addFrame: "R" });
    const mac = presentationShortcutLabels(true, { ctrl: "Ctrl", delete: "Del", enter: "Enter" });
    expect(mac).toMatchObject({ group: "⌘+G", ungroup: "⌘+⇧+G", copyFormat: "⌘+⇧+C / ⌘+⌥+C" });
  });
});
