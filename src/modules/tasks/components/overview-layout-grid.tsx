"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isOverviewCardId, visibleCards, type OverviewCardId, type OverviewColumnId } from "../overview-layout";
import { LayoutCard } from "./overview-layout/layout-card";
import { LayoutColumn } from "./overview-layout/layout-column";
import { LayoutToolbar } from "./overview-layout/layout-toolbar";
import { useOverviewLayout } from "./overview-layout/use-overview-layout";
import { useOverviewEditing } from "./overview-preferences";

// Under the pointer, a card beats the column it sits in; the keyboard and gaps fall back to the nearest corner.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const cards = hits.filter((hit) => isOverviewCardId(hit.id));
  return cards.length ? cards : hits.length ? hits : closestCorners(args);
};

/**
 * Design 1b's two columns with user-chosen card order and visibility ("Layout anpassen").
 * The cards are rendered on the server and passed in; this only decides where each one goes.
 */
export function OverviewLayoutGrid({ cards }: { cards: Record<OverviewCardId, ReactNode> }) {
  const t = useTranslations("overviewLayout");
  const { editing, setEditing } = useOverviewEditing();
  const { layout, dragging, saveFailed, handleDragStart, handleDragOver, handleDragEnd, handleDragCancel, setHidden, reset } =
    useOverviewLayout();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const main = visibleCards(layout, "main");
  const side = visibleCards(layout, "side");
  const label = (id: string | number) => (isOverviewCardId(id) ? t(id) : "");

  if (!editing && !main.length && !side.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="mb-3 text-muted-foreground">{t("empty")}</p>
        <Button variant="outline" onClick={() => setEditing(true)}>{t("addSections")}</Button>
      </div>
    );
  }

  const column = (id: OverviewColumnId, ids: OverviewCardId[], className: string) => (
    <LayoutColumn id={id} cards={ids} editing={editing} className={className}>
      {ids.map((card) => (
        <LayoutCard key={card} id={card} editing={editing} onHide={() => setHidden(card, true)}>
          {cards[card]}
        </LayoutCard>
      ))}
    </LayoutColumn>
  );
  // Outside edit mode an emptied column disappears and the other one takes the full width.
  const twoColumns = editing || (main.length > 0 && side.length > 0);

  return (
    <>
      {editing && (
        <LayoutToolbar hidden={layout.hidden} saveFailed={saveFailed} onShow={(id) => setHidden(id, false)} onReset={reset} />
      )}
      <DndContext
        id="overview-layout"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          screenReaderInstructions: { draggable: t("dragInstructions") },
          announcements: {
            onDragStart: ({ active }) => t("dragStart", { section: label(active.id) }),
            onDragOver: ({ over }) => (over && isOverviewCardId(over.id) ? t("dragOver", { section: label(over.id) }) : undefined),
            onDragEnd: () => t("dragEnd"),
            onDragCancel: () => t("dragCancel"),
          },
        }}
      >
        <div className={cn("grid items-start gap-5", twoColumns && "@min-[1000px]/overview:grid-cols-[minmax(0,1fr)_320px]")}>
          {(twoColumns || main.length > 0) && column("main", main, "gap-5")}
          {(twoColumns || side.length > 0) && column("side", side, "gap-4")}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="inline-flex cursor-grabbing items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-lg">
              <GripVertical className="size-3.5 text-muted-foreground" aria-hidden />
              {t(dragging)}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  );
}
