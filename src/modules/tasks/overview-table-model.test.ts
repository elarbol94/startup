import { expect, it } from "vitest";
import { cycleSort, parseColumnOrder, reorderColumns, parseColumnWidths, parseTablePreferences, sortFromUrl, sortTableRows } from "./overview-table-model";
const columns = ["title", "owner", "date"];
const rows = [{ id: "1", title: "Task 10", owner: "B", date: null }, { id: "2", title: "Task 2", owner: "A", date: 12 }, { id: "3", title: "Task 1", owner: "A", date: 11 }];
const accessors = { title: (row: typeof rows[number]) => row.title, owner: (row: typeof rows[number]) => row.owner, date: (row: typeof rows[number]) => row.date };
it("makes the newest selected column primary and preserves earlier directions", () => {
  const title = cycleSort([], "title");
  const owner = cycleSort(title, "owner");
  expect(owner).toEqual([{ id: "owner", direction: "asc" }, { id: "title", direction: "asc" }]);
  const desc = cycleSort(owner, "owner");
  expect(desc[0].direction).toBe("desc");
  const promoted = cycleSort(desc, "title");
  expect(promoted).toEqual([{ id: "title", direction: "asc" }, { id: "owner", direction: "desc" }]);
  expect(cycleSort(desc, "owner")).toEqual(title);
  expect(sortTableRows(rows, owner, accessors, "de").map(row => row.id)).toEqual(["3", "2", "1"]);
});
it("preserves column order across unknown, hidden and newly added columns", () => {
  const order = parseColumnOrder('["date","unknown","date","title"]', columns);
  expect(order).toEqual(["date", "title", "owner"]);
  expect(reorderColumns(order, "owner", "date")).toEqual(["owner", "date", "title"]);
  expect(parseColumnOrder("invalid", columns)).toEqual(columns);
  expect(reorderColumns(order, "missing", "date")).toBe(order);
});
it("applies secondary sorting only inside equal primary values with numeric titles", () => {
  expect(sortTableRows(rows, [{ id: "owner", direction: "asc" }, { id: "title", direction: "desc" }], accessors, "de").map(row => row.id)).toEqual(["2", "3", "1"]);
  expect(sortTableRows(rows, [{ id: "owner", direction: "asc" }, { id: "title", direction: "asc" }], accessors, "de").map(row => row.id)).toEqual(["3", "2", "1"]);
  expect(rows.map(row => row.id)).toEqual(["1", "2", "3"]);
});
it("keeps empty values last in both directions", () => {
  expect(sortTableRows(rows, [{ id: "date", direction: "desc" }], accessors, "en").map(row => row.id)).toEqual(["2", "3", "1"]);
  expect(sortTableRows(rows, [{ id: "date", direction: "asc" }], accessors, "en").map(row => row.id)).toEqual(["3", "2", "1"]);
});
it("recovers corrupt column choices, rejects hidden sorts and preserves at least one column", () => {
  expect(parseTablePreferences("broken", columns)).toEqual({ visible: columns, sort: [] });
  expect(parseTablePreferences('{"visible":[],"sort":[]}', columns).visible).toEqual(columns);
  expect(parseTablePreferences('{"visible":["owner","owner","unknown"],"sort":[{"id":"title","direction":"asc"},{"id":"owner","direction":"desc"}]}', columns)).toEqual({ visible: ["owner"], sort: [{ id: "owner", direction: "desc" }] });
});
it("supports existing URLs and rejects malformed multi-sort values", () => {
  expect(sortFromUrl("title-asc", columns)).toEqual([{ id: "title", direction: "asc" }]);
  expect(sortFromUrl("owner:asc,title:desc,owner:desc,unknown:asc,date:broken", columns)).toEqual([{ id: "owner", direction: "asc" }, { id: "title", direction: "desc" }]);
});

it("recovers invalid column widths while preserving independent saved widths", () => {
  expect(parseColumnWidths('{"title":234,"owner":-4,"date":9999,"unknown":100}', columns)).toEqual({ title: 234, owner: 48, date: 1200 });
  expect(parseColumnWidths('{"title":"200","date":null}', columns)).toEqual({});
  expect(parseColumnWidths("broken", columns)).toEqual({});
});
