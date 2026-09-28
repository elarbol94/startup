"use client";

import { useCallback, useMemo, useState } from "react";
import { deselectRows, emptySelection, headerState, pruneRows, setRows, toggleAllRows, toggleRow, type RowSelectionState } from "./row-selection";

export type RowSelection = {
  selectedIds: string[];
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string, options?: { shift?: boolean }) => void;
  toggleAll: () => void;
  deselect: (ids: readonly string[]) => void;
  setMany: (ids: readonly string[], selected: boolean) => void;
  clear: () => void;
  header: ReturnType<typeof headerState>;
  visibleIds: readonly string[];
};

/**
 * Checkbox selection over the rows currently on screen. When the visible rows
 * change (filter, search, collapse, refresh) hidden ids are dropped, so a bulk
 * action never touches rows the user cannot see.
 */
export function useRowSelection(visibleIds: readonly string[]): RowSelection {
  const [state, setState] = useState<RowSelectionState>(emptySelection);
  const key = visibleIds.join("\n");
  const [syncedKey, setSyncedKey] = useState(key);
  let current = state;
  if (key !== syncedKey) {
    current = pruneRows(state, visibleIds);
    setSyncedKey(key);
    if (current !== state) setState(current);
  }
  const toggle = useCallback((id: string, options?: { shift?: boolean }) => {
    setState((previous) => toggleRow(previous, id, { shift: options?.shift, visibleIds }));
  }, [visibleIds]);
  const toggleAll = useCallback(() => setState((previous) => toggleAllRows(previous, visibleIds)), [visibleIds]);
  const deselect = useCallback((ids: readonly string[]) => setState((previous) => deselectRows(previous, ids)), []);
  const setMany = useCallback((ids: readonly string[], selected: boolean) => setState((previous) => setRows(previous, ids, selected)), []);
  const clear = useCallback(() => setState(emptySelection), []);
  const ids = current.ids;
  return useMemo(() => ({
    selectedIds: [...ids],
    count: ids.size,
    isSelected: (id: string) => ids.has(id),
    toggle,
    toggleAll,
    deselect,
    setMany,
    clear,
    header: headerState(ids, visibleIds),
    visibleIds,
  }), [clear, deselect, ids, setMany, toggle, toggleAll, visibleIds]);
}
