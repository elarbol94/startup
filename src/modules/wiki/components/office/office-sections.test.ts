import { describe, expect, it } from "vitest";
import { resolveSectionTarget, sectionAt, type OutlineHeading } from "./office-sections";

// 0–1 intro, 2 H1 A, 5 H2 A.1, 8 H2 A.2, 12 H1 B, 15 H2 B.1
const headings: OutlineHeading[] = [
  { index: 2, level: 1, title: "A" },
  { index: 5, level: 2, title: "A.1" },
  { index: 8, level: 2, title: "A.2" },
  { index: 12, level: 1, title: "B" },
  { index: 15, level: 2, title: "B.1" },
];

describe("sectionAt", () => {
  it("uses the nearest heading at or above the cursor", () => {
    expect(sectionAt(headings, 9)).toEqual({ headingIndex: 8, level: 2, title: "A.2", previous: 5, next: 15 });
    expect(sectionAt(headings, 2)).toMatchObject({ headingIndex: 2, title: "A", previous: null, next: 12 });
    expect(sectionAt(headings, 3)).toMatchObject({ headingIndex: 2, level: 1 });
  });

  it("falls back to the start of the document above the first heading", () => {
    expect(sectionAt(headings, 0)).toEqual({ headingIndex: null, level: 0, title: null, previous: null, next: 2 });
    expect(sectionAt([], 4)).toEqual({ headingIndex: null, level: 0, title: null, previous: null, next: null });
  });

  it("returns null for an unknown cursor", () => {
    expect(sectionAt(headings, -1)).toBeNull();
    expect(sectionAt(headings, Number.NaN)).toBeNull();
  });
});

describe("resolveSectionTarget", () => {
  it("focuses the heading of the cursor's section", () => {
    expect(resolveSectionTarget(headings, 6, "focus")).toMatchObject({ index: 5, section: { title: "A.1" } });
    expect(resolveSectionTarget(headings, 1, "focus")).toMatchObject({ index: 0, section: { headingIndex: null } });
  });

  it("moves to the previous or next section of the same level", () => {
    expect(resolveSectionTarget(headings, 9, "previous")).toMatchObject({ index: 5, section: { title: "A.1", previous: null, next: 8 } });
    expect(resolveSectionTarget(headings, 9, "next")).toMatchObject({ index: 15, section: { title: "B.1", previous: 8, next: null } });
    expect(resolveSectionTarget(headings, 0, "next")).toMatchObject({ index: 2, section: { title: "A" } });
  });

  it("returns null when there is nowhere to go", () => {
    expect(resolveSectionTarget(headings, 16, "next")).toBeNull();
    expect(resolveSectionTarget(headings, 1, "previous")).toBeNull();
    expect(resolveSectionTarget(headings, -1, "focus")).toBeNull();
  });
});
