"use client";

import { MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { TaskOrigin } from "../types";

export function WorkItemOriginCard({
  origin,
  typeLabel,
  tone,
  link,
}: {
  origin: TaskOrigin;
  typeLabel: string;
  tone: "task" | "deadline";
  /** Makes the link optional: an unchecked card is dimmed and not saved. */
  link?: { checked: boolean; label: string; onChange: (checked: boolean) => void };
}) {
  const content = (
    <>
      <span className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg",
        tone === "task"
          ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"
          : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
      )}>
        <MapPin className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{typeLabel}</p>
        <p className="truncate text-sm">{origin.label || origin.route}</p>
      </div>
    </>
  );
  if (!link) {
    return <div className="flex items-center gap-3 rounded-xl border bg-muted/35 px-3.5 py-3">{content}</div>;
  }
  return (
    <label className={cn(
      "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
      link.checked ? "bg-muted/35" : "border-dashed text-muted-foreground [&>span:first-of-type]:opacity-50",
    )}>
      {content}
      <span className="ml-auto flex shrink-0 items-center gap-2 text-xs font-medium">
        {link.label}
        <Checkbox checked={link.checked} onCheckedChange={(checked) => link.onChange(checked === true)} />
      </span>
    </label>
  );
}

export function WorkItemFieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p role="alert" className="text-xs font-medium text-destructive">{children}</p>;
}

export function WorkItemSaveError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
      {children}
    </div>
  );
}
