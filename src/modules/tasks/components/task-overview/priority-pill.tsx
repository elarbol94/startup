import { cn } from "@/lib/utils";
import type { TaskPriority } from "../../types";

/** Priority as a small pill (design 1b): Hoch stands out, Mittel is neutral, Niedrig is outlined. */
export function PriorityPill({ priority, label, className }: { priority: TaskPriority; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap",
        priority === "high" && "bg-destructive/15 text-destructive",
        priority === "medium" && "bg-muted text-text-secondary",
        priority === "low" && "border border-line-strong font-medium text-text-secondary",
        className,
      )}
    >
      {label}
    </span>
  );
}
