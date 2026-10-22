import { expect, it, vi } from "vitest";
import type { PresentationElement } from "../lib/presentation";
import { elementsToNodes } from "./presentation-canvas";

vi.mock("server-only", () => ({}));

const frame = { id: "frame", x: 0, y: 0, width: 960, height: 540, rotation: 0, type: "frame", content: { label: "Slide", shape: "rect", color: "" } } as PresentationElement;
const text = { id: "text", x: 60, y: 60, width: 400, height: 80, rotation: 0, parentId: "frame", type: "text", content: { text: "Title", fontSize: 40, bold: true, color: "#000", align: "left" } } as PresentationElement;

it("hands React Flow the previous node object for every element whose node did not change", () => {
  const first = elementsToNodes([frame, text], { editable: true, selectedIds: new Set() });
  const moved = { ...text, x: 80 };
  const second = elementsToNodes([frame, moved], { editable: true, selectedIds: new Set() });
  expect(second[0]).toBe(first[0]);
  expect(second[1]).not.toBe(first[1]);
  expect(second[1].position).toEqual({ x: 80, y: 60 });
  // Selecting the frame changes its node, so it is rebuilt.
  expect(elementsToNodes([frame, moved], { editable: true, selectedIds: new Set(["frame"]) })[0]).not.toBe(second[0]);
});
