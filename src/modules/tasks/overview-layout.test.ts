import { describe, expect, it } from "vitest";
import { cardIds, defaultLayout, moveSection, parseLayout, resizeFromEdge, widgetIds } from "./overview-layout";
describe("personal overview layout", () => {
  it("recovers corrupt or unsupported preferences", () => {
    for (const raw of [null, "bad json", "null", '{"version":3,"items":[]}', '{"version":2,"items":{}}']) expect(parseLayout(raw)).toEqual(defaultLayout);
  });
  it("migrates existing layouts without resetting order, sizes or hidden sections", () => {
    const migrated = parseLayout(JSON.stringify({ version: 1, items: [{ id: "news", width: 5, height: 340, visible: false }, { id: "tasks", width: 7, height: 360, visible: true }, { id: "deadlines", width: 6, height: 400, visible: true }] }));
    expect(migrated.slice(cardIds.length, cardIds.length + 3).map(item => item.id)).toEqual(["news", "tasks", "deadlines"]);
    expect(migrated.find(item => item.id === "news")).toEqual({ id: "news", width: 5, height: 340, visible: false });
    expect(migrated.find(item => item.id === "calendar")?.visible).toBe(false);
    expect(migrated.filter(item => cardIds.includes(item.id as typeof cardIds[number]) && item.visible)).toHaveLength(4);
  });
  it("deduplicates, restores unknown/missing widgets and clamps dimensions", () => {
    const result = parseLayout(JSON.stringify({ version: 2, items: [{ id: "news", width: 500, height: -8, visible: false }, { id: "news" }, { id: "unknown" }, null] }));
    expect(result).toHaveLength(widgetIds.length);
    expect(result[0]).toEqual({ id: "news", width: 12, height: 280, visible: false });
  });
  it("allows mixing cards and sections and preserves intentionally hidden widgets", () => {
    const items = defaultLayout.map(item => ({ ...item, visible: false }));
    const moved = moveSection(items, "news", "openTasks");
    expect(moved[0].id).toBe("news");
    expect(parseLayout(JSON.stringify({ version: 2, items: moved }))).toEqual(moved);
    expect(items[0].id).toBe("openTasks");
  });
  it("resizes every edge continuously in the expected direction without crossing size bounds", () => {
    const item = { id: "tasks" as const, width: 6, height: 400, visible: true };
    expect(resizeFromEdge(item, "e", 200, 300, 100)).toEqual({ width: 8, height: 400 });
    expect(resizeFromEdge(item, "e", 7, 0, 100).width).toBeCloseTo(6.07);
    expect(resizeFromEdge(item, "w", 100, 0, 100)).toEqual({ width: 5, height: 400 });
    expect(resizeFromEdge(item, "n", 0, 100, 100)).toEqual({ width: 6, height: 300 });
    expect(resizeFromEdge(item, "se", 100, 81, 100)).toEqual({ width: 7, height: 481 });
    expect(resizeFromEdge(item, "nw", 9999, 9999, 100)).toEqual({ width: 4, height: 280 });
    expect(resizeFromEdge({ ...item, id: "openTasks" }, "nw", 9999, 9999, 100)).toEqual({ width: 2, height: 120 });
  });
});
