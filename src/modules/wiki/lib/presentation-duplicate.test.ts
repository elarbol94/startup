import { describe, expect, it } from "vitest";
import { duplicatePresentationTree, PRESENTATION_DUPLICATE_OFFSET, smartDuplicateOffset, type PresentationElement } from "./presentation";

const text = (id: string, x: number, y: number): PresentationElement =>
  ({ id, type: "text", x, y, width: 100, height: 40, rotation: 0, content: { text: id, fontSize: 24, bold: false, color: "", align: "left" } });
const standard = { x: PRESENTATION_DUPLICATE_OFFSET, y: PRESENTATION_DUPLICATE_OFFSET };

describe("smart duplicate", () => {
  it("uses the standard nudge for a fresh duplicate", () => {
    expect(smartDuplicateOffset([text("a", 0, 0)], ["a"], null)).toEqual(standard);
    expect(smartDuplicateOffset([text("a", 0, 0), text("b", 50, 0)], ["a"], { sources: ["a"], copies: ["b"] })).toEqual(standard);
  });
  it("repeats how far the author moved the last copy", () => {
    const elements = [text("a", 0, 0), text("b", 200, 0)];
    expect(smartDuplicateOffset(elements, ["b"], { sources: ["a"], copies: ["b"] })).toEqual({ x: 200, y: 0 });
    const next = duplicatePresentationTree(elements, new Set(["b"]), new Map([["b", "c"]]), { x: 200, y: 0 });
    expect(next.find((element) => element.id === "c")).toMatchObject({ x: 400, y: 0 });
  });
  it("falls back when the copy was not moved or no longer exists", () => {
    expect(smartDuplicateOffset([text("a", 0, 0), text("b", 0, 0)], ["b"], { sources: ["a"], copies: ["b"] })).toEqual(standard);
    expect(smartDuplicateOffset([text("b", 10, 0)], ["b"], { sources: ["a"], copies: ["b"] })).toEqual(standard);
  });
});
