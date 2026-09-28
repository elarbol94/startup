import { describe, expect, it } from "vitest";
import { deselectRows, setRows, emptySelection, headerState, pruneRows, toggleAllRows, toggleRow } from "./row-selection";

const visibleIds = ["a", "b", "c", "d", "e"];
const ids = (state: { ids: ReadonlySet<string> }) => [...state.ids].sort();

describe("row selection", () => {
  it("toggles single rows on and off", () => {
    const one = toggleRow(emptySelection, "b", { visibleIds });
    expect(ids(one)).toEqual(["b"]);
    expect(ids(toggleRow(one, "b", { visibleIds }))).toEqual([]);
  });
  it("selects a shift range in both directions", () => {
    const anchor = toggleRow(emptySelection, "b", { visibleIds });
    expect(ids(toggleRow(anchor, "d", { visibleIds, shift: true }))).toEqual(["b", "c", "d"]);
    const reverse = toggleRow(emptySelection, "d", { visibleIds });
    expect(ids(toggleRow(reverse, "a", { visibleIds, shift: true }))).toEqual(["a", "b", "c", "d"]);
  });
  it("treats shift without an anchor as a plain toggle", () => {
    expect(ids(toggleRow(emptySelection, "c", { visibleIds, shift: true }))).toEqual(["c"]);
  });
  it("deselects a shift range when the clicked row was selected", () => {
    let state = toggleAllRows(emptySelection, visibleIds);
    state = toggleRow(state, "b", { visibleIds });
    expect(ids(toggleRow(state, "d", { visibleIds, shift: true }))).toEqual(["a", "e"]);
  });
  it("selects all visible rows, then clears them", () => {
    const all = toggleAllRows(toggleRow(emptySelection, "x", { visibleIds: ["x"] }), visibleIds);
    expect(ids(all)).toEqual(["a", "b", "c", "d", "e", "x"]);
    expect(ids(toggleAllRows(all, visibleIds))).toEqual(["x"]);
  });
  it("prunes hidden rows and keeps the same state when nothing changes", () => {
    const state = toggleAllRows(emptySelection, visibleIds);
    expect(pruneRows(state, visibleIds)).toBe(state);
    const pruned = pruneRows(state, ["a", "c"]);
    expect(ids(pruned)).toEqual(["a", "c"]);
  });
  it("deselects succeeded rows only", () => {
    const state = toggleAllRows(emptySelection, visibleIds);
    expect(ids(deselectRows(state, ["a", "b"]))).toEqual(["c", "d", "e"]);
  });
  it("selects and deselects a group", () => {
    const state = setRows(emptySelection, ["a", "b"], true);
    expect(ids(state)).toEqual(["a", "b"]);
    expect(ids(setRows(state, ["b", "c"], false))).toEqual(["a"]);
  });
  it("reports the header state", () => {
    expect(headerState(new Set(), visibleIds)).toBe("none");
    expect(headerState(new Set(["a"]), visibleIds)).toBe("some");
    expect(headerState(new Set(visibleIds), visibleIds)).toBe("all");
    expect(headerState(new Set(), [])).toBe("none");
  });
});
