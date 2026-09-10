"use client";

import { OverviewTable, OverviewColumnPicker, useOverviewTable } from "./overview-table";
import { UserIdentity } from "@/components/user-identity";
import { ItemDetails } from "./item-details";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Check,
  ListChecks,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { setTaskStatus } from "@/modules/projects/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaskCreator } from "./task-create-provider";
import { todayLocal } from "../deadline-utils";
import type { TaskPriority, TaskStatus } from "../types";

type OverviewTask = {
  id: string;
  title: string;
  description: string;
  assigneeIds: string[];
  assignees: Array<{ id: string; name: string }>;
  assigneeName: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  columnName: string | null;
  contextType: "wikiPage" | "wikiSource" | "pdf" | "app" | null;
  contextEntityId: string | null;
  contextRoute: string | null;
  contextLabel: string | null;
  contextAnchorJson: string | null;
  href: string;
};

function localDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function TaskOverview({
  tasks,
  members,
  filters,
  defaultAssignee,
}: {
  tasks: OverviewTask[];
  members: Array<{ id: string; name: string }>;
  filters: { assignee: string; priority: string; status: string };
  defaultAssignee: string;
}) {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const layoutT = useTranslations("overviewLayout");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openTaskCreator } = useTaskCreator();
  const [pending, startTransition] = useTransition();
  const [now] = useState(() => new Date());
  const today = todayLocal(now);
  const assigneeLabel = filters.assignee === "all"
    ? t("allUsers")
    : filters.assignee === "unassigned"
      ? t("unassigned")
      : members.find((member) => member.id === filters.assignee)?.name ?? t("allUsers");
  const priorityLabel = filters.priority === "all"
    ? t("allPriorities")
    : t(`priorities.${filters.priority as TaskPriority}`);
  const statusLabel = t(`statuses.${filters.status as TaskStatus | "all"}`);
  const adjustedFilterCount = Number(filters.assignee !== defaultAssignee)
    + Number(filters.priority !== "all")
    + Number(filters.status !== "open");

  function replaceFilters(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    update(next);
    startTransition(() => {
      router.replace(`/?${next.toString()}`, { scroll: false });
    });
  }

  function setFilter(key: "assignee" | "priority" | "status", value: string) {
    replaceFilters((next) => {
      const isDefault = (key === "assignee" && value === defaultAssignee)
        || (key === "priority" && value === "all")
        || (key === "status" && value === "open");
      if (isDefault) next.delete(key);
      else next.set(key, value);
    });
  }

  function resetFilters() {
    replaceFilters((next) => {
      next.delete("assignee");
      next.delete("priority");
      next.delete("status");
    });
  }

  function editTask(task: OverviewTask) {
    openTaskCreator({
      task: {
        id: task.id,
        title: task.title,
        assigneeIds: task.assigneeIds,
        assignees: task.assignees,
        priority: task.priority,
        dueDate: task.dueDate,
        status: task.status,
        projectId: task.projectId,
      },
      origin: task.contextType && task.contextRoute ? {
        type: task.contextType,
        entityId: task.contextEntityId || "",
        route: task.contextRoute,
        label: task.contextLabel || task.projectName || t("origins.app"),
        anchor: (() => {
          try { return JSON.parse(task.contextAnchorJson || "{}") as Record<string, unknown>; }
          catch { return {}; }
        })(),
      } : undefined,
    });
  }

  function toggle(task: OverviewTask) {
    startTransition(async () => {
      await setTaskStatus(task.id, task.status === "done" ? "open" : "done");
      router.refresh();
    });
  }

  const table = useOverviewTable("tasks", tasks, [
    { id: "status", label: t("status"), width: 88, value: task => task.status === "done" ? 1 : 0,
      render: task => <button type="button" disabled={pending} onClick={() => toggle(task)} aria-label={task.status === "done" ? t("reopen") : t("markDone")} className={`grid size-6 place-items-center rounded-full border ${task.status === "done" ? "border-emerald-600 bg-emerald-600 text-white" : "hover:border-emerald-500"}`}>{task.status === "done" ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}</button> },
    { id: "title", label: t("title"), width: 220, value: task => task.title, render: task => <ItemDetails onEdit={() => editTask(task)} title={task.title} description={task.description} origin={task.contextLabel || task.projectName || t("origins.app")} href={task.href}
      fields={[
        { label: t("assignee"), value: task.assignees.length ? <span className="inline-flex flex-wrap gap-2">{task.assignees.map(person => <UserIdentity key={person.id} userId={person.id} name={person.name} />)}</span> : t("unassigned") },
        { label: t("priority"), value: t(`priorities.${task.priority}`) },
        { label: t("status"), value: t(`statuses.${task.status}`) },
        { label: t("dueDate"), value: task.dueDate ? format.dateTime(localDate(task.dueDate), { dateStyle: "long" }) : "—" },
      ]} className="block w-full rounded text-sm font-medium"><span className={`block truncate ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}>{task.title}</span></ItemDetails> },
    { id: "origin", label: layoutT("origin"), value: task => task.contextLabel || task.projectName || task.columnName || t("origins.app") },
    { id: "assignee", label: t("assignee"), value: task => task.assignees.map(person => person.name).join(", ") || null, render: task => <span className="inline-flex max-w-full gap-2 text-xs">{task.assignees.length ? task.assignees.map(person => <UserIdentity key={person.id} userId={person.id} name={person.name} compact />) : t("unassigned")}</span> },
    { id: "date", label: t("dueDate"), width: 145, value: task => task.dueDate, render: task => <span className={`text-xs ${task.status === "open" && task.dueDate && task.dueDate < today ? "text-destructive" : "text-muted-foreground"}`}>{task.dueDate ? format.dateTime(localDate(task.dueDate), { dateStyle: "medium" }) : "—"}</span> },
    { id: "priority", label: t("priority"), width: 110, value: task => ({ high: 3, medium: 2, low: 1 })[task.priority], render: task => <Badge variant={task.priority === "high" ? "destructive" : "outline"}>{t(`priorities.${task.priority}`)}</Badge> },
  ], "taskSort");

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
      <header className="border-b border-border/70 px-4 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              <ListChecks className="size-4.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">{t("overview")}</h2>
                <Badge variant="secondary" className="font-mono tabular-nums">{tasks.length}</Badge>
              </div>

            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={t("filter")} />}>
              <SlidersHorizontal />
              {t("filter")}
              {adjustedFilterCount > 0 && (
                <span className="grid min-w-4 place-items-center rounded-full bg-indigo-600 px-1 text-[10px] text-white">{adjustedFilterCount}</span>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 gap-3 p-3">
              <PopoverHeader>
                <PopoverTitle>{t("filter")}</PopoverTitle>
              </PopoverHeader>
              <Select value={filters.assignee} onValueChange={(value) => setFilter("assignee", value ?? "all")}>
                <SelectTrigger className="w-full" aria-label={t("filterAssignee")}><SelectValue>{!["all", "unassigned"].includes(filters.assignee) ? <UserIdentity userId={filters.assignee} name={assigneeLabel} compact /> : assigneeLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allUsers")}</SelectItem>
                  <SelectItem value="unassigned">{t("unassigned")}</SelectItem>
                  {members.map((member) => <SelectItem key={member.id} value={member.id}><UserIdentity userId={member.id} name={member.name} /></SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.priority} onValueChange={(value) => setFilter("priority", value ?? "all")}>
                <SelectTrigger className="w-full" aria-label={t("filterPriority")}><SelectValue>{priorityLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allPriorities")}</SelectItem>
                  <SelectItem value="high">{t("priorities.high")}</SelectItem>
                  <SelectItem value="medium">{t("priorities.medium")}</SelectItem>
                  <SelectItem value="low">{t("priorities.low")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(value) => setFilter("status", value ?? "open")}>
                <SelectTrigger className="w-full" aria-label={t("filterStatus")}><SelectValue>{statusLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t("statuses.open")}</SelectItem>
                  <SelectItem value="done">{t("statuses.done")}</SelectItem>
                  <SelectItem value="all">{t("statuses.all")}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="justify-start" onClick={resetFilters}>
                <RotateCcw />
                {t("resetFilters")}
              </Button>
            </PopoverContent>
          </Popover>

          <button type="button" onClick={() => setFilter("assignee", "all")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {!["all", "unassigned"].includes(filters.assignee) ? <UserIdentity userId={filters.assignee} name={assigneeLabel} compact /> : assigneeLabel}<X className="size-3" />
          </button>
          {filters.priority !== "all" && (
            <button type="button" onClick={() => setFilter("priority", "all")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
              {priorityLabel}<X className="size-3" />
            </button>
          )}
          <button type="button" onClick={() => setFilter("status", "all")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {statusLabel}<X className="size-3" />
          </button>
          <OverviewColumnPicker table={table} />
        </div>
      </header>

      <OverviewTable table={table} label={t("overview")} pending={pending} empty={<div><p>{t("empty")}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="outline" size="sm" onClick={resetFilters}>{t("resetFilters")}</Button><Button size="sm" onClick={() => openTaskCreator()}>{t("createTask")}</Button></div></div>} actions={task => (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("edit")} />}><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => editTask(task)}><Pencil />{t("edit")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggle(task)}>
                          {task.status === "done" ? <RotateCcw /> : <Check />}
                          {task.status === "done" ? t("reopen") : t("markDone")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
      )} />
    </section>
  );
}
