import { describe, expect, it } from "vitest";
import type { PresentationElement } from "../../../lib/presentation";
import { chooseTab, propertiesTabs, selectionKind } from "./properties-tabs";

const base = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
const shape = (id: string, text?: string) => ({ ...base, id, type: "shape", content: { shape: "rect", fill: "#000", stroke: "", strokeWidth: 0, opacity: 1, ...(text ? { text } : {}) } }) as PresentationElement;
const line = { ...base, id: "l", type: "shape", content: { shape: "line", fill: "", stroke: "#000", strokeWidth: 2, opacity: 1 } } as PresentationElement;
const image ={ ...base, id: "i", type: "image", content: { attachmentId: "a", alt: "" } } as PresentationElement;
const frame = { ...base, id: "f", type: "frame", content: { label: "", shape: "rect", color: "" } } as PresentationElement;
const group = { ...base, id: "g", type: "frame", content: { label: "", shape: "rect", color: "", isGroup: true } } as PresentationElement;

describe("propertiesTabs", () => {
  it("gives each kind of object its own tabs first, then size and animation", () => {
    // Closed shapes can hold text, as in PowerPoint; lines cannot.
    expect(propertiesTabs([shape("s", "Hello")])).toEqual(["fill", "effects", "text", "layout", "animation"]);
    expect(propertiesTabs([line])).toEqual(["fill", "effects", "layout", "animation"]);
    expect(propertiesTabs([image])).toEqual(["picture", "layout", "animation"]);
    expect(propertiesTabs([frame])).toEqual(["frame", "layout", "animation"]);
  });

  it("offers Arrange for several objects, and shared formatting when they are all shapes", () => {
    expect(propertiesTabs([shape("a"), shape("b")])).toEqual(["arrange", "fill", "effects"]);
    expect(propertiesTabs([shape("a"), image])).toEqual(["arrange"]);
    expect(propertiesTabs([])).toEqual([]);
  });
});

describe("chooseTab", () => {
  const tabs = propertiesTabs([image]);
  it("prefers the requested tab, then the remembered one, then the object's own", () => {
    expect(chooseTab(tabs, "layout", "animation")).toBe("layout");
    expect(chooseTab(tabs, undefined, "animation")).toBe("animation");
    expect(chooseTab(tabs, "fill", "effects")).toBe("picture");
  });
});

describe("selectionKind", () => {
  it("files remembered tabs by kind of selection", () => {
    expect([selectionKind([frame]), selectionKind([group]), selectionKind([shape("a"), shape("b")]), selectionKind([shape("a"), image]), selectionKind([])])
      .toEqual(["frame", "group", "shapes", "mixed", "none"]);
  });
});
