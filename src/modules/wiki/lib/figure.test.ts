import { describe, expect, it } from "vitest";
import { documentFigures, figureCrop, relativeFigurePath, stripFigureNumber } from "./figure";

describe("figure semantics", () => {
  it("normalizes only recognized prefixes, including sidecar placeholders", () => {
    expect(stripFigureNumber(" Abbildung X: Haushaltseinkommen")).toBe("Haushaltseinkommen");
    expect(stripFigureNumber("Fig. 19 — Revenue")).toBe("Revenue");
    expect(stripFigureNumber("2026: Forecast")).toBe("2026: Forecast");
    expect(stripFigureNumber("In Abbildung 3 steht …")).toBe("In Abbildung 3 steht …");
  });
  it("numbers independently of index inclusion and includes native diagrams", () => {
    expect(documentFigures({ type: "doc", content: [
      { type: "commentableImage", attrs: { nodeId: "decoration", numbered: false } },
      { type: "commentableImage", attrs: { nodeId: "one", numbered: true, includeInFigureIndex: false, caption: "Abbildung 8: First" } },
      { type: "mermaidDiagram", attrs: { nodeId: "two", caption: "Flow" } },
    ] }).map(({ nodeId, number, included, caption }) => ({ nodeId, number, included, caption }))).toEqual([
      { nodeId: "one", number: 1, included: false, caption: "First" }, { nodeId: "two", number: 2, included: true, caption: "Flow" },
    ]);
  });
  it("confines full and relative laptop paths to their declared folder", () => {
    expect(relativeFigurePath("C:\\Research\\plots\\result.svg", "c:\\research")).toBe("plots/result.svg");
    for (const input of ["../secret.svg", "/etc/private.svg", "C:\\Other\\plot.svg", "plots//a.svg", "a/../../b.svg", "a.svg\u0000"]) expect(() => relativeFigurePath(input, "C:\\Research")).toThrow("invalidPath");
  });
  it("keeps crop rectangles nonempty and within the original artwork", () => {
    expect(figureCrop({ x: .8, width: .9, y: -.3, height: 0 })).toEqual({ x: .8, width: expect.closeTo(.2), y: 0, height: .05 });
  });
});
