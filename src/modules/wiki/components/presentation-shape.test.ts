import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PresentationShape } from "./presentation-shape";
import { presentationShapeKinds, type PresentationElement } from "../lib/presentation";
it("renders every shape through the shared export-safe SVG renderer", () => {
  for (const shape of presentationShapeKinds) {
    const element: Extract<PresentationElement, { type: "shape" }> = { id: shape, type: "shape", x: 0, y: 0, width: 200, height: 100, rotation: 0, content: { shape, fill: "#ffffff", stroke: "#123456", strokeWidth: 3, opacity: 0.5, dash: "dash", headSize: 20 } };
    const html = renderToStaticMarkup(createElement(PresentationShape, { element }));
    expect(html).toContain('<svg'); expect(html).toMatch(/<(rect|ellipse|polygon|line)/);
    expect(html).toContain('stroke="#123456"'); expect(html).toContain('stroke-dasharray="12 9"');
    if (shape === "doubleArrow") expect(html.match(/<polygon/g)).toHaveLength(2);
    if (shape === "roundedRect") expect(html).toContain('rx="20"');
  }
});
