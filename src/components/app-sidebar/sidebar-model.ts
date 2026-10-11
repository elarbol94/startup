import { moduleNav, moduleNavGroups, navSectionAliases, type ModuleNavGroup, type ModuleNavItem } from "@/modules/registry";

export const NAVIGATION_ORDER_STORAGE_KEY = "app-navigation-order:v1";

/** Width of the desktop sidebar; `--app-rail-width` follows it so the page makes room. */
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

/** Sidebar groups in their fixed order; inside a group the user's saved order applies. */
export function groupedNavigationItems(order: readonly string[]): { group: ModuleNavGroup; items: ModuleNavItem[] }[] {
  const items = orderedNavigationItems(order);
  return moduleNavGroups.map((group) => ({ group, items: items.filter((item) => item.group === group) }));
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

/** Whether a sidebar entry belongs to the current page (`navSectionAliases` included). */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  const section = `/${href.split("/")[1]}`;
  const currentSection = `/${pathname.split("/")[1]}`;
  return (navSectionAliases[currentSection] ?? currentSection) === section;
}

/** Up to two initials for the brand mark, e.g. "Management-Plattform" → "MP". */
export function brandInitials(name: string): string {
  const words = name.trim().split(/[\s\-_.]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase() || "·";
}
