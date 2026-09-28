import { describe, expect, it } from "vitest";
import { ancestorPath, buildPageTree, descendantIds, topmostSelected } from "./page-tree";

const pages = [
  { id: "a", parentId: null, sortOrder: 0, createdAt: 1 },
  { id: "a1", parentId: "a", sortOrder: 0, createdAt: 2 },
  { id: "a1x", parentId: "a1", sortOrder: 0, createdAt: 3 },
  { id: "b", parentId: null, sortOrder: 1, createdAt: 4 },
  { id: "orphan", parentId: "gone", sortOrder: 2, createdAt: 5 },
];

describe("page tree helpers", () => {
  it("keeps orphans as roots", () => {
    expect(buildPageTree(pages).map((row) => [row.id, row.depth])).toEqual([["a", 0], ["a1", 1], ["a1x", 2], ["b", 0], ["orphan", 0]]);
  });
  it("collects descendants including the roots", () => {
    expect([...descendantIds(pages, ["a1"])].sort()).toEqual(["a1", "a1x"]);
    expect([...descendantIds(pages, ["a", "a1x"])].sort()).toEqual(["a", "a1", "a1x"]);
    expect([...descendantIds(pages, ["orphan"])]).toEqual(["orphan"]);
  });
  it("drops selected pages below another selected page", () => {
    expect(topmostSelected(pages, ["a1x", "a", "b"]).sort()).toEqual(["a", "b"]);
    expect(topmostSelected(pages, ["a1x", "orphan"]).sort()).toEqual(["a1x", "orphan"]);
  });
  it("survives parent cycles", () => {
    const cyclic = [{ id: "x", parentId: "y" }, { id: "y", parentId: "x" }];
    expect(topmostSelected(cyclic, ["x"])).toEqual(["x"]);
    expect(ancestorPath(cyclic, "x").map((page) => page.id)).toEqual(["y"]);
  });
  it("lists ancestors root first", () => {
    expect(ancestorPath(pages, "a1x").map((page) => page.id)).toEqual(["a", "a1"]);
    expect(ancestorPath(pages, "orphan")).toEqual([]);
  });
});
