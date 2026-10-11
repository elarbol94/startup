"use client";

// Side tray listing unscheduled tasks that can be dragged onto the calendar.
// Used by calendar-client.tsx.
import { type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { Check, Focus, GripVertical } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { UserIdentities } from "@/components/user-identity";
import type { CalendarWorkspace } from "../../types";

export function UnscheduledTray({
  tasks,
  t,
  onDragStart,
  onDragEnd,
  onSelect,
}: {
  tasks: CalendarWorkspace["unscheduledTasks"];
  t: ReturnType<typeof useTranslations<"calendar">>;
  onDragStart: (event: DragEvent, id: string) => void;
  onDragEnd: () => void;
  onSelect: (task: CalendarWorkspace["unscheduledTasks"][number]) => void;
}) {
  return (
    <div className="sticky top-4 overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line-soft px-[18px] py-3.5">
        <Focus className="size-4 text-brand-ink" />
        <h2 className="text-[14px] font-semibold">{t("unscheduled")}</h2>
        {tasks.length > 0 && <span className="text-[12.5px] tabular-nums text-muted-foreground">{tasks.length}</span>}
      </div>
      <p className="px-[18px] pt-2.5 pb-1 text-[12.5px] leading-relaxed text-muted-foreground">
        {t("unscheduledDescription")}
      </p>
      <div className="flex flex-col gap-2 px-3.5 pt-2.5 pb-3.5">
        {tasks.map((task) => (
          <button
            type="button"
            draggable
            key={task.id}
            onDragStart={(event) => onDragStart(event, task.id)}
            onDragEnd={onDragEnd}
            onClick={() => onSelect(task)}
            className="flex w-full cursor-grab items-center gap-2 rounded-md border bg-surface-raised px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{task.title}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                {task.projectName ?? ""}
                <UserIdentities userIds={task.assigneeIds} compact />
              </span>
            </span>
          </button>
        ))}
        {tasks.length === 0 && <EmptyState compact icon={<Check />} title={t("noUnscheduled")} />}
      </div>
    </div>
  );
}
