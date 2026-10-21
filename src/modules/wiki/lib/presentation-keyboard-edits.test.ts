import { describe, expect, it } from "vitest";
import type { PresentationElement } from "./presentation";
import { formatTextHosts, keyboardResize, nudge, stepFontSize } from "./presentation-keyboard-edits";

const shape = (id: string, width = 120, height = 80): PresentationElement =>
  ({ id, type: "shape", x: 400, y: 200, width, height, rotation: 0, content: { shape: "rect", fill: "", stroke: "", strokeWidth: 1, opacity: 1, text: "Alpha", fontSize: 18 } });

describe("PowerPoint keyboard edits", () => {
  it("nudges by 0.72 pt", () => {
    expect(nudge([shape("a")], "arrowright")).toEqual([{ id: "a", x: 400.72, y: 200 }]);
    expect(nudge([shape("a")], "arrowup")[0].y).toBeCloseTo(199.28);
  });
  it("resizes by 10 % (1 % fine) around the centre, as observed in PowerPoint", () => {
    expect(keyboardResize([shape("a")], "arrowright", false)).toEqual([{ id: "a", x: 394, width: 132, resizing: true }]);
    expect(keyboardResize([shape("a")], "arrowup", false)).toEqual([{ id: "a", y: 196, height: 88, resizing: true }]);
    const fine = keyboardResize([shape("a", 132)], "arrowright", true)[0];
    expect(fine.width).toBeCloseTo(133.32); expect(fine.x).toBeCloseTo(399.34);
    expect(keyboardResize([shape("a")], "arrowleft", false)[0].width).toBe(108);
  });
  it("steps font sizes along PowerPoint's list", () => {
    expect(stepFontSize(18, true)).toBe(20); expect(stepFontSize(18, false)).toBe(16);
    expect(stepFontSize(96, true)).toBe(108); expect(stepFontSize(8, false)).toBe(8); expect(stepFontSize(17, true)).toBe(18);
  });
  it("formats all text of the selected boxes, toggling from the first", () => {
    const next = formatTextHosts([shape("a"), shape("b"), shape("c")], new Set(["a", "b"]), "bold");
    expect(next.map((element) => (element.content as { bold?: boolean }).bold)).toEqual([true, true, undefined]);
    const bigger = formatTextHosts(next, new Set(["a"]), "fontBigger");
    expect((bigger[0].content as { fontSize: number }).fontSize).toBe(20);
    expect((formatTextHosts(next, new Set(["a"]), "alignLeft")[0].content as { align: string }).align).toBe("left");
  });
});
