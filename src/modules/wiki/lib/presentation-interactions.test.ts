import { resizePresentationElement } from "./presentation-interactions";
import { describe, expect, it } from "vitest";
import { adaptiveGridGap, isLinearShape, lineEndpoints, moveLineEndpoint, mutableSelection, parsePresentationClipboard, pastePresentationObjects, reorderSelection, selectionRoots, serializeSelection, ungroupSteps } from "./presentation-interactions";
import { presentationElementsSchema, type PresentationElement } from "./presentation";
import { copyPresentationFormat, pastePresentationFormat } from "./presentation-format";
const shape: PresentationElement = { id: "line", type: "shape", x: 10, y: 20, width: 100, height: 20, rotation: 0, content: { shape: "arrow", fill: "", stroke: "", strokeWidth: 2, opacity: 1 } };
const frame: PresentationElement = { id: "frame", type: "frame", x: 0, y: 0, width: 600, height: 400, rotation: 0, content: { label: "", shape: "none", color: "", isGroup: true } };
const text: PresentationElement = { id: "text", type: "text", parentId: "frame", x: 20, y: 20, width: 200, height: 80, rotation: 0, content: { text: "Hello", runs: [{ text: "Hello", bold: true }], fontSize: 32, bold: false, color: "", align: "left" } };
describe("presentation interaction geometry", () => {
  it("keeps grid spacing readable at every supported zoom", () => {
    for (const zoom of [0.02, 0.1, 0.5, 1, 2, 4, 8]) { const gap = adaptiveGridGap(zoom); expect(gap * zoom).toBeGreaterThanOrEqual(12); expect(gap * zoom).toBeLessThanOrEqual(24); expect(Math.abs(Math.log2(gap / 24) % 1)).toBe(0); }
  });
  it("moves one endpoint while retaining the opposite endpoint", () => {
    const next = moveLineEndpoint(shape, 1, { x: 10, y: 230 }, false);
    const [start, end] = lineEndpoints(next);
    expect(start.x).toBeCloseTo(10); expect(start.y).toBeCloseTo(30);
    expect(end.x).toBeCloseTo(10); expect(end.y).toBeCloseTo(230);
  });
  it("supports reversed and constrained endpoints", () => {
    const next = moveLineEndpoint(shape, 0, { x: 150, y: 95 }, true);
    const [, fixed] = lineEndpoints(next); expect(fixed.x).toBeCloseTo(110); expect(fixed.y).toBeCloseTo(30);
    expect(next.rotation % 45).toBeCloseTo(0);
  });
  it("does not detach connected endpoints", () => {
    const connected = { ...shape, content: { ...shape.content, connection: { fromId: "a", toId: "b" } } } as PresentationElement;
    expect(moveLineEndpoint(connected, 0, { x: 200, y: 50 }, false)).toBe(connected);
  });
});
describe("selection and clipboard", () => {
  it("normalizes nested selection and rejects locked roots", () => {
    expect(selectionRoots([frame, text], ["frame", "text"]).map(e => e.id)).toEqual(["frame"]);
    expect(mutableSelection([{ ...frame, locked: true }, text], ["text"])).toBe(false);
  });
  it("copies descendants once and preserves rich text across decks", () => {
    const copied = parsePresentationClipboard(serializeSelection([frame, text], ["frame", "text"]));
    let count = 0; const pasted = pastePresentationObjects(copied, [], { x: 300, y: 200 }, () => `copy-${++count}`);
    expect(pasted.elements).toHaveLength(2); expect(pasted.selectedIds).toEqual(["copy-1"]);
    expect(pasted.elements[1].parentId).toBe("copy-1"); expect(pasted.elements[1].content).toEqual(text.content);
  });
  it("remaps internal connectors and detaches external references", () => {
    const connector = { ...shape, content: { ...shape.content, connection: { fromId: "frame", toId: "text" } } } as PresentationElement;
    let count = 0; const pasted = pastePresentationObjects([frame, text, connector], [], { x: 0, y: 0 }, () => `n${count++}`);
    expect(pasted.elements[2].content).toMatchObject({ connection: { fromId: "n0", toId: "n1" } });
    const alone = pastePresentationObjects([connector], [], { x: 0, y: 0 }, () => "single");
    expect(alone.elements[0].content).not.toHaveProperty("connection", expect.anything());
  });
  it("rejects oversized, malformed, duplicate, and cyclic clipboard payloads", () => {
    expect(() => parsePresentationClipboard("x".repeat(5_000_001))).toThrow();
    expect(() => parsePresentationClipboard('{"kind":"wrong"}')).toThrow();
    expect(() => parsePresentationClipboard(JSON.stringify({ kind: "management-presentation", version: 1, elements: [frame, frame] }))).toThrow();
    expect(() => parsePresentationClipboard(JSON.stringify({ kind: "management-presentation", version: 1, elements: [{ ...frame, parentId: "frame" }] }))).toThrow();
    expect(() => pastePresentationObjects([frame], Array.from({ length: 500 }, (_, i) => ({ ...shape, id: `s${i}` })), { x: 0, y: 0 }, () => "copy")).toThrow();
  });
  it("retains path identities, notes, and timing when ungrouping", () => {
    expect(ungroupSteps([{ id: "stop", elementId: "frame", notes: "Notes", durationMs: 2000 }], [frame, text], new Set(["frame"]), () => "new")).toEqual([{ id: "stop", elementId: "text", notes: "Notes", durationMs: 2000 }]);
    expect(ungroupSteps([{ id: "stop", elementId: "frame", action: "fadeIn" }], [frame, text, { ...shape, parentId: "frame" }], new Set(["frame"]), () => "new").map(s => s.elementId)).toEqual(["text", "line"]);
  });
  it("moves selected layers together without reversing their order", () => {
    const other = { ...shape, id: "other" }; const third = { ...shape, id: "third" };
    expect(reorderSelection([shape, other, third], ["line", "other"], "forward").map(e => e.id)).toEqual(["third", "line", "other"]);
  });
});
it("accepts legacy shapes and copies new styling without replacing geometry", () => {
  expect(presentationElementsSchema.parse([shape])[0]).toEqual(shape);
  const styled = { ...shape, content: { ...shape.content, shape: "doubleArrow", dash: "dash", headSize: 24, startHead: "open", endHead: "triangle" } } as PresentationElement;
  expect(isLinearShape(styled)).toBe(true);
  const pasted = pastePresentationFormat([shape], new Set([shape.id]), copyPresentationFormat(styled))[0];
  expect(pasted).toMatchObject({ x: 10, width: 100, content: { shape: "arrow", headSize: 24, dash: "dash" } });
  expect(presentationElementsSchema.safeParse([styled]).success).toBe(true);
});


