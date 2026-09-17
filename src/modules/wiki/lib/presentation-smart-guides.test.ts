import { expect, it } from "vitest";
import { equalSpacing, snapRotation } from "./presentation-smart-guides";
import { growPresentationText, presentationTextFits } from "./presentation-layout";
import { snapBounds, applyGeometryChanges, type PresentationTextElement } from "./presentation";
const box = (x: number, y = 0) => ({ x, y, width: 100, height: 80 });
it("matches existing horizontal gaps and renders both measured gaps", () => {
  const result = equalSpacing(box(305), [box(0), box(150)], 8);
  expect(result.bounds.x).toBe(300);
  expect(result.guides.map(g => g.distance)).toEqual([50, 50]);
});
it("ignores headings inside neighboring frames when matching frame gaps", () => {
  const targets = [box(0), box(150), { x: 10, y: 10, width: 80, height: 20 }, { x: 160, y: 10, width: 80, height: 20 }];
  expect(equalSpacing(box(305), targets, 8).guides.map(guide => guide.distance)).toEqual([50, 50]);
});
it("centers between neighbors and supports equal vertical spacing", () => {
  expect(equalSpacing(box(153), [box(0), box(300)], 8).bounds.x).toBe(150);
  const result = equalSpacing(box(0, 265), [box(0, 0), box(0, 130)], 8);
  expect(result.bounds.y).toBe(260); expect(result.guides.map(g => g.distance)).toEqual([50, 50]);
});
it("ignores enclosing frames, unrelated rows, and disabled snapping", () => {
  const targets = [box(0, 500), box(150, 500), { x: -100, y: -100, width: 1000, height: 1000 }];
  expect(equalSpacing(box(305), targets, 8).guides).toEqual([]);
  expect(equalSpacing(box(305), [box(0), box(150)], 0).bounds.x).toBe(305);
});
it("snaps rotation to cardinal, parallel, perpendicular and Shift increments", () => {
  expect(snapRotation(88, [])).toBe(90); expect(snapRotation(-179, [])).toBe(-180);
  expect(snapRotation(32, [30])).toBe(30); expect(snapRotation(121, [30])).toBe(120);
  expect(snapRotation(38, [], true)).toBe(45); expect(snapRotation(88, [], false, true)).toBe(88);
  expect(snapRotation(47, [])).toBe(47);
});
const text: PresentationTextElement = { id: "t", type: "text", x: 100, y: 100, width: 100, height: 25, rotation: 0, content: { text: "A longer sentence needs room", fontSize: 48, bold: false, color: "", align: "left" } };
it("grows text vertically at the chosen width without reducing font size", () => {
  const grown = growPresentationText(text);
  expect(grown.width).toBe(text.width);
  expect(grown.height).toBeGreaterThan(text.height); expect(presentationTextFits(grown)).toBe(true);
  expect(grown.content.fontSize).toBe(48); expect(growPresentationText(grown)).toEqual(grown);
});
it("preserves a rotated text box's top-left anchor and existing auto-fit behavior", () => {
  const before = { ...text, rotation: -90 }, after = growPresentationText(before);
  const anchor = (e: PresentationTextElement) => { const r = e.rotation * Math.PI / 180; return [e.x + e.width / 2 - Math.cos(r) * e.width / 2 + Math.sin(r) * e.height / 2, e.y + e.height / 2 - Math.sin(r) * e.width / 2 - Math.cos(r) * e.height / 2]; };
  anchor(after).forEach((v, i) => expect(v).toBeCloseTo(anchor(before)[i]));
  const auto = { ...text, content: { ...text.content, autoFit: { minFontSize: 12, maxFontSize: 48 } } };
  expect(growPresentationText(auto)).toBe(auto);
});

it("keeps an exact alignment over a nearby spacing suggestion", () => {
  const next = box(303);
  const result = snapBounds(next, next, [box(0), box(150), box(303, 400)], 6, false);
  expect(result.bounds.x).toBe(303);
  expect(result.guides.some(g => g.kind === "distance" && g.axis === "y")).toBe(false);
});
it("holds an alignment through small pointer jitter, releases outside the wider threshold", () => {
  const previous = [{ axis: "x" as const, position: 300, start: 0, end: 100 }];
  expect(snapBounds(box(300), box(307), [box(300), box(308, 300)], 6, false, previous).bounds.x).toBe(300);
  expect(snapBounds(box(300), box(310), [box(300), box(312, 300)], 6, false, previous).bounds.x).toBe(312);
  expect(snapBounds(box(300), box(300), [box(300)], 0, false, previous).guides).toEqual([]);
});
it("measures the new object's own width for a preceding spacing match", () => {
  const result = equalSpacing({ ...box(-105), width: 50 }, [box(0), box(150)], 6);
  expect(result.bounds.x).toBe(-100);
  expect(result.guides.map(g => g.distance)).toEqual([50, 50]);
});
it("snaps rotated objects by their visible edges without changing dimensions", () => {
  const rotated = { ...text, width: 100, height: 40, rotation: 90 };
  const peer = { ...text, id: "peer", x: 200, y: 300 };
  const result = applyGeometryChanges([rotated, peer], [{ id: "t", x: 133, y: 100 }], 6);
  expect(result.elements[0]).toMatchObject({ x: 130, width: 100, height: 40, rotation: 90 });
});
