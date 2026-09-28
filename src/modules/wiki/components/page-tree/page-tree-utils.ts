import { parseTagList } from "../../lib/tags";
import type { Row } from "./page-tree-types";

export function parseIdList(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Rows on screen. Without filters, descendants of collapsed pages are hidden;
 * filtering flattens the tree so a matching child without its parent stays reachable.
 */
export function visibleRows(rows: Row[], filters: { query: string; status: string; tag: string; collapsed: ReadonlySet<string>; locale: string }): Row[] {
  const clean = filters.query.trim().toLocaleLowerCase(filters.locale);
  if (!clean && filters.status === "all" && filters.tag === "all") {
    const shown: Row[] = [];
    let hiddenBelow: number | null = null;
    for (const row of rows) {
      if (hiddenBelow !== null && row.depth > hiddenBelow) continue;
      hiddenBelow = filters.collapsed.has(row.id) ? row.depth : null;
      shown.push(row);
    }
    return shown;
  }
  return rows
    .filter((row) => filters.status === "all" || row.status === filters.status)
    .filter((row) => filters.tag === "all" || parseTagList(row.tags).some((item) => item.id === filters.tag))
    .filter((row) => !clean ||
      [row.title, row.contentText, row.updatedByName, parseTagList(row.tags).map((item) => item.name).join(" ")]
        .some((value) => value.toLocaleLowerCase(filters.locale).includes(clean)),
    )
    .map((row) => ({ ...row, depth: 0 }));
}
