export type SortRule = { id: string; direction: "asc" | "desc" };
export type TablePreferences = { visible: string[]; sort: SortRule[] };
export function validSort(value: unknown, columns: string[]): SortRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(rule => {
    if (!rule || !columns.includes(rule.id) || seen.has(rule.id) || !["asc", "desc"].includes(rule.direction)) return [];
    seen.add(rule.id);
    return [{ id: rule.id, direction: rule.direction } as SortRule];
  });
}
export function parseTablePreferences(raw: string | null, columns: string[]): TablePreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    const visible = Array.isArray(value?.visible) ? columns.filter(id => value.visible.includes(id)) : columns;
    const safeVisible = visible.length ? visible : columns;
    return { visible: safeVisible, sort: validSort(value?.sort, safeVisible) };
  } catch { return { visible: columns, sort: [] }; }
}
export function sortFromUrl(value: string, columns: string[]): SortRule[] {
  return validSort(value.split(",").map(part => {
    const [id, direction] = part.replace(/-(asc|desc)$/, ":$1").split(":");
    return { id, direction };
  }), columns);
}
export function cycleSort(rules: SortRule[], id: string): SortRule[] {
  const rule = rules.find(entry => entry.id === id);
  const remaining = rules.filter(entry => entry.id !== id);
  // A previously secondary column becomes primary without losing its direction.
  if (!rule) return [{ id, direction: "asc" }, ...remaining];
  if (rules[0]?.id !== id) return [rule, ...remaining];
  return rule.direction === "asc" ? [{ id, direction: "desc" }, ...remaining] : remaining;
}
export function sortTableRows<T extends { id: string }>(rows: T[], rules: SortRule[], accessors: Record<string, (row: T) => string | number | null>, locale: string): T[] {
  if (!rules.length) return rows;
  const compare = new Intl.Collator(locale, { numeric: true, sensitivity: "base" }).compare;
  return [...rows].sort((a, b) => {
    for (const rule of rules) {
      const accessor = accessors[rule.id];
      if (!accessor) continue;
      const av = accessor(a), bv = accessor(b);
      if (av == null || bv == null) { if (av !== bv) return av == null ? 1 : -1; else continue; }
      const delta = typeof av === "number" && typeof bv === "number" ? av - bv : compare(String(av), String(bv));
      if (delta) return rule.direction === "asc" ? delta : -delta;
    }
    return a.id.localeCompare(b.id);
  });
}

export const clampColumnWidth = (width: number) => Math.max(48, Math.min(1200, Math.round(width)));
export function parseColumnWidths(raw: string | null, columns: string[]): Record<string, number> {
  try {
    const value = JSON.parse(raw ?? "null");
    return Object.fromEntries(columns.flatMap(id => typeof value?.[id] === "number" && Number.isFinite(value[id]) ? [[id, clampColumnWidth(value[id])]] : []));
  } catch { return {}; }
}

export function parseColumnOrder(raw: string | null, columns: string[]): string[] {
  try {
    const saved = JSON.parse(raw ?? "null");
    const known = Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === "string" && columns.includes(id)))] : [];
    return [...known, ...columns.filter(id => !known.includes(id))];
  } catch { return columns; }
}
export function reorderColumns(order: string[], active: string, target: string): string[] {
  if (!order.includes(active) || !order.includes(target) || active === target) return order;
  const next = [...order]; next.splice(order.indexOf(target), 0, next.splice(order.indexOf(active), 1)[0]); return next;
}
