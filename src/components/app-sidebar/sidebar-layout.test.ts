import { describe, expect, it } from "vitest";
import { moduleNavGroups } from "@/modules/registry";
import { DEFAULT_GROUP_LAYOUT, groupedNavigationItems, moveGroup, parseGroupLayout } from "./sidebar-model";

describe("sidebar group layout", () => {
  it("falls back to the default layout for missing or malformed storage", () => {
    expect(parseGroupLayout(null)).toEqual(DEFAULT_GROUP_LAYOUT);
    expect(parseGroupLayout("")).toEqual(DEFAULT_GROUP_LAYOUT);
    expect(parseGroupLayout("{nope")).toEqual(DEFAULT_GROUP_LAYOUT);
    expect(parseGroupLayout("42")).toEqual(DEFAULT_GROUP_LAYOUT);
  });

  it("keeps known groups once and appends groups the stored order does not know", () => {
    const parsed = parseGroupLayout(JSON.stringify({ order: ["finance", "finance", "bogus", "work"], collapsed: ["wiki", "work", "work"] }));
    expect(parsed.order).toEqual(["finance", "work", "communication", "knowledge"]);
    expect(parsed.collapsed).toEqual(["work"]);
  });

  it("moves a group to a new position and refuses no-op or unknown moves", () => {
    expect(moveGroup(moduleNavGroups, "knowledge", 0)).toEqual(["knowledge", "work", "communication", "finance"]);
    expect(moveGroup(moduleNavGroups, "work", 0)).toBeNull();
    expect(moveGroup(moduleNavGroups, "work", 9)).toBeNull();
    expect(moveGroup(moduleNavGroups, "unknown" as never, 0)).toBeNull();
  });

  it("orders the sidebar groups by the saved group order", () => {
    const groups = groupedNavigationItems([], ["knowledge", "finance", "work", "communication"]);
    expect(groups.map((group) => group.group)).toEqual(["knowledge", "finance", "work", "communication"]);
  });
});
