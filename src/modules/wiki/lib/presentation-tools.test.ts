import { describe, expect, it } from "vitest";
import { presentationObjectTools } from "./presentation-tools";
import type { PresentationElement } from "./presentation";
const text: PresentationElement = { id: "text", type: "text", x: 0, y: 0, width: 100, height: 50, rotation: 0, content: { text: "Title", fontSize: 24, bold: false, align: "left", color: "#000000" } };
const shape: PresentationElement = { ...text, id: "shape", type: "shape", content: { shape: "rect", fill: "#ffffff", stroke: "#000000", strokeWidth: 1, opacity: 1 } };
describe("contextual presentation tools", () => {
  it("shows no object tools without a selection", () => {
    expect(Object.values(presentationObjectTools([])).every(value => !value)).toBe(true);
  });
  it("offers text content but hides empty shape content and single-object arrangement", () => {
    expect(presentationObjectTools([text])).toMatchObject({ content: true, arrange: false, connect: true });
    expect(presentationObjectTools([shape])).toMatchObject({ content: false, appearance: true });
  });
  it("limits multiple selection to shared structure, arrangement and two-object connections", () => {
    expect(presentationObjectTools([text, shape])).toEqual({ appearance: false, content: false, structure: true, animation: false, connect: true, arrange: true });
    expect(presentationObjectTools([text, shape, { ...text, id: "third" }]).connect).toBe(false);
  });
  it("does not offer connector creation from lines or attached connectors", () => {
    const arrow: PresentationElement = { ...shape, content: { ...shape.content, shape: "arrow", connection: { fromId: "a", toId: "b" } } };
    expect(presentationObjectTools([arrow]).connect).toBe(false);
    expect(presentationObjectTools([text, arrow]).connect).toBe(false);
  });
});
