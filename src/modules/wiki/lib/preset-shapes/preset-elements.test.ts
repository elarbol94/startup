import { describe, expect, it } from "vitest";
import { presentationElementSchema } from "../presentation";
import { lineEnds } from "../presentation-connectors";
import { POWERPOINT_STYLE, createFreeform, createGalleryElement, drawBox } from "./preset-elements";

const arrow = { id: "rightArrow", width: 77.04, height: 38.16 };
const plain = { click: false, proportional: false, fromCentre: false };

describe("drawing with gallery tools", () => {
  it("inserts the default size at a click, top-left at the click, as PowerPoint does", () => {
    expect(drawBox(arrow, { x: 200, y: 150 }, { x: 200, y: 150 }, { ...plain, click: true })).toEqual({ x: 200, y: 150, width: 77.04, height: 38.16 });
    expect(drawBox({ id: "textBox", width: 72, height: 72, tool: true }, { x: 10, y: 20 }, { x: 10, y: 20 }, { ...plain, click: true })).toEqual({ x: 10, y: 20, width: 240, height: 29.08 });
  });
  it("spans press to release in any direction, keeps proportions with Shift and grows from the centre with Ctrl", () => {
    expect(drawBox(arrow, { x: 450, y: 150 }, { x: 600, y: 230 }, plain)).toEqual({ x: 450, y: 150, width: 150, height: 80 });
    expect(drawBox(arrow, { x: 600, y: 230 }, { x: 450, y: 150 }, plain)).toEqual({ x: 450, y: 150, width: 150, height: 80 });
    const square = drawBox({ id: "rect", width: 72, height: 72 }, { x: 0, y: 0 }, { x: 100, y: 40 }, { ...plain, proportional: true });
    expect([square.width, square.height]).toEqual([100, 100]);
    expect(drawBox({ id: "rect", width: 72, height: 72 }, { x: 100, y: 100 }, { x: 130, y: 120 }, { ...plain, fromCentre: true })).toEqual({ x: 70, y: 80, width: 60, height: 40 });
  });
  it("creates presets in PowerPoint's default style, valid for saving", () => {
    const shape = createGalleryElement(arrow, { x: 0, y: 0, width: 77.04, height: 38.16 }, "s");
    expect(shape).toMatchObject({ type: "shape", content: { preset: "rightArrow", fill: POWERPOINT_STYLE.fill, stroke: POWERPOINT_STYLE.outline, strokeWidth: 1.5, color: "#ffffff", fontSize: 18, font: "aptos" } });
    expect(() => presentationElementSchema.parse(shape)).not.toThrow();
  });
  it("draws lines and connectors from press to release", () => {
    const line = createGalleryElement({ id: "elbowArrowConnector", width: 72, height: 72, tool: true }, { x: 0, y: 0, width: 1, height: 1 }, "l", { from: { x: 0, y: 0 }, to: { x: 100, y: 60 } });
    expect(line).toMatchObject({ content: { shape: "arrow", route: "elbow", stroke: POWERPOINT_STYLE.line } });
    const ends = lineEnds(line as Extract<typeof line, { type: "shape" }>);
    expect(ends[0]).toEqual({ x: 0, y: 0 }); expect(ends[1]).toEqual({ x: 100, y: 60 });
    expect(() => presentationElementSchema.parse(line)).not.toThrow();
  });
  it("turns clicked points into freeforms: open lines, filled closed shapes and smooth curves", () => {
    const points = [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 40 }];
    const open = createFreeform(points, "f", { closed: false, smooth: false })!;
    expect(open).toMatchObject({ x: 10, y: 10, width: 50, height: 30, content: { fill: "", freeform: { d: "M0 0 L50 0 L50 30", closed: false } } });
    const closed = createFreeform(points, "g", { closed: true, smooth: false })!;
    expect(closed).toMatchObject({ content: { fill: POWERPOINT_STYLE.fill, freeform: { closed: true } } });
    expect(createFreeform(points, "h", { closed: false, smooth: true })!.type === "shape" && (createFreeform(points, "h", { closed: false, smooth: true }) as { content: { freeform: { d: string } } }).content.freeform.d).toContain("C");
    expect(createFreeform([{ x: 1, y: 1 }], "x", { closed: false, smooth: false })).toBeNull();
    expect(() => presentationElementSchema.parse(closed)).not.toThrow();
  });
});
