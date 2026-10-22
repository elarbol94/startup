import { describe, expect, it } from "vitest";
import { PresentationFocusHistory } from "./presentation-focus";

describe("presentation focus stages", () => {
  it("steps back through freely focused forms without requiring path stops", () => {
    const history = new PresentationFocusHistory();
    expect(history.push(null, "a", { index: -1, returns: [] })).toBe(true);
    expect(history.push(null, "b", { index: -1, returns: [] }, ["a"])).toBe(true);
    expect(history.current(null)).toBe("b");
    expect(history.pop(null)).toEqual({ index: -1, returns: [] });
    expect(history.current(null)).toBe("a");
    history.pop(null);
    expect(history.current(null)).toBeNull();
    expect(history.pop(null)).toBeNull();
  });
  it("retains the parent's focus while deeper canvases have independent histories", () => {
    const history = new PresentationFocusHistory();
    const original = { index: 2, returns: [0] };
    history.push(null, "outer", { index: 0, returns: [] });
    history.push("page", "inner", original);
    history.push("nested", "deep", { index: 4, returns: [0, 2] });
    original.returns.push(9);
    expect(history.pop("nested")).toEqual({ index: 4, returns: [0, 2] });
    expect(history.current("page")).toBe("inner");
    expect(history.pop("page")).toEqual({ index: 2, returns: [0] });
    expect(history.current(null)).toBe("outer");
  });
  it("does not add duplicate stages for the second click and resets only the destination canvas", () => {
    const history = new PresentationFocusHistory();
    const position = { index: 0, returns: [] };
    history.push(null, "outer", position);
    expect(history.push(null, "outer", position)).toBe(false);
    history.push("page", "inner", position);
    history.clear("page");
    expect(history.current("page")).toBeNull();
    expect(history.current(null)).toBe("outer");
    history.pop(null);
    expect(history.current(null)).toBeNull();
  });
});

it("returns to the canvas when moving between siblings and to the shared ancestor between branches", () => {
  const history = new PresentationFocusHistory();
  history.push(null, "a", { index: 0, returns: [] });
  history.push(null, "b", { index: 1, returns: [] });
  expect(history.pop(null)).toEqual({ index: 0, returns: [] });
  expect(history.current(null)).toBeNull();
  history.push(null, "parent", { index: 0, returns: [] });
  history.push(null, "child", { index: 1, returns: [] }, ["parent"]);
  history.push(null, "sibling", { index: 2, returns: [] }, ["parent"]);
  expect(history.pop(null)).toEqual({ index: 1, returns: [] });
  expect(history.current(null)).toBe("parent");
});
