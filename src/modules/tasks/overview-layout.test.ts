import { describe, expect, it } from "vitest";
import {
  defaultOverviewLayout,
  placeOverviewCard,
  parseOverviewLayout,
  setOverviewCardHidden,
  visibleCards,
} from "./overview-layout";

describe("parseOverviewLayout", () => {
  it("falls back to the default for missing or broken values", () => {
    expect(parseOverviewLayout(null)).toEqual(defaultOverviewLayout);
    expect(parseOverviewLayout("{not json")).toEqual(defaultOverviewLayout);
    expect(parseOverviewLayout("42")).toEqual(defaultOverviewLayout);
  });

  it("drops unknown and duplicate cards and adds missing ones to their default column", () => {
    const layout = parseOverviewLayout(JSON.stringify({
      columns: { main: ["news", "ghost", "tasks"], side: ["tasks", "kpis"] },
      hidden: ["kpis", "ghost", "kpis"],
    }));
    expect(layout.columns).toEqual({ main: ["news", "tasks", "deadlines"], side: ["kpis", "upNext"] });
    expect(layout.hidden).toEqual(["kpis"]);
  });
});

describe("placeOverviewCard", () => {
  const base = defaultOverviewLayout;

  it("places a card before or after another one in the same column", () => {
    expect(placeOverviewCard(base, "tasks", "deadlines", true)?.columns.main).toEqual(["deadlines", "tasks"]);
    expect(placeOverviewCard(base, "news", "kpis")?.columns.side).toEqual(["news", "kpis", "upNext"]);
    expect(placeOverviewCard(base, "kpis", "upNext", true)?.columns.side).toEqual(["upNext", "kpis", "news"]);
  });

  it("moves a card into the other column before or after the card it is over", () => {
    expect(placeOverviewCard(base, "news", "deadlines")?.columns).toEqual({ main: ["tasks", "news", "deadlines"], side: ["kpis", "upNext"] });
    expect(placeOverviewCard(base, "news", "tasks", true)?.columns.main).toEqual(["tasks", "news", "deadlines"]);
    expect(placeOverviewCard(base, "news", "deadlines", true)?.columns.main).toEqual(["tasks", "deadlines", "news"]);
  });

  it("appends to a column dropped on directly, including an empty one", () => {
    const emptySide = { hidden: [], columns: { main: [...base.columns.main, ...base.columns.side], side: [] } };
    const next = placeOverviewCard(emptySide, "tasks", "side");
    expect(next?.columns).toEqual({ main: ["deadlines", "kpis", "upNext", "news"], side: ["tasks"] });
  });

  it("returns null when the card is already in that place, so repeated drag events are stable", () => {
    expect(placeOverviewCard(base, "tasks", "tasks")).toBeNull();
    expect(placeOverviewCard(base, "deadlines", "main")).toBeNull();
    expect(placeOverviewCard(base, "tasks", "deadlines")).toBeNull();
    expect(placeOverviewCard(base, "deadlines", "tasks", true)).toBeNull();
  });
});

describe("hiding cards", () => {
  it("hides a card and restores it at its old place", () => {
    const hidden = setOverviewCardHidden(defaultOverviewLayout, "upNext", true);
    expect(visibleCards(hidden, "side")).toEqual(["kpis", "news"]);
    const shown = setOverviewCardHidden(hidden, "upNext", false);
    expect(visibleCards(shown, "side")).toEqual(["kpis", "upNext", "news"]);
    expect(shown.hidden).toEqual([]);
  });
});
