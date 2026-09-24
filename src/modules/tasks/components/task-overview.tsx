"use client";

import { OverviewTable, OverviewColumnPicker, useOverviewTable } from "./overview-table";
import { TaskBoard } from "./task-board";
import { useOverviewPreference } from "./overview-preferences";
import { Input } from "@/components/ui/input";
import { UserIdentity } from "@/components/user-identity";
import { ItemDetails } from "./item-details";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Check,
  ListChecks,
  Columns3,
  List,
  Plus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { moveDashboardTask } from "@/modules/projects/contextual-task-actions";
import { toast } from "sonner";
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

export type OverviewTask = {
  id: string;
  title: string;
  description: string;
  assigneeIds: string[];
  assignees: Array<{ id: string; name: string }>;
  assigneeName: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  boardStage: "todo" | "in_progress" | "done";
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
  projects,
}: {
  tasks: OverviewTask[];
  members: Array<{ id: string; name: string }>;
  filters: { assignee: string; priority: string; status: string };
  defaultAssignee: string;
  projects: Array<{ id: string; name: string }>;
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
  const viewPreference = useOverviewPreference("task-view");
  const boardView = viewPreference.raw === '"board"';
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const visibleTasks = tasks.filter(task =>
    (boardView || filters.status === "all" || (task.boardStage === "done" ? "done" : "open") === filters.status)
    && (projectFilter === "all" || (projectFilter === "none" ? !task.projectId : task.projectId === projectFilter))
    && task.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
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
    + Number(!boardView && filters.status !== "open")
    + Number(projectFilter !== "all") + Number(Boolean(search.trim()));

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
    setSearch("");
    setProjectFilter("all");
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
      try {
        await moveDashboardTask({ taskId: task.id, stage: task.boardStage === "done" ? "todo" : "done" });
        router.refresh();
      } catch { toast.error(t("board.moveFailed")); }
    });
  }

  const statusToggle = (task: OverviewTask) => <button type="button" disabled={pending} onClick={() => toggle(task)} aria-label={task.status === "done" ? t("reopen") : t("markDone")} className={`grid size-6 shrink-0 place-items-center rounded-full border ${task.status === "done" ? "border-emerald-600 bg-emerald-600 text-white" : "hover:border-emerald-500"}`}>{task.status === "done" ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}</button>;
  const originOf = (task: OverviewTask) => task.contextLabel || task.projectName || task.columnName || t("origins.app");
  const isOverdue = (task: OverviewTask) => task.status === "open" && !!task.dueDate && task.dueDate < today;
  const dueDate = (task: OverviewTask) => <span className={`text-xs ${isOverdue(task) ? "text-destructive" : "text-muted-foreground"}`}>{task.dueDate ? format.dateTime(localDate(task.dueDate), { dateStyle: "medium" }) : "—"}</span>;
  const priorityBadge = (task: OverviewTask) => <Badge variant={task.priority === "high" ? "destructive" : "outline"}>{t(`priorities.${task.priority}`)}</Badge>;
  const titleDetails = (task: OverviewTask) => <ItemDetails onEdit={() => editTask(task)} title={task.title} description={task.description} origin={task.contextLabel || task.projectName || t("origins.app")} href={task.href}
    fields={[
      { label: t("assignee"), value: task.assignees.length ? <span className="inline-flex flex-wrap gap-2">{task.assignees.map(person => <UserIdentity key={person.id} userId={person.id} name={person.name} />)}</span> : t("unassigned") },
      { label: t("priority"), value: t(`priorities.${task.priority}`) },
      { label: t("status"), value: t(`statuses.${task.status}`) },
      { label: t("dueDate"), value: task.dueDate ? format.dateTime(localDate(task.dueDate), { dateStyle: "long" }) : "—" },
    ]} className="block w-full rounded text-sm font-medium"><span className={`block truncate ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}>{task.title}</span></ItemDetails>;
  // Phone layout (< md): stacked row instead of the wide table.
  const mobileRow = (task: OverviewTask) => <div className="flex items-start gap-3">
    <div className="pt-0.5">{statusToggle(task)}</div>
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="[&_.truncate]:line-clamp-2 [&_.truncate]:whitespace-normal [&_.truncate]:break-words">{titleDetails(task)}</div>
      <p className="truncate text-xs text-muted-foreground">{originOf(task)}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {dueDate(task)}
        {priorityBadge(task)}
        {task.assignees.length ? <span className="inline-flex items-center gap-1">{task.assignees.map(person => <UserIdentity key={person.id} userId={person.id} name={person.name} avatarOnly />)}</span> : <span className="text-xs text-muted-foreground">{t("unassigned")}</span>}
      </div>
    </div>
  </div>;

  const table = useOverviewTable("tasks", visibleTasks, [
    { id: "status", label: t("status"), width: 88, value: task => task.status === "done" ? 1 : 0, render: statusToggle },
    { id: "title", label: t("title"), width: 240, wrap: true, value: task => task.title, render: titleDetails },
    { id: "origin", label: layoutT("origin"), value: originOf },
    { id: "assignee", label: t("assignee"), value: task => task.assignees.map(person => person.name).join(", ") || null, render: task => <span className="inline-flex max-w-full gap-2 text-xs">{task.assignees.length ? task.assignees.map(person => <UserIdentity key={person.id} userId={person.id} name={person.name} compact />) : t("unassigned")}</span> },
    { id: "date", label: t("dueDate"), width: 145, value: task => task.dueDate, render: dueDate },
    { id: "priority", label: t("priority"), width: 110, value: task => ({ high: 3, medium: 2, low: 1 })[task.priority], render: priorityBadge },
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
                <Badge variant="secondary" className="tabular-nums">{visibleTasks.length}</Badge>
              </div>

            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex rounded-md bg-muted p-0.5" role="group" aria-label={t("board.view")}>
              <Button variant={boardView ? "ghost" : "secondary"} size="icon-sm" aria-label={t("board.list")} title={t("board.list")} aria-pressed={!boardView} onClick={() => viewPreference.save("list")}><List /></Button>
              <Button variant={boardView ? "secondary" : "ghost"} size="icon-sm" aria-label={t("board.board")} title={t("board.board")} aria-pressed={boardView} onClick={() => viewPreference.save("board")}><Columns3 /></Button>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={t("createTask")} onClick={() => openTaskCreator()}><Plus /></Button>
          </div>
        </div>
        {viewPreference.failed && <p role="status" className="mt-2 text-xs text-destructive">{layoutT("saveFailed")}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Input className="h-8 w-full basis-full sm:w-auto sm:min-w-24 sm:flex-1 sm:basis-28" value={search} onChange={event => setSearch(event.target.value)} aria-label={t("board.search")} placeholder={t("board.search")} />
          <Select value={projectFilter} onValueChange={value => setProjectFilter(value ?? "all")}>
            <SelectTrigger className="h-8 w-auto max-w-44" aria-label={t("board.project")}><SelectValue>{projectFilter === "all" ? t("board.allProjects") : projectFilter === "none" ? t("board.noProject") : projects.find(project => project.id === projectFilter)?.name}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("board.allProjects")}</SelectItem><SelectItem value="none">{t("board.noProject")}</SelectItem>{projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant={filters.assignee === defaultAssignee ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("assignee", defaultAssignee)}>{t("board.mine")}</Button>
          <Button variant={filters.assignee === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("assignee", "all")}>{t("allUsers")}</Button>
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
              {!boardView && <Select value={filters.status} onValueChange={(value) => setFilter("status", value ?? "open")}>
                <SelectTrigger className="w-full" aria-label={t("filterStatus")}><SelectValue>{statusLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t("statuses.open")}</SelectItem>
                  <SelectItem value="done">{t("statuses.done")}</SelectItem>
                  <SelectItem value="all">{t("statuses.all")}</SelectItem>
                </SelectContent>
              </Select>}
              <Button variant="ghost" size="sm" className="justify-start" onClick={resetFilters}>
                <RotateCcw />
                {t("resetFilters")}
              </Button>
            </PopoverContent>
          </Popover>

          {filters.assignee !== defaultAssignee && filters.assignee !== "all" && <button type="button" onClick={() => setFilter("assignee", "all")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {!["all", "unassigned"].includes(filters.assignee) ? <UserIdentity userId={filters.assignee} name={assigneeLabel} compact /> : assigneeLabel}<X className="size-3" />
          </button>}
          {filters.priority !== "all" && (
            <button type="button" onClick={() => setFilter("priority", "all")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
              {priorityLabel}<X className="size-3" />
            </button>
          )}
          {!boardView && <button type="button" onClick={() => setFilter("status", "all")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {statusLabel}<X className="size-3" />
          </button>}
          {!boardView && <OverviewColumnPicker table={table} />}
        </div>
      </header>

      {boardView ? <TaskBoard tasks={visibleTasks} onEdit={editTask} projectId={!["all", "none"].includes(projectFilter) ? projectFilter : null} assigneeId={filters.assignee === "unassigned" ? null : filters.assignee === "all" ? defaultAssignee : filters.assignee} priority={filters.priority === "all" ? "medium" : filters.priority as TaskPriority} /> : <OverviewTable table={table} label={t("overview")} pending={pending} mobileRow={mobileRow} empty={<div><p>{t("empty")}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="outline" size="sm" onClick={resetFilters}>{t("resetFilters")}</Button><Button size="sm" onClick={() => openTaskCreator()}>{t("createTask")}</Button></div></div>} actions={task => (
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
      )} />}
    </section>
  );
}
