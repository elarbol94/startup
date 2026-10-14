"use client";
import { useMemo, useState } from "react";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import {
  columnOfCard,
  defaultOverviewLayout,
  isOverviewCardId,
  isOverviewColumnId,
  parseOverviewLayout,
  placeOverviewCard,
  setOverviewCardHidden,
  type OverviewCardId,
  type OverviewLayout,
} from "../../overview-layout";
import { useOverviewPreference } from "../overview-preferences";

/** Whether the dragged card belongs after the card it is over. */
function landsAfter(event: DragOverEvent, layout: OverviewLayout, active: OverviewCardId, over: OverviewCardId): boolean {
  if (event.activatorEvent instanceof KeyboardEvent) {
    // Arrow keys step card by card: going down within a column passes the card, anything else goes before it.
    const column = layout.columns[columnOfCard(layout, active)];
    return column.includes(over) && column.indexOf(active) < column.indexOf(over);
  }
  const dragged = event.active.rect.current.translated;
  const target = event.over!.rect;
  return !!dragged && dragged.top + dragged.height / 2 > target.top + target.height / 2;
}

/**
 * The saved dashboard layout. While a card is dragged, a draft copy is rearranged live (the card's
 * placeholder moves to where it would land); only a finished drop is saved, Escape discards the draft.
 */
export function useOverviewLayout() {
  const storage = useOverviewPreference("layout");
  const saved = useMemo(() => parseOverviewLayout(storage.raw), [storage.raw]);
  const [draft, setDraft] = useState<OverviewLayout | null>(null);
  const [dragging, setDragging] = useState<OverviewCardId | null>(null);
  const layout = draft ?? saved;

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (isOverviewCardId(active.id)) setDragging(active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!isOverviewCardId(active.id) || !over || !(isOverviewCardId(over.id) || isOverviewColumnId(over.id))) return;
    const activeId = active.id;
    const overId = over.id;
    setDraft((current) => {
      const base = current ?? saved;
      const after = isOverviewCardId(overId) && landsAfter(event, base, activeId, overId);
      return placeOverviewCard(base, activeId, overId, after) ?? current;
    });
  };

  const handleDragEnd = ({ over }: DragEndEvent) => {
    // Dropped outside the dashboard: keep the old layout.
    if (draft && over) storage.save(draft);
    setDraft(null);
    setDragging(null);
  };

  return {
    layout,
    dragging,
    saveFailed: storage.failed,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel: () => {
      setDraft(null);
      setDragging(null);
    },
    setHidden: (id: OverviewCardId, hidden: boolean) => storage.save(setOverviewCardHidden(saved, id, hidden)),
    reset: () => storage.save(defaultOverviewLayout),
  };
}