describe("local-axis resizing", () => {
  const element = { id: "resize", type: "text" as const, x: 100, y: 100, width: 200, height: 100, rotation: 0, content: { text: "Wrap this text", fontSize: 24, bold: false, align: "left" as const, color: "" } };
  it("moves only the dragged edge and leaves font size intact", () => {
    const next = resizePresentationElement(element, { x: -1, y: 0 }, { x: 50, y: 0 });
    expect(next).toMatchObject({ x: 150, y: 100, width: 150, height: 100, content: { fontSize: 24 } });
  });
  it("keeps the opposite edge fixed when the text box is rotated", () => {
    const next = resizePresentationElement({ ...element, rotation: 90 }, { x: 1, y: 0 }, { x: 0, y: 60 });
    expect(next.x).toBeCloseTo(70); expect(next.y).toBeCloseTo(130);
    expect(next.width).toBeCloseTo(260); expect(next.height).toBe(100);
  });
  it("preserves proportions and resizes about the centre with Alt", () => {
    const next = resizePresentationElement(element, { x: 1, y: 1 }, { x: 40, y: 10 }, true, true);
    expect(next.width / next.height).toBe(2);
    expect(next.x + next.width / 2).toBe(200); expect(next.y + next.height / 2).toBe(150);
  });
  it("clamps at minimum size without flipping across the anchor", () => {
    const next = resizePresentationElement(element, { x: -1, y: -1 }, { x: 1000, y: 1000 });
    expect(next).toMatchObject({ x: 260, y: 160, width: 40, height: 40 });
  });
});
