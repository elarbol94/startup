/** Dashboard cards the user can hide and reorder inside design 1b's two columns. */
export const overviewCardIds = ["tasks", "deadlines", "kpis", "upNext", "news"] as const;
export type OverviewCardId = (typeof overviewCardIds)[number];

export const overviewColumnIds = ["main", "side"] as const;
export type OverviewColumnId = (typeof overviewColumnIds)[number];

/** Every card sits in exactly one column; a hidden card keeps its place so showing it restores it there. */
export type OverviewLayout = {
  columns: Record<OverviewColumnId, OverviewCardId[]>;
  hidden: OverviewCardId[];
};

export const defaultOverviewLayout: OverviewLayout = {
  columns: { main: ["tasks", "deadlines"], side: ["kpis", "upNext", "news"] },
  hidden: [],
};

const defaultColumnOf = (id: OverviewCardId): OverviewColumnId =>
  defaultOverviewLayout.columns.main.includes(id) ? "main" : "side";

export const isOverviewCardId = (value: unknown): value is OverviewCardId =>
  overviewCardIds.includes(value as OverviewCardId);

export const isOverviewColumnId = (value: unknown): value is OverviewColumnId =>
  overviewColumnIds.includes(value as OverviewColumnId);

/** Reads a stored layout; unknown or duplicate cards are dropped and cards it does not know yet join their default column. */
export function parseOverviewLayout(raw: string | null): OverviewLayout {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "null");
  } catch {
    return defaultOverviewLayout;
  }
  if (!parsed || typeof parsed !== "object") return defaultOverviewLayout;
  const value = parsed as { columns?: Partial<Record<string, unknown>>; hidden?: unknown };
  const seen = new Set<OverviewCardId>();
  const column = (id: OverviewColumnId) => {
    const list = value.columns?.[id];
    if (!Array.isArray(list)) return [];
    return list.filter((card): card is OverviewCardId => {
      if (!isOverviewCardId(card) || seen.has(card)) return false;
      seen.add(card);
      return true;
    });
  };
  const columns = { main: column("main"), side: column("side") };
  for (const id of overviewCardIds) if (!seen.has(id)) columns[defaultColumnOf(id)].push(id);
  const hidden = Array.isArray(value.hidden) ? [...new Set(value.hidden.filter(isOverviewCardId))] : [];
  return { columns, hidden };
}

export function columnOfCard(layout: OverviewLayout, id: OverviewCardId): OverviewColumnId {
  return layout.columns.main.includes(id) ? "main" : "side";
}

export function visibleCards(layout: OverviewLayout, column: OverviewColumnId): OverviewCardId[] {
  return layout.columns[column].filter((id) => !layout.hidden.includes(id));
}

/**
 * Puts `active` directly before (or `after`) the card `over`, in whichever column that is; a column id
 * appends to that column. The placement is explicit rather than an index swap, so cards of very
 * different heights land where the pointer is. Returns null when the layout would not change.
 */
export function placeOverviewCard(
  layout: OverviewLayout,
  active: OverviewCardId,
  over: OverviewCardId | OverviewColumnId,
  after = false,
): OverviewLayout | null {
  if (active === over) return null;
  const from = columnOfCard(layout, active);
  const to = isOverviewColumnId(over) ? over : columnOfCard(layout, over);
  const columns = { ...layout.columns, [from]: layout.columns[from].filter((id) => id !== active) };
  const target = [...columns[to]];
  if (isOverviewColumnId(over)) target.push(active);
  else target.splice(target.indexOf(over) + (after ? 1 : 0), 0, active);
  columns[to] = target;
  const unchanged = overviewColumnIds.every((id) => columns[id].join() === layout.columns[id].join());
  return unchanged ? null : { ...layout, columns };
}

export function setOverviewCardHidden(layout: OverviewLayout, id: OverviewCardId, hidden: boolean): OverviewLayout {
  const rest = layout.hidden.filter((card) => card !== id);
  return { ...layout, hidden: hidden ? [...rest, id] : rest };
}
