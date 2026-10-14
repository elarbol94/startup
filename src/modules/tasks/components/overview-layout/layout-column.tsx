"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, type SortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import type { OverviewCardId, OverviewColumnId } from "../../overview-layout";

// Cards are reordered for real while dragging (see useOverviewLayout), so no card is shifted visually.
const keepInPlace: SortingStrategy = () => null;

/** A dashboard column; it is also a drop target itself, so cards can be dragged into it while it is empty. */
export function LayoutColumn({
  id,
  cards,
  editing,
  className,
  children,
}: {
  id: OverviewColumnId;
  cards: OverviewCardId[];
  editing: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("overviewLayout");
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !editing });
  const Column = id === "side" ? "aside" : "div";
  return (
    <SortableContext id={id} items={cards} strategy={keepInPlace}>
      <Column ref={setNodeRef} data-overview-column={id} className={cn("flex min-w-0 flex-col", className)}>
        {children}
        {editing && !cards.length && (
          <p
            className={cn(
              "grid min-h-28 place-items-center rounded-[14px] border border-dashed px-4 text-center text-sm text-muted-foreground",
              isOver && "border-brand bg-brand/5",
            )}
          >
            {t("dropHere")}
          </p>
        )}
      </Column>
    </SortableContext>
  );
}
