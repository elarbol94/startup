"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { cn } from "@/lib/utils";
import { ItemDetails } from "../item-details";
import type { OverviewTask } from "../task-overview";
import { PriorityPill } from "./priority-pill";

function localDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * One task row (design 1b). The row is a container-query grid: below 760 px of list width
 * project and people drop out, below 420 px the due date too and the title wraps.
 */
export function TaskRow({
  task,
  done,
  overdue,
  now,
  disabled,
  onToggle,
  onEdit,
}: {
  task: OverviewTask;
  done: boolean;
  overdue: boolean;
  now: Date;
  disabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const origin = task.contextLabel || task.projectName || task.columnName || t("origins.app");
  const due = task.dueDate ? localDate(task.dueDate) : null;

  return (
    <li
      data-task-row={task.id}
      className="grid grid-cols-[18px_minmax(160px,1fr)_150px_140px_120px_64px] items-center gap-3 px-[18px] py-[11px] text-[13.5px] transition-colors hover:bg-accent @max-[760px]:grid-cols-[18px_minmax(0,1fr)_auto_64px] @max-[420px]:grid-cols-[18px_minmax(0,1fr)_64px] max-md:py-3"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? t("reopen") : t("markDone")}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "grid size-4 place-items-center rounded-[5px] border-[1.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 max-md:relative max-md:after:absolute max-md:after:-inset-3",
          done ? "border-brand bg-brand text-brand-on" : "border-line-strong hover:border-brand",
        )}
      >
        {done ? <Check className="size-3" strokeWidth={3} /> : null}
      </button>
      <ItemDetails
        onEdit={onEdit}
        title={task.title}
        description={task.description}
        origin={origin}
        href={task.href}
        fields={[
          { label: t("assignee"), value: task.assignees.length ? <span className="inline-flex flex-wrap gap-2">{task.assignees.map((person) => <UserIdentity key={person.id} userId={person.id} name={person.name} />)}</span> : t("unassigned") },
          { label: t("priority"), value: t(`priorities.${task.priority}`) },
          { label: t("status"), value: t(`statuses.${task.status}`) },
          { label: t("dueDate"), value: due ? format.dateTime(due, { dateStyle: "long" }) : "—" },
        ]}
        className="block min-w-0 rounded font-medium"
      >
        <span className={cn("block truncate @max-[420px]:line-clamp-2 @max-[420px]:whitespace-normal @max-[420px]:break-words", done && "text-muted-foreground line-through")}>
          {task.title}
        </span>
      </ItemDetails>
      <span className="truncate text-[12.5px] text-muted-foreground @max-[760px]:hidden" title={origin}>{origin}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] @max-[760px]:hidden">
        {task.assignees.length ? (
          <>
            <span className="flex shrink-0">
              {task.assignees.slice(0, 3).map((person, index) => (
                <span key={person.id} className={cn("inline-flex rounded-full", index > 0 && "-ml-2 ring-2 ring-card")}>
                  <UserIdentity userId={person.id} name={person.name} avatarOnly className="[&>span:first-child]:size-5 [&>span:first-child]:text-[9px]" />
                </span>
              ))}
            </span>
            <span className="truncate">{task.assignees.map((person) => person.name).join(", ")}</span>
          </>
        ) : (
          <span className="truncate text-muted-foreground">{t("unassigned")}</span>
        )}
      </span>
      <span className={cn("text-[12.5px] whitespace-nowrap @max-[420px]:hidden", overdue && !done ? "text-late" : "text-muted-foreground")}>
        {!due ? t("noDueDate") : overdue && !done ? format.relativeTime(due, now) : format.dateTime(due, { weekday: "short", day: "numeric", month: "short" })}
      </span>
      <PriorityPill priority={task.priority} label={t(`priorities.${task.priority}`)} className="justify-self-start" />
    </li>
  );
}
