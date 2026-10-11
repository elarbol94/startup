"use client";

// Dashboard task card (design 1b): tasks grouped by due date with an optimistic checkbox,
// "Meine | Alle", a filter menu and the board view. Pieces live in ./task-overview/.
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardCheck, ClipboardPlus, Columns3, List, TriangleAlert, X } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { TaskBoard } from "./task-board";
import { useOverviewPreference } from "./overview-preferences";
import { useTaskCreator } from "./task-create-provider";
import { todayLocal } from "../deadline-utils";
import { groupTasksByBucket } from "../task-buckets";
import { TaskFilterMenu, type TaskFilterState } from "./task-overview/task-filter-menu";
import { TaskRow } from "./task-overview/task-row";
import { useTaskCompletion } from "./task-overview/use-task-completion";
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
  const layoutT = useTranslations("overviewLayout");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openTaskCreator } = useTaskCreator();
  const [filtering, startTransition] = useTransition();
  const [now] = useState(() => new Date());
  const today = todayLocal(now);
  const viewPreference = useOverviewPreference("task-view");
  const boardView = viewPreference.raw === '"board"';
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const completion = useTaskCompletion();

  const matchesLocalFilters = (task: OverviewTask) =>
    (projectFilter === "all" || (projectFilter === "none" ? !task.projectId : task.projectId === projectFilter))
    && task.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const candidates = tasks.filter(matchesLocalFilters);
  // A task checked off here stays visible (struck through) even while only open tasks are listed.
  const visibleTasks = candidates.filter((task) => boardView
    || filters.status === "all"
    || completion.justCompleted.has(task.id)
    || (completion.isDone(task) ? "done" : "open") === filters.status);
  const openCount = candidates.filter((task) => !completion.isDone(task)).length;
  const groups = groupTasksByBucket(visibleTasks, today, (task) => completion.isDone(task) && !completion.justCompleted.has(task.id));
  const mine = filters.assignee === defaultAssignee;
  const adjustedFilterCount = Number(filters.assignee !== defaultAssignee && filters.assignee !== "all")
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

  function setFilter(key: keyof TaskFilterState, value: string) {
    if (key === "search") return setSearch(value);
    if (key === "project") return setProjectFilter(value);
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
        description: task.description,
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

  const assigneeName = members.find((member) => member.id === filters.assignee)?.name ?? t("unassigned");
  const chips = [
    filters.assignee !== defaultAssignee && filters.assignee !== "all" && {
      key: "assignee", label: filters.assignee === "unassigned" ? t("unassigned") : <UserIdentity userId={filters.assignee} name={assigneeName} compact />, clear: () => setFilter("assignee", "all"),
    },
    filters.priority !== "all" && { key: "priority", label: t(`priorities.${filters.priority as TaskPriority}`), clear: () => setFilter("priority", "all") },
    !boardView && filters.status !== "open" && { key: "status", label: t(`statuses.${filters.status as TaskStatus | "all"}`), clear: () => setFilter("status", "open") },
    projectFilter !== "all" && { key: "project", label: projectFilter === "none" ? t("board.noProject") : projects.find((project) => project.id === projectFilter)?.name, clear: () => setProjectFilter("all") },
    search.trim() && { key: "search", label: `„${search.trim()}“`, clear: () => setSearch("") },
  ].filter((chip) => !!chip);

  return (
    <section
      data-overview-section="tasks"
      aria-labelledby="overview-tasks-title"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card"
    >
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-[18px] py-3.5">
        <h2 id="overview-tasks-title" className="text-[15px] font-semibold whitespace-nowrap">{mine ? t("onlyMine") : t("overview")}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{t("openCount", { count: openCount })}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <SegmentedControl
            label={t("filterAssignee")}
            value={mine ? "mine" : filters.assignee === "all" ? "all" : null}
            onValueChange={(value) => setFilter("assignee", value === "mine" ? defaultAssignee : "all")}
            options={[{ value: "mine", label: t("board.mine") }, { value: "all", label: t("everyone") }]}
          />
          <TaskFilterMenu
            filters={{ ...filters, project: projectFilter, search }}
            activeCount={adjustedFilterCount}
            members={members}
            projects={projects}
            showStatus={!boardView}
            onChange={setFilter}
            onReset={resetFilters}
          />
          <Button variant="ghost" size="sm" aria-label={boardView ? t("board.list") : t("board.board")} onClick={() => viewPreference.save(boardView ? "list" : "board")}>
            {boardView ? <List /> : <Columns3 />}
            {boardView ? t("board.list") : t("board.board")}
          </Button>
        </div>
        {viewPreference.failed && <p role="status" className="basis-full text-xs text-destructive">{layoutT("saveFailed")}</p>}
        {chips.length > 0 && (
          <div className="flex basis-full flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                {chip.label}<X className="size-3" />
              </button>
            ))}
          </div>
        )}
      </header>

      {boardView ? (
        <TaskBoard tasks={visibleTasks} onEdit={editTask} projectId={!["all", "none"].includes(projectFilter) ? projectFilter : null} assigneeId={filters.assignee === "unassigned" ? null : filters.assignee === "all" ? defaultAssignee : filters.assignee} priority={filters.priority === "all" ? "medium" : filters.priority as TaskPriority} />
      ) : groups.length === 0 ? (
        adjustedFilterCount === 0 ? (
          <EmptyState
            icon={<ClipboardCheck />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            actions={<>
              <Button size="sm" onClick={() => openTaskCreator()}><ClipboardPlus />{t("createTask")}</Button>
              {mine && <Button size="sm" variant="outline" onClick={() => setFilter("assignee", "all")}>{t("showAllUsers")}</Button>}
            </>}
          />
        ) : (
          <EmptyState
            compact
            icon={<ClipboardCheck />}
            title={t("empty")}
            actions={<Button size="sm" variant="outline" onClick={resetFilters}>{t("resetFilters")}</Button>}
          />
        )
      ) : (
        <div aria-busy={filtering} className={cn("@container pb-1.5", filtering && "opacity-70")}>
          {groups.map(({ bucket, tasks: bucketTasks }) => (
            <div key={bucket} role="group" aria-labelledby={`overview-bucket-${bucket}`}>
              <h3 id={`overview-bucket-${bucket}`} className={cn("flex items-center gap-2 px-[18px] pt-3 pb-1 text-[11px] font-semibold tracking-[0.1em] uppercase", bucket === "overdue" ? "text-late" : "text-text-tertiary")}>
                {bucket === "overdue" && <TriangleAlert className="size-3.5" />}
                {t(`buckets.${bucket}`)} · {bucketTasks.length}
              </h3>
              <ul className="divide-y divide-line-soft">
                {bucketTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    now={now}
                    done={completion.isDone(task)}
                    overdue={bucket === "overdue"}
                    disabled={completion.pending}
                    onToggle={() => completion.toggle(task)}
                    onEdit={() => editTask(task)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
