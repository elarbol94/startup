"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { EyeOff, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OverviewCardId } from "../../overview-layout";

/** One dashboard card; in edit mode it gets a drag handle and a hide button above the card itself. */
export function LayoutCard({
  id,
  editing,
  onHide,
  children,
}: {
  id: OverviewCardId;
  editing: boolean;
  onHide: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("overviewLayout");
  // No transform: the draft layout moves the card itself, and DragOverlay follows the pointer.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({ id, disabled: !editing });
  const label = t(id);

  if (!editing) return <div data-overview-card={id}>{children}</div>;
  return (
    <div
      ref={setNodeRef}
      data-overview-card={id}
      className={cn(
        "rounded-[14px] border border-dashed border-line-strong bg-muted/30 p-1.5",
        isDragging && "border-brand bg-brand/5 opacity-50",
      )}
    >
      <div className="flex items-center gap-1 pb-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={t("move", { section: label })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
        <Button variant="ghost" size="icon-sm" onClick={onHide} aria-label={t("hide", { section: label })}>
          <EyeOff />
        </Button>
      </div>
      {/* The card stays visible but inert while arranging, so a drag never opens a task or link. */}
      <div inert className="pointer-events-none select-none">{children}</div>
    </div>
  );
}
