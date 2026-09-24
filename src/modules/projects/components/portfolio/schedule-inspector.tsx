// Task detail inspector for the portfolio timeline (docked panel or sheet): task form,
// subtasks and incoming dependencies. Used by portfolio-client.tsx.
"use client";

import { TaskAssigneeSelect } from "@/modules/tasks/components/task-assignee-select";

import {
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CircleDot,
  Diamond,
  Focus,
  GitBranch,
  Minimize2,
  PanelRightClose,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { upsertTask, type TaskInput } from "@/modules/projects/task-actions";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import {
  dependencyTypeOf,
  isTaskDone,
  leafTasks,
  taskAncestors,
  taskDescendants,
  type DependencyType,
} from "@/modules/projects/schedule";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DependencyEditorPanel } from "./dependency-editor-panel";
import {
  dependencyDraftIsInvalid,
  dependencyTypeCodeKey,
  dependencyTypeTranslationKey,
} from "./dependency-utils";
import { DEPENDENCY_TYPE_OPTIONS } from "./portfolio-constants";
import { useInspectorDependencies } from "./use-inspector-dependencies";

export function ScheduleInspector({
  open,
  onOpenChange,
  presentation,
  dockWidth,
  onDockResizePointerDown,
  onDockResizeKeyDown,
  schedule,
  task,
  defaultProjectId,
  defaultParentTaskId,
  onAddSubtask,
  onOpenTask,
  onFocusTask,
  isTaskFocused,
  onTaskSaved,
  onScheduleChanged,
  onDeleteTask,
  onFitToChildren,
  embedded = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presentation: "dock" | "sheet-right" | "sheet-bottom";
  dockWidth?: number;
  onDockResizePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDockResizeKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  schedule: PortfolioSchedule;
  task: PortfolioTask | null;
  defaultProjectId: string | null;
  defaultParentTaskId: string | null;
  onAddSubtask: (task: PortfolioTask) => void;
  onOpenTask: (task: PortfolioTask) => void;
  onFocusTask: (task: PortfolioTask) => void;
  isTaskFocused: boolean;
  onScheduleChanged?: () => Promise<void>;
  onDeleteTask?: (task: PortfolioTask) => void;
  onFitToChildren?: (task: PortfolioTask) => Promise<void>;
  embedded?: boolean;
  onTaskSaved: (taskId: string, parentTaskId: string | null) => void;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const projectId = task?.projectId ?? defaultProjectId ?? "";
  const parentTaskId = task?.parentTaskId ?? defaultParentTaskId ?? null;
  const parentTask = parentTaskId
    ? schedule.tasks.find((candidate) => candidate.id === parentTaskId) ?? null
    : null;
  const childTasks = task
    ? schedule.tasks.filter((candidate) => candidate.parentTaskId === task.id)
    : [];
  const descendantTasks = task ? taskDescendants(schedule.tasks, task.id) : [];
  const breadcrumbs = task
    ? [...taskAncestors(schedule.tasks, task.id)].reverse()
    : parentTask
      ? [...taskAncestors(schedule.tasks, parentTask.id)].reverse().concat(parentTask)
      : [];
  const isSummary = childTasks.length > 0;
  const projectColumns = schedule.columns.filter((column) => column.projectId === projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [columnId, setColumnId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [progress, setProgress] = useState(0);
  const [isMilestone, setIsMilestone] = useState(false);
  const [constraintType, setConstraintType] = useState<
    "asap" | "start_no_earlier_than" | "must_start_on"
  >("asap");
  const [constraintDate, setConstraintDate] = useState("");
  const {
    predecessorId, setPredecessorId, dependencyType, setDependencyType, lagDays, setLagDays,
    dependencyEditorDraft, setDependencyEditorDraft, dependencyPending, deletingDependencyId,
    incoming, linkableTasks, addDependency, removeIncomingDependency, saveDependencyDraft,
    deleteDependencyDraft,
  } = useInspectorDependencies({ task, schedule, onScheduleChanged });
  const [pending, setPending] = useState(false);

  const [fitPending, setFitPending] = useState(false);

  // The form follows the task it shows. A new version of the same task (for
  // example after its bar was dragged) only replaces fields the user has not
  // edited, so unsaved input survives background updates.
  const fields = {
    title,
    description,
    columnId,
    assigneeIds,
    priority,
    startDate,
    dueDate,
    progress,
    isMilestone,
    constraintType,
    constraintDate,
  };
  const taskFields = (): typeof fields => ({
    title: task?.title ?? "",
    description: task?.description ?? "",
    columnId: task?.columnId ?? projectColumns[0]?.id ?? "",
    assigneeIds: task?.assigneeIds ?? [],
    priority: task?.priority ?? "medium",
    startDate: task?.startDate ?? "",
    dueDate: task?.dueDate ?? "",
    progress: task?.progress ?? 0,
    isMilestone: task?.isMilestone ?? false,
    constraintType: task?.constraintType ?? "asap",
    constraintDate: task?.constraintDate ?? "",
  });
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const [syncedVersion, setSyncedVersion] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<typeof fields | null>(null);
  const currentKey = open
    ? `${task?.id ?? "new"}-${defaultProjectId ?? ""}-${defaultParentTaskId ?? ""}`
    : null;
  const currentVersion = task?.updatedAt?.getTime() ?? null;
  const applyFields = (next: typeof fields, keep: (key: keyof typeof fields) => boolean) => {
    if (!keep("title")) setTitle(next.title);
    if (!keep("description")) setDescription(next.description);
    if (!keep("columnId")) setColumnId(next.columnId);
    if (!keep("assigneeIds")) setAssigneeIds(next.assigneeIds);
    if (!keep("priority")) setPriority(next.priority);
    if (!keep("startDate")) setStartDate(next.startDate);
    if (!keep("dueDate")) setDueDate(next.dueDate);
    if (!keep("progress")) setProgress(next.progress);
    if (!keep("isMilestone")) setIsMilestone(next.isMilestone);
    if (!keep("constraintType")) setConstraintType(next.constraintType);
    if (!keep("constraintDate")) setConstraintDate(next.constraintDate);
  };
  if (syncKey !== currentKey) {
    setSyncKey(currentKey);
    setSyncedVersion(currentVersion);
    if (currentKey !== null) {
      const next = taskFields();
      setBaseline(next);
      applyFields(next, () => false);
      setPredecessorId("none");
      setDependencyType("finish_to_start");
      setLagDays(0);
      setDependencyEditorDraft(null);
    }
  } else if (currentKey !== null && syncedVersion !== currentVersion) {
    setSyncedVersion(currentVersion);
    const next = taskFields();
    // A field is dirty when it differs from what the form last loaded.
    applyFields(next, (key) =>
      baseline !== null &&
      JSON.stringify(fields[key]) !== JSON.stringify(baseline[key]),
    );
    setBaseline(next);
  }

  async function saveTask(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !columnId) return;
    setPending(true);
    try {
      const input: TaskInput = {
        id: task?.id,
        projectId,
        parentTaskId,
        columnId,
        title,
        description,
        assigneeIds,
        priority,
        startDate: startDate || null,
        dueDate: isMilestone ? startDate || null : dueDate || null,
        progress,
        isMilestone,
        constraintType,
        constraintDate: constraintType === "asap" ? null : constraintDate || null,
      };
      const saved = await upsertTask(input);
      onTaskSaved(saved.id, parentTaskId);
      toast.success(tCommon("saved"));
      onOpenChange(false);
      if (onScheduleChanged) await onScheduleChanged();
      else router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  async function fitToChildren() {
    if (!task || !onFitToChildren || fitPending) return;
    setFitPending(true);
    try {
      await onFitToChildren(task);
    } finally {
      setFitPending(false);
    }
  }

  const inspectorContent = (
    <>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-medium text-foreground">
            {task ? t("editTask") : parentTaskId ? t("newSubtask") : t("newTask")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("scheduleInspectorDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {task && !embedded && (
            <Button
              type="button"
              variant={isTaskFocused ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => onFocusTask(task)}
              aria-label={isTaskFocused ? t("focusedTask") : t("focusTask")}
              title={isTaskFocused ? t("focusedTask") : t("focusTask")}
            >
              <Focus className="size-4" />
            </Button>
          )}
          {presentation === "dock" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label={t("closeInspector")}
            >
              <PanelRightClose className="size-4" />
            </Button>
          )}
        </div>
      </div>
        <form onSubmit={saveTask} className="flex flex-col gap-5 px-4 pb-6">
          {parentTask && (
            <div className="rounded-md border-l-2 border-l-violet-500 bg-muted/45 px-3 py-2 text-sm">
              <span className="text-xs text-muted-foreground">{t("subtaskOf")}</span>
              <span className="ml-2 font-medium">
                {breadcrumbs.map((item) => item.title).join(" / ")}
              </span>
            </div>
          )}
          {isSummary && (
            <div className="rounded-md border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
              {t("summaryScheduleDescription")}
              {leafTasks(descendantTasks).some((child) => !child.startDate || !child.dueDate) && (
                <span className="mt-1 block font-medium text-amber-700 dark:text-amber-400">
                  {t("unscheduledSubtasks", {
                    count: leafTasks(descendantTasks).filter((child) => !child.startDate || !child.dueDate).length,
                  })}
                </span>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="schedule-task-title">{t("taskTitle")}</Label>
            <Input id="schedule-task-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={300} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schedule-task-description">{t("description")}</Label>
            <Textarea id="schedule-task-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={5000} />
          </div>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="schedule-task-column">{t("column")}</Label>
              <Select value={columnId} onValueChange={(value) => setColumnId(value ?? "")}>
                <SelectTrigger id="schedule-task-column" className="w-full">
                  <SelectValue>
                    {projectColumns.find((column) => column.id === columnId)?.name ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projectColumns.map((column) => <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="schedule-task-assignee">{t("assignee")}</Label>
                <TaskAssigneeSelect id="schedule-task-assignee" value={assigneeIds} onChange={setAssigneeIds}
                  members={schedule.members} assignedMembers={task?.assignees} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="schedule-task-priority">{t("priority")}</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
                <SelectTrigger id="schedule-task-priority" className="w-full">
                  <SelectValue>
                    {priority === "low"
                      ? t("priorityLow")
                      : priority === "high"
                        ? t("priorityHigh")
                        : t("priorityMedium")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("priorityLow")}</SelectItem>
                  <SelectItem value="medium">{t("priorityMedium")}</SelectItem>
                  <SelectItem value="high">{t("priorityHigh")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="schedule-milestone" checked={isMilestone} onCheckedChange={(checked) => setIsMilestone(Boolean(checked))} disabled={isSummary} />
            <Label htmlFor="schedule-milestone">{t("milestone")}</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="schedule-start">{isMilestone ? t("milestoneDate") : t("startDate")}</Label>
              <Input id="schedule-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={isSummary} aria-describedby={isSummary ? "schedule-summary-dates" : undefined} />
            </div>
            {!isMilestone && (
              <div className="grid gap-2">
                <Label htmlFor="schedule-due">{t("dueDate")}</Label>
                <Input id="schedule-due" type="date" value={dueDate} min={startDate || undefined} onChange={(event) => setDueDate(event.target.value)} disabled={isSummary} aria-describedby={isSummary ? "schedule-summary-dates" : undefined} />
              </div>
            )}
          </div>
          {isSummary && task && (
            <div className="-mt-2 flex items-start justify-between gap-3">
              <p id="schedule-summary-dates" className="text-xs text-muted-foreground">
                {t("summaryDatesReadOnly")}
              </p>
              {onFitToChildren && (
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void fitToChildren()} disabled={fitPending}>
                  <Minimize2 className="size-3.5" />{t("fitToChildren")}
                </Button>
              )}
            </div>
          )}
          {!isSummary && (
            <div className="grid gap-3 rounded-md border bg-muted/25 p-3">
              <div className="grid gap-2">
                <Label htmlFor="schedule-constraint-type">{t("constraintType")}</Label>
                <Select value={constraintType} onValueChange={(value) => setConstraintType((value ?? "asap") as typeof constraintType)}>
                  <SelectTrigger id="schedule-constraint-type" className="w-full">
                    <SelectValue>
                      {constraintType === "asap"
                        ? t("constraintAsap")
                        : constraintType === "start_no_earlier_than"
                          ? t("constraintNoEarlierThan")
                          : t("constraintMustStartOn")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asap">{t("constraintAsap")}</SelectItem>
                    <SelectItem value="start_no_earlier_than">{t("constraintNoEarlierThan")}</SelectItem>
                    <SelectItem value="must_start_on">{t("constraintMustStartOn")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {constraintType !== "asap" && (
                <div className="grid gap-2">
                  <Label htmlFor="schedule-constraint-date">{t("constraintDate")}</Label>
                  <Input
                    id="schedule-constraint-date"
                    type="date"
                    value={constraintDate}
                    onChange={(event) => setConstraintDate(event.target.value)}
                    required={constraintType === "must_start_on"}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {constraintType === "asap"
                  ? t("constraintAsapHint")
                  : constraintType === "start_no_earlier_than"
                    ? t("constraintNoEarlierThanHint")
                    : t("constraintMustStartOnHint")}
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="schedule-progress">{t("progress")}</Label>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span>
            </div>
            <Input id="schedule-progress" type="range" min={0} max={100} step={5} value={progress} onChange={(event) => setProgress(Number(event.target.value))} disabled={isSummary} />
          </div>
          {task && !task.isMilestone && (
            <div className="grid gap-3 border-t pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">{t("subtasks")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("subtaskProgress", {
                      completed: childTasks.filter(isTaskDone).length,
                      total: childTasks.length,
                    })}
                  </p>
                </div>
                {!embedded && <Button type="button" variant="outline" size="sm" onClick={() => onAddSubtask(task)}>
                  <Plus className="size-3.5" />{t("newSubtask")}
                </Button>}
              </div>
              {childTasks.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{t("noSubtasks")}</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {childTasks.map((child) => (
                    <button key={child.id} type="button" onClick={() => onOpenTask(child)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50">
                      {child.isMilestone ? <Diamond className="size-3.5 fill-violet-500 text-violet-600" /> : <CircleDot className="size-3.5 text-muted-foreground" />}
                      <span className="min-w-0 flex-1 truncate">{child.title}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{child.progress}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {task && (
            <div className="grid gap-3 border-t pt-4">
              <div>
                <h3 className="text-sm font-medium">{t("dependencies")}</h3>
                <p className="text-xs text-muted-foreground">{t("dependenciesDescription")}</p>
              </div>
              {incoming.map((dependency) => {
                const predecessor = schedule.tasks.find((candidate) => candidate.id === dependency.predecessorTaskId);
                return (
                  <div key={dependency.id} className="flex items-center gap-1 rounded-md border p-1 text-sm">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted/55 focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() =>
                        setDependencyEditorDraft({
                          ...dependency,
                          dependencyType: dependencyTypeOf(dependency),
                          isNew: false,
                        })
                      }
                    >
                      <GitBranch className="size-4 shrink-0 text-indigo-500" />
                      <span className="min-w-0 flex-1 truncate">{predecessor?.title}</span>
                      <span className="rounded-sm bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                        {t(dependencyTypeCodeKey(dependencyTypeOf(dependency)))}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{dependency.lagDays >= 0 ? "+" : ""}{dependency.lagDays}d</span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("deleteDependency")}
                      title={t("deleteDependency")}
                      disabled={deletingDependencyId !== null}
                      aria-busy={deletingDependencyId === dependency.id}
                      onClick={() => void removeIncomingDependency(dependency)}
                    ><Trash2 className="size-3.5" /></Button>
                  </div>
                );
              })}
              <div className="grid gap-2 rounded-md border border-dashed p-2">
                <Select value={predecessorId} onValueChange={(value) => setPredecessorId(value ?? "none")}>
                  <SelectTrigger className="w-full" aria-label={t("choosePredecessor")}>
                    <SelectValue>
                      {predecessorId === "none"
                        ? t("choosePredecessor")
                        : linkableTasks.find((candidate) => candidate.id === predecessorId)?.title ??
                          t("choosePredecessor")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("choosePredecessor")}</SelectItem>
                    {linkableTasks.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>{candidate.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-[1fr_5.5rem_auto] gap-2">
                  <Select value={dependencyType} onValueChange={(value) => setDependencyType((value ?? "finish_to_start") as DependencyType)}>
                    <SelectTrigger className="w-full" aria-label={t("dependencyType")}>
                      <SelectValue>
                        {t(dependencyTypeTranslationKey(dependencyType))}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {DEPENDENCY_TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(dependencyTypeTranslationKey(type))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" min={-365} max={365} value={lagDays} onChange={(event) => setLagDays(Number(event.target.value))} aria-label={t("lagDays")} />
                  <Button type="button" variant="outline" size="icon" onClick={addDependency} disabled={predecessorId === "none" || dependencyPending} aria-label={t("addDependency")}><Plus className="size-4" /></Button>
                </div>
              </div>
              <Dialog
                open={Boolean(dependencyEditorDraft)}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen && !dependencyPending) {
                    setDependencyEditorDraft(null);
                  }
                }}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t("editDependency")}</DialogTitle>
                  </DialogHeader>
                  {dependencyEditorDraft && (
                    <DependencyEditorPanel
                      draft={dependencyEditorDraft}
                      tasks={schedule.tasks}
                      pending={dependencyPending}
                      invalid={dependencyDraftIsInvalid(
                        schedule.tasks,
                        schedule.dependencies,
                        dependencyEditorDraft,
                      )}
                      onChange={setDependencyEditorDraft}
                      onSave={() => void saveDependencyDraft()}
                      onCancel={() => setDependencyEditorDraft(null)}
                      onDelete={() => void deleteDependencyDraft()}
                    />
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}
          <div className="flex items-center gap-2">
            {task && onDeleteTask && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() => onDeleteTask(task)}
              >
                <Trash2 className="size-4" />{t("deleteTask")}
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={pending || !title.trim() || !columnId}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
    </>
  );

  if (!open) return null;

  if (presentation === "dock") {
    return (
      <aside
        className="relative hidden h-full shrink-0 overflow-y-auto border-l bg-card min-[960px]:block"
        style={{ width: dockWidth }}
        aria-label={t("taskDetails")}
        data-testid="schedule-inspector-dock"
      >
        <div
          role="separator"
          aria-label={t("resizeInspector")}
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={520}
          aria-valuenow={dockWidth}
          tabIndex={0}
          className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize bg-transparent transition-colors motion-reduce:transition-none hover:bg-violet-400/45 focus-visible:bg-violet-500"
          onPointerDown={onDockResizePointerDown}
          onKeyDown={onDockResizeKeyDown}
        />
        {inspectorContent}
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={presentation === "sheet-bottom" ? "bottom" : "right"}
        className={cn(
          "overflow-y-auto",
          presentation === "sheet-bottom"
            ? "max-h-[88dvh] rounded-t-xl"
            : "w-[min(34rem,96vw)] sm:max-w-lg",
        )}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{task ? t("editTask") : parentTaskId ? t("newSubtask") : t("newTask")}</SheetTitle>
          <SheetDescription>{t("scheduleInspectorDescription")}</SheetDescription>
        </SheetHeader>
        {inspectorContent}
      </SheetContent>
    </Sheet>
  );
}
