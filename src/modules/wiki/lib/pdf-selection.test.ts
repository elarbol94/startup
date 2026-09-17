import { describe, expect, it } from "vitest";
import { activePdfOutlineIndex, rotatePdfRect, visiblePdfOutlineIndices, type PdfOutlineItem } from "./pdf-selection";
import { parseSourcePassage } from "./source-passage";
import { fromDoc, toDoc } from "../collaboration/rich-text";

const outline: PdfOutlineItem[] = [
  { title: "Intro", pageNumber: 2, depth: 0, y: 0.1 },
  { title: "First", pageNumber: 4, depth: 0, y: 0.05 },
  { title: "Child", pageNumber: 4, depth: 1, y: 0.4 },
  { title: "Grandchild", pageNumber: 5, depth: 2, y: 0.1 },
  { title: "Second", pageNumber: 7, depth: 0, y: 0.2 },
  { title: "Broken destination", depth: 0 },
];

describe("PDF outline reading position", () => {
  it("tracks sections within the same page and across pages without headings", () => {
    expect(activePdfOutlineIndex(outline, 1, 0.5)).toBe(-1);
    expect(activePdfOutlineIndex(outline, 4, 0.2)).toBe(1);
    expect(activePdfOutlineIndex(outline, 4, 0.6)).toBe(2);
    expect(activePdfOutlineIndex(outline, 6, 0.8)).toBe(3);
    expect(activePdfOutlineIndex(outline, 8, 0.1)).toBe(4);
  });
  it("collapses descendants without hiding following sibling sections", () => {
    expect(visiblePdfOutlineIndices(outline, new Set([1]))).toEqual([0, 1, 4, 5]);
    expect(visiblePdfOutlineIndices(outline, new Set([2]))).toEqual([0, 1, 2, 4, 5]);
    expect(visiblePdfOutlineIndices(outline, new Set())).toHaveLength(6);
  });
});

it("round trips selection geometry at every quarter turn", () => {
  const rect = { x: 0.15, y: 0.3, width: 0.4, height: 0.02 };
  for (const angle of [0, 90, 180, 270]) {
    const restored = rotatePdfRect(rotatePdfRect(rect, angle), -angle);
    for (const key of ["x", "y", "width", "height"] as const) expect(restored[key]).toBeCloseTo(rect[key]);
  }
  expect(rotatePdfRect({ x: 0, y: 0, width: 1, height: 1 }, 90)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
});

const href = "/wiki/sources/source123/read/document123?page=4&annotation=annotation123";
it("accepts only source passage references from local storage", () => {
  expect(parseSourcePassage(JSON.stringify({ href, title: "Report", quote: "Evidence" }))).toEqual({ href, title: "Report", quote: "Evidence" });
  for (const bad of ["javascript:alert(1)", "//other.example/", "/wiki/pages/test", href + "&redirect=https://other.example", href.replace("page=4", "page=0")]) {
    expect(parseSourcePassage(JSON.stringify({ href: bad, title: "Report", quote: "Evidence" }))).toBeNull();
  }
  expect(parseSourcePassage("{broken")).toBeNull();
});

it("retains passage links and selected wording through presentation rich text conversion", () => {
  const content = { text: "Our claim", fontSize: 24, bold: false, color: "", align: "left" as const, runs: [{ text: "Our " }, { text: "claim", href }] };
  const saved = fromDoc(toDoc(content));
  expect(saved.text).toBe("Our claim");
  expect(saved.runs?.[1].href).toBe(href);
});
