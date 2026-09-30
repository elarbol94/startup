"use client";

// Side tray listing unscheduled tasks that can be dragged onto the calendar.
// Used by calendar-client.tsx.
import { type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { Check, Focus, GripVertical } from "lucide-react";
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
    <div className="sticky top-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Focus className="size-4 text-[#6D5EF7]" />
        <h2 className="text-sm font-semibold">{t("unscheduled")}</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t("unscheduledDescription")}
      </p>
      <div className="mt-4 space-y-2">
        {tasks.map((task) => (
          <button
            type="button"
            draggable
            key={task.id}
            onDragStart={(event) => onDragStart(event, task.id)}
            onDragEnd={onDragEnd}
            onClick={() => onSelect(task)}
            className="flex w-full cursor-grab items-center gap-2 rounded-xl border bg-background p-2.5 text-left active:cursor-grabbing"
          >
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{task.title}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                {task.projectName ?? ""}
                <UserIdentities userIds={task.assigneeIds} compact />
              </span>
            </span>
          </button>
        ))}
        {tasks.length === 0 && (
          <div className="rounded-xl border border-dashed p-4 text-center">
            <Check className="mx-auto size-5 text-[#059669]" />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("noUnscheduled")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
