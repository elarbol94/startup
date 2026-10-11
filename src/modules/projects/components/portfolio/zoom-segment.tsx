// Woche / Monat / Quartal switch of the portfolio Gantt as a design-1b segmented control.
// Toggle buttons (aria-pressed) keep their per-option shortcut tooltips. Used by
// portfolio-toolbar.tsx and focus-rail.tsx.
"use client";

import { useTranslations } from "next-intl";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { PROJECTS_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import type { Zoom } from "./portfolio-types";

const ZOOM_OPTIONS = ["week", "month", "quarter"] as const;

export function ZoomSegment({
  zoom,
  setTimelineZoom,
  className,
}: {
  zoom: Zoom;
  setTimelineZoom: (nextZoom: Zoom) => void;
  className?: string;
}) {
  const t = useTranslations("projects");
  return (
    <div className={cn("inline-flex shrink-0 gap-0.5 rounded-[10px] border bg-muted p-[3px]", className)}>
      {ZOOM_OPTIONS.map((option) => (
        <ShortcutTooltip key={option} label={t(option)} shortcut={PROJECTS_PAGE_SHORTCUTS[option]}>
          <button
            type="button"
            aria-pressed={zoom === option}
            onClick={() => setTimelineZoom(option)}
            className={cn(
              "inline-flex h-[26px] items-center rounded-[7px] px-2.5 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              zoom === option && "bg-card text-foreground shadow-sm dark:bg-secondary dark:shadow-none",
            )}
          >
            {t(option)}
          </button>
        </ShortcutTooltip>
      ))}
    </div>
  );
}
