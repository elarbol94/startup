"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ModuleNavGroup } from "@/modules/registry";
import { NavGroupLabel } from "./nav-items";

/**
 * One sidebar group. Expanded, its heading has a grip to drag the group and a toggle to collapse it;
 * in the icon rail it is only a divider and always shows its icons.
 */
export function SortableNavGroup({
  group,
  label,
  navigationId,
  compact,
  collapsed,
  onToggle,
  children,
}: {
  group: ModuleNavGroup;
  label: string;
  navigationId: string;
  compact: boolean;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: group });
  const labelId = `${navigationId}-group-${group}`;
  const contentId = `${navigationId}-group-${group}-items`;
  const showItems = compact || !collapsed;

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-labelledby={labelId}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex flex-col gap-0.5", isDragging && "z-10 opacity-45")}
    >
      {compact ? (
        <NavGroupLabel id={labelId} label={label} compact />
      ) : (
        <div className="flex shrink-0 items-center gap-0.5 pt-4 pb-1.5">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={t("moveSection")}
            title={t("moveSection")}
            className="grid size-5 shrink-0 cursor-grab place-items-center rounded text-text-tertiary opacity-60 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
          <button
            type="button"
            id={labelId}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] font-semibold tracking-[0.14em] text-text-tertiary uppercase outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", collapsed && "-rotate-90")} aria-hidden />
          </button>
        </div>
      )}
      {showItems && <div id={contentId} className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}
