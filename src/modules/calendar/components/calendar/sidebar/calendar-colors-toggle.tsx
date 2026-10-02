"use client";

// Switch for colouring items by their calendar instead of by person/source.
// Used by calendar-sidebar.tsx and calendar-filters-dialog.tsx.
import { cn } from "@/lib/utils";
import type { CalendarT } from "./sidebar-types";

export function CalendarColorsToggle({
  t,
  checked,
  onChange,
}: {
  t: CalendarT;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted/60 focus-within:ring-2 focus-within:ring-ring">
      <span>{t("sidebarColorsByCalendar")}</span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors", checked ? "bg-foreground" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 left-0.5 size-3 rounded-full bg-background shadow-sm transition-transform", checked && "translate-x-3")} />
      </span>
    </label>
  );
}
