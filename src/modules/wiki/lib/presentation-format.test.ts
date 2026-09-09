import { describe, expect, it } from "vitest";
import { copyPresentationFormat, pastePresentationFormat } from "./presentation-format";
import { initialPresentationCanvasState, presentationCanvasReducer, presentationElementsSchema, type PresentationElement, type PresentationTextElement } from "./presentation";
const source: PresentationTextElement = { id: "source", type: "text", x: 0, y: 0, width: 300, height: 150, rotation: 0, background: "#ffffff", content: { text: "Source heading", fontSize: 48, bold: true, color: "#123456", align: "center", padding: 8 } };
const target: PresentationTextElement = { ...source, id: "target", x: 450, width: 500, content: { text: "Keep this content", fontSize: 24, bold: false, color: "#000000", align: "left", italic: true, runs: [{ text: "Keep this content", href: "https://example.com", color: "#ff0000", italic: true }] } };
describe("copy and paste presentation formatting", () => {
  it("copies only formatting and clears target overrides without losing links or geometry", () => {
    const format = copyPresentationFormat(source);
    expect(format.content).not.toHaveProperty("text");
    const result = pastePresentationFormat([target], new Set([target.id]), format)[0];
    expect(result).toMatchObject({ id: target.id, x: target.x, width: target.width, content: { text: target.content.text, fontSize: 48, bold: true, align: "center", color: "#123456", padding: 8, runs: [{ text: target.content.text, href: "https://example.com" }] } });
    expect(result.type === "text" && result.content.italic).toBeUndefined();
    expect(() => presentationElementsSchema.parse([result])).not.toThrow();
    expect(target.content.fontSize).toBe(24);
  });
  it("keeps a snapshot of the source and skips locked/incompatible objects", () => {
    const original = structuredClone(source);
    const format = copyPresentationFormat(original);
    original.content.fontSize = 80;
    const locked = { ...target, locked: true };
    const shape: PresentationElement = { id: "shape", type: "shape", x: 0, y: 0, width: 100, height: 100, rotation: 0, content: { shape: "rect", fill: "", stroke: "", strokeWidth: 1, opacity: 1 } };
    const unchanged = [locked, shape];
    expect(pastePresentationFormat(unchanged, new Set([locked.id, shape.id]), format)).toBe(unchanged);
    expect(pastePresentationFormat([target], new Set([target.id]), format)[0]).toMatchObject({ content: { fontSize: 48 } });
  });
  it("pastes into several objects as one undoable action", () => {
    const second = { ...target, id: "second" };
    const state = initialPresentationCanvasState([target, second], []);
    const pasted = presentationCanvasReducer(state, { type: "edit", at: 1, separate: true, elements: current => pastePresentationFormat(current, new Set([target.id, second.id]), copyPresentationFormat(source)) });
    expect(pasted.past).toHaveLength(1);
    expect(presentationCanvasReducer(pasted, { type: "undo" }).elements).toEqual(state.elements);
  });
  it("preserves connector endpoints and shape identity", () => {
    const line: PresentationElement = { id: "line", type: "shape", x: 20, y: 30, width: 100, height: 20, rotation: 0, content: { shape: "arrow", fill: "", stroke: "#000000", strokeWidth: 1, opacity: 1, connection: { fromId: "a", toId: "b" } } };
    const style: PresentationElement = { ...line, id: "style", content: { ...line.content, shape: "ellipse", stroke: "#123456", strokeWidth: 5 } };
    expect(pastePresentationFormat([line], new Set([line.id]), copyPresentationFormat(style))[0]).toMatchObject({ content: { shape: "arrow", stroke: "#123456", strokeWidth: 5, connection: line.content.connection } });
  });
});
