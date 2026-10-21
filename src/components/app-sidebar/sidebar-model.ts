import { moduleNav, moduleNavGroups, type ModuleNavGroup, type ModuleNavItem } from "@/modules/registry";

export const NAVIGATION_ORDER_STORAGE_KEY = "app-navigation-order:v1";

/** Desktop sidebar widths; globals.css mirrors them for the first paint (`--app-rail-width`). */
export const RAIL_WIDTH = { expanded: "15.5rem", collapsed: "4rem" } as const;
/** `<html data-app-rail="collapsed">` narrows the sidebar before React hydrates. */
export const RAIL_ATTRIBUTE = "data-app-rail";

export function railStorageKey(userId: string): string {
  return `app-sidebar-collapsed:v1:${userId}`;
}

/** Applies the stored collapsed state to <html> while the HTML is parsed, so a reload never paints the wide sidebar first. */
export function railBootstrapScript(userId: string): string {
  // JSON is valid JS; escaping "<" keeps any value from closing the script element.
  const key = JSON.stringify(railStorageKey(userId)).replace(/</g, "\\u003c");
  return `(function(){try{if(window.localStorage.getItem(${key})==="true")document.documentElement.setAttribute("${RAIL_ATTRIBUTE}","collapsed")}catch(x){}})()`;
}

/** Saved order first, then any module the saved order does not know yet (new modules). */
export function orderedNavigationItems(order: readonly string[]): ModuleNavItem[] {
  const itemsByKey = new Map(moduleNav.map((item) => [item.key, item]));
  const savedItems = order.flatMap((key) => {
    const item = itemsByKey.get(key as ModuleNavItem["key"]);
    if (!item) return [];
    itemsByKey.delete(item.key);
    return [item];
  });
  return [...savedItems, ...itemsByKey.values()];
}

export function parseNavigationOrder(stored: string | null): string[] {
  const defaultOrder = moduleNav.map((item) => item.key);
  try {
    const parsed: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? orderedNavigationItems(parsed).map((item) => item.key)
      : defaultOrder;
  } catch {
    return defaultOrder;
  }
}

/** Which sidebar groups the user moved and collapsed; saved per user on the server. */
export type SidebarGroupLayout = { order: ModuleNavGroup[]; collapsed: ModuleNavGroup[] };

export const DEFAULT_GROUP_LAYOUT: SidebarGroupLayout = { order: [...moduleNavGroups], collapsed: [] };

/** Keeps only known groups, each once, and appends any group the stored layout does not know yet. */
export function parseGroupLayout(stored: string | null | undefined): SidebarGroupLayout {
  try {
    const parsed: unknown = JSON.parse(stored || "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_GROUP_LAYOUT;
    const { order, collapsed } = parsed as { order?: unknown; collapsed?: unknown };
    const known = (value: unknown): ModuleNavGroup[] => {
      if (!Array.isArray(value)) return [];
      return value.filter((group, index): group is ModuleNavGroup => moduleNavGroups.includes(group) && value.indexOf(group) === index);
    };
    const savedOrder = known(order);
    return {
      order: [...savedOrder, ...moduleNavGroups.filter((group) => !savedOrder.includes(group))],
      collapsed: known(collapsed),
    };
  } catch {
    return DEFAULT_GROUP_LAYOUT;
  }
}

/** Moves `group` one place in the given direction; null at the edges or for an unknown group. */
export function moveGroup(order: readonly ModuleNavGroup[], group: ModuleNavGroup, toIndex: number): ModuleNavGroup[] | null {
  const from = order.indexOf(group);
  if (from < 0 || toIndex < 0 || toIndex >= order.length || from === toIndex) return null;
  const next = [...order];
  next.splice(toIndex, 0, ...next.splice(from, 1));
  return next;
}

/** Sidebar groups in the user's order; inside a group the user's saved module order applies. */
export function groupedNavigationItems(order: readonly string[], groupOrder: readonly ModuleNavGroup[] = moduleNavGroups): { group: ModuleNavGroup; items: ModuleNavItem[] }[] {
  const items = orderedNavigationItems(order);
  return groupOrder.map((group) => ({ group, items: items.filter((item) => item.group === group) }));
}

/** Moves `activeKey` to `overKey`'s place. Items only move inside their own group; otherwise null. */
export function reorderWithinGroup(order: readonly string[], activeKey: string, overKey: string): string[] | null {
  const groupOf = (key: string) => moduleNav.find((item) => item.key === key)?.group;
  const oldIndex = order.indexOf(activeKey);
  const newIndex = order.indexOf(overKey);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;
  if (!groupOf(activeKey) || groupOf(activeKey) !== groupOf(overKey)) return null;
  const next = [...order];
  next.splice(newIndex, 0, ...next.splice(oldIndex, 1));
  return next;
}

/** Up to two initials for the brand mark, e.g. "Management-Plattform" → "MP". */
export function brandInitials(name: string): string {
  const words = name.trim().split(/[\s\-_.]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase() || "·";
}
