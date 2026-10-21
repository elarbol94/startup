import { describe, expect, it } from "vitest";
import { isNavItemActive, moduleNav, moduleNavItemForPath } from "@/modules/registry";
import {
  brandInitials,
  groupedNavigationItems,
  parseNavigationOrder,
  railBootstrapScript,
  reorderWithinGroup,
} from "./sidebar-model";

const keysOf = (groups: ReturnType<typeof groupedNavigationItems>) =>
  groups.map(({ group, items }) => [group, items.map((item) => item.key)]);

describe("sidebar navigation model", () => {
  it("groups modules into work, communication, finance and knowledge in registry order", () => {
    expect(keysOf(groupedNavigationItems(parseNavigationOrder(null)))).toEqual([
      ["work", ["dashboard", "calendar", "projects", "time"]],
      ["communication", ["meetings", "chat", "mail", "cloud"]],
      ["finance", ["accounting", "personnel"]],
      ["knowledge", ["wiki", "municipalities", "network"]],
    ]);
  });

  it("keeps a saved order inside each group and appends unknown modules", () => {
    const order = parseNavigationOrder(JSON.stringify(["wiki", "calendar", "personnel", "removed-module"]));
    expect(order).toHaveLength(moduleNav.length);
    expect(keysOf(groupedNavigationItems(order))).toEqual([
      ["work", ["calendar", "dashboard", "projects", "time"]],
      ["communication", ["meetings", "chat", "mail", "cloud"]],
      ["finance", ["personnel", "accounting"]],
      ["knowledge", ["wiki", "municipalities", "network"]],
    ]);
  });

  it("falls back to the registry order for malformed storage", () => {
    expect(parseNavigationOrder("{nope")).toEqual(moduleNav.map((item) => item.key));
    expect(parseNavigationOrder(JSON.stringify({ wiki: 1 }))).toEqual(moduleNav.map((item) => item.key));
  });

  it("reorders only within a group", () => {
    const order = parseNavigationOrder(null);
    const moved = reorderWithinGroup(order, "projects", "calendar");
    expect(moved && keysOf(groupedNavigationItems(moved))[0]).toEqual(["work", ["dashboard", "projects", "calendar", "time"]]);
    expect(reorderWithinGroup(order, "wiki", "calendar")).toBeNull();
    expect(reorderWithinGroup(order, "wiki", "wiki")).toBeNull();
    expect(reorderWithinGroup(order, "unknown", "wiki")).toBeNull();
  });

  it("marks the current section active, including aliases", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/wiki")).toBe(false);
    expect(isNavItemActive("/wiki", "/wiki/pages/1")).toBe(true);
    expect(isNavItemActive("/municipalities/overview", "/municipalities/filter")).toBe(true);
    expect(isNavItemActive("/accounting", "/documents")).toBe(true);
    expect(moduleNavItemForPath("/wiki/pages/1")?.key).toBe("wiki");
    expect(moduleNavItemForPath("/settings")).toBeUndefined();
  });

  it("derives brand initials", () => {
    expect(brandInitials("Management-Plattform")).toBe("MP");
    expect(brandInitials("elarbol")).toBe("E");
    expect(brandInitials("  ")).toBe("·");
  });

  it("escapes the user id in the bootstrap script", () => {
    expect(railBootstrapScript("</script><x>")).not.toContain("</script>");
  });
});
