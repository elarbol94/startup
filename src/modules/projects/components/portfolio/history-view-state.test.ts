import { describe, expect, it } from "vitest";
import {
  historyViewId,
  readHistoryView,
  withHistoryViewId,
  writeHistoryView,
  type HistoryPortfolioView,
} from "./history-view-state";
import { MAX_DAY_WIDTH } from "./portfolio-constants";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

const view: HistoryPortfolioView = {
  view: "timeline",
  query: "road",
  owner: "user-1",
  health: "risk",
  criticalVisible: true,
  linesVisible: false,
  dayWidth: 12,
  treeWidth: 320,
  scrollLeft: 840,
  scrollTop: 260,
  expandedProjects: ["p1", "p2"],
  expandedTasks: ["t1"],
};

describe("portfolio history view", () => {
  it("round-trips the view per history entry id", () => {
    const storage = memoryStorage();
    writeHistoryView(storage, "a", view);
    writeHistoryView(storage, "b", { ...view, scrollLeft: 0 });
    expect(readHistoryView(storage, "a")).toEqual(view);
    expect(readHistoryView(storage, "b")?.scrollLeft).toBe(0);
    expect(readHistoryView(storage, "missing")).toBeNull();
  });

  it("keeps Next.js history fields when tagging the entry", () => {
    const state = withHistoryViewId({ __NA: true, tree: 1 }, "id-1");
    expect(state).toEqual({ __NA: true, tree: 1, portfolioViewId: "id-1" });
    expect(historyViewId(state)).toBe("id-1");
    expect(historyViewId(null)).toBeNull();
  });

  it("sanitises malformed snapshots", () => {
    const storage = memoryStorage();
    storage.setItem(
      "projects.historyView.x",
      JSON.stringify({ dayWidth: 1e9, health: "bad", expandedTasks: [1, "t"] }),
    );
    const restored = readHistoryView(storage, "x");
    expect(restored?.dayWidth).toBe(MAX_DAY_WIDTH);
    expect(restored?.health).toBe("all");
    expect(restored?.expandedTasks).toEqual(["t"]);
    storage.setItem("projects.historyView.y", "{not json");
    expect(readHistoryView(storage, "y")).toBeNull();
  });
});
