import { describe, expect, it } from "vitest";
import { createDoubleShiftDetector, searchEditorCommands, recentEditorCommands, rememberEditorCommand } from "./command-search";

const key = (type: string, name = "Shift", extra = {}) => ({ type, key: name, ...extra });
describe("double Shift", () => {
  it("opens once for two separate short taps", () => {
    const detector = createDoubleShiftDetector();
    expect(detector.handle(key("keydown"), 0)).toBe(false);
    expect(detector.handle(key("keyup"), 50)).toBe(false);
    expect(detector.handle(key("keydown"), 150)).toBe(false);
    expect(detector.handle(key("keyup"), 200)).toBe(true);
    expect(detector.handle(key("keyup"), 250)).toBe(false);
  });
  it.each([key("keydown", "A"), key("keydown", "ArrowLeft"), key("keydown", "Shift", { repeat: true }), key("keydown", "Shift", { ctrlKey: true }), key("keydown", "Shift", { isComposing: true })])("ignores chords, selection, repeats and composition: %o", (interruption) => {
    const detector = createDoubleShiftDetector();
    detector.handle(key("keydown"), 0); detector.handle(interruption, 10); detector.handle(key("keyup"), 20);
    detector.handle(key("keydown"), 50);
    expect(detector.handle(key("keyup"), 80)).toBe(false);
  });
  it("rejects long holds and distant taps, and resets on blur", () => {
    const detector = createDoubleShiftDetector();
    detector.handle(key("keydown"), 0); detector.handle(key("keyup"), 500);
    detector.handle(key("keydown"), 550); expect(detector.handle(key("keyup"), 600)).toBe(false);
    detector.handle(key("keydown"), 1200); expect(detector.handle(key("keyup"), 1250)).toBe(false);
    detector.reset(); detector.handle(key("keydown"), 1300); expect(detector.handle(key("keyup"), 1350)).toBe(false);
  });
});
describe("editor command search", () => {
  const commands = [{ id: "heading1", label: "Überschrift 1", keywords: ["heading", "title"] }, { id: "bold", label: "Fett", keywords: ["bold"] }, { id: "tableAddRow", label: "Tabellenzeile hinzufügen" }];
  it("matches localized names, accents, English aliases and reordered words", () => {
    expect(searchEditorCommands(commands, "ubersch")[0].id).toBe("heading1");
    expect(searchEditorCommands(commands, "heading")[0].id).toBe("heading1");
    expect(searchEditorCommands(commands, "row table")[0].id).toBe("tableAddRow");
    expect(searchEditorCommands(commands, "nonsense")).toEqual([]);
  });
  it("shows everything for an empty query and ranks a name prefix first", () => {
    expect(searchEditorCommands(commands, " ")).toEqual(commands);
    expect(searchEditorCommands([{ id: "a", label: "Not bold", keywords: ["bold"] }, { id: "b", label: "Bold" }], "bold")[0].id).toBe("b");
  });
});

describe("command search improvements", () => {
  it("handles transpositions and missing letters without polluting exact matches", () => {
    const commands = [{ id: "bold", label: "Bold" }, { id: "bolt", label: "Bolt" }, { id: "heading", label: "Heading" }];
    expect(searchEditorCommands(commands, "blod")[0].id).toBe("bold");
    expect(searchEditorCommands(commands, "headng")[0].id).toBe("heading");
    expect(searchEditorCommands(commands, "bold").map((item) => item.id)).toEqual(["bold"]);
    expect(searchEditorCommands(commands, "zz")).toEqual([]);
  });
  it("ranks context before recency, puts unavailable commands last, and respects explicit searches", () => {
    const commands = [{ id: "undo", label: "Undo", recentIndex: 0 }, { id: "image", label: "Image", contextPriority: 3 }, { id: "table", label: "Table", disabledReason: "Select a table", contextPriority: 3 }, { id: "bold", label: "Bold", recentIndex: 1 }];
    expect(searchEditorCommands(commands, "").map((item) => item.id)).toEqual(["image", "undo", "bold", "table"]);
    expect(searchEditorCommands(commands, "table")[0].id).toBe("table");
  });
});

it("keeps a bounded deduplicated history and tolerates unavailable storage", () => {
  expect(recentEditorCommands("invalid")).toEqual([]);
  expect(recentEditorCommands('{"unexpected":true}')).toEqual([]);
  expect(recentEditorCommands('["bold",3,"bold","italic"]')).toEqual(["bold", "italic"]);
  expect(rememberEditorCommand(["bold", "italic"], "italic")).toEqual(["italic", "bold"]);
  expect(rememberEditorCommand(Array.from({ length: 10 }, (_, index) => String(index)), "new")).toHaveLength(8);
});
