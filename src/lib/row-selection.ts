/**
 * Pure selection logic for list pages with row checkboxes. Kept free of React so
 * it runs in the node test environment; `use-row-selection.ts` wraps it.
 */
export type RowSelectionState = { ids: ReadonlySet<string>; anchor: string | null };
export type HeaderState = "none" | "some" | "all";

export const emptySelection: RowSelectionState = { ids: new Set(), anchor: null };

/**
 * Toggles one row. With `shift` and a visible anchor, every row between the
 * anchor and `id` (in visible order) takes the clicked row's new state.
 */
export function toggleRow(state: RowSelectionState, id: string, options: { shift?: boolean; visibleIds: readonly string[] }): RowSelectionState {
  const next = new Set(state.ids);
  const select = !next.has(id);
  const from = options.shift && state.anchor ? options.visibleIds.indexOf(state.anchor) : -1;
  const to = options.visibleIds.indexOf(id);
  if (from >= 0 && to >= 0) {
    const [start, end] = from < to ? [from, to] : [to, from];
    for (const rowId of options.visibleIds.slice(start, end + 1)) {
      if (select) next.add(rowId);
      else next.delete(rowId);
    }
  } else if (select) next.add(id);
  else next.delete(id);
  return { ids: next, anchor: id };
}

/** Selects every visible row, or clears them when all are already selected. */
export function toggleAllRows(state: RowSelectionState, visibleIds: readonly string[]): RowSelectionState {
  const next = new Set(state.ids);
  const all = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
  for (const id of visibleIds) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return { ids: next, anchor: state.anchor };
}

/** Selects or deselects a group of rows at once (e.g. one section of a list). */
export function setRows(state: RowSelectionState, ids: readonly string[], selected: boolean): RowSelectionState {
  const next = new Set(state.ids);
  for (const id of ids) {
    if (selected) next.add(id);
    else next.delete(id);
  }
  return { ids: next, anchor: state.anchor };
}

/** Bulk actions only ever apply to rows the user can see: hidden ids are dropped. */
export function pruneRows(state: RowSelectionState, visibleIds: readonly string[]): RowSelectionState {
  const visible = new Set(visibleIds);
  if ([...state.ids].every((id) => visible.has(id)) && (!state.anchor || visible.has(state.anchor))) return state;
  return {
    ids: new Set([...state.ids].filter((id) => visible.has(id))),
    anchor: state.anchor && visible.has(state.anchor) ? state.anchor : null,
  };
}

/** Removes ids after a bulk action succeeded for them; skipped ids stay selected. */
export function deselectRows(state: RowSelectionState, ids: readonly string[]): RowSelectionState {
  const drop = new Set(ids);
  return { ids: new Set([...state.ids].filter((id) => !drop.has(id))), anchor: state.anchor && drop.has(state.anchor) ? null : state.anchor };
}

export function headerState(ids: ReadonlySet<string>, visibleIds: readonly string[]): HeaderState {
  const selected = visibleIds.filter((id) => ids.has(id)).length;
  if (selected === 0) return "none";
  return selected === visibleIds.length ? "all" : "some";
}
