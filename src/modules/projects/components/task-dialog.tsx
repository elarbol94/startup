"use client";
import { BugReportDetails } from "@/modules/projects/bugs/report-details";

import { TaskAssigneeSelect } from "@/modules/tasks/components/task-assignee-select";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePendingDelete } from "@/lib/use-pending-delete";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { deleteTask } from "@/modules/projects/task-actions";
import {
  deleteTaskKeepingSubtasks,
  getTaskDialogDetails,
  moveTaskToProject,
  saveTaskFromDialog,
  type TaskDialogDetails,
} from "@/modules/projects/task-dialog-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EvidencePanel } from "@/modules/wiki/components/evidence-panel";
import { ContextPanel } from "@/modules/context/components/context-panel";
import { canonicalTaskHref } from "@/modules/context/routes";
import { ShareMenu } from "@/components/share/share-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addCalendarDays } from "@/modules/projects/schedule";
import { TaskConstraintFields } from "./task-dialog/task-constraint-fields";
import { TaskDependenciesSection } from "./task-dialog/task-dependencies-section";
import type { BoardTaskDto, ConstraintType, MemberDto } from "./task-dialog/task-dialog-types";
import { failureMessage } from "./task-dialog/task-dialog-utils";
import { useTaskLinks } from "./task-dialog/use-task-links";

export type { BoardTaskDto, MemberDto } from "./task-dialog/task-dialog-types";

export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  columns,
  members,
  task,
  defaultColumnId,
  defaultParentTaskId,
  parentTask,
  subtasks,
  predecessorOptions = [],
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  columns: Array<{ id: string; name: string; isCompleted?: boolean }>;
  members: MemberDto[];
  task: BoardTaskDto | null;
  defaultColumnId: string | null;
  defaultParentTaskId: string | null;
  parentTask: BoardTaskDto | null;
  subtasks: BoardTaskDto[];
  predecessorOptions?: Array<{ id: string; title: string; dueDate: string | null; type: "project" | "task" }>;
  /** Archived projects: every input is disabled, and there is no save or delete. */
  readOnly?: boolean;
}) {
  const t = useTranslations("projects");
  const tShare = useTranslations("share");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [columnId, setColumnId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [progress, setProgress] = useState(0);
  const [isMilestone, setIsMilestone] = useState(false);
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [constraintType, setConstraintType] = useState<ConstraintType>("asap");
  const [constraintDate, setConstraintDate] = useState("");
  const [predecessorTaskId, setPredecessorTaskId] = useState("none");
  const [targetProjectId, setTargetProjectId] = useState(projectId);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const scheduleDelete = usePendingDelete();
  // Links, move targets and the subtree size come from the server per task.
  const [details, setDetails] = useState<TaskDialogDetails | null>(null);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const links = useTaskLinks({
    task,
    readOnly,
    onChanged: () => setDetailsVersion((version) => version + 1),
  });
  const isSummary = subtasks.length > 0;
  const isSubtask = Boolean(task?.parentTaskId ?? defaultParentTaskId);
  const unscheduledSubtasks = subtasks.filter(
    (subtask) => !subtask.startDate || !subtask.dueDate,
  ).length;
  const inCompletedColumn = Boolean(columns.find((column) => column.id === columnId)?.isCompleted);
  const movesProject = Boolean(task) && targetProjectId !== projectId;
  const dateOrderInvalid = !isMilestone && Boolean(startDate && dueDate && dueDate < startDate);
  const descendantCount = Math.max(details?.descendantCount ?? 0, subtasks.length);
  // Only task links can be shown and edited on the timeline, so creation
  // offers tasks only (project links would land in a table nothing displays).
  const creationPredecessors = predecessorOptions.filter(
    (candidate) => candidate.type === "task" && candidate.dueDate,
  );

  // Reset form state when the dialog opens (render-time state adjustment).
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const currentKey = open ? `${task?.id ?? "new"}-${defaultColumnId ?? ""}-${defaultParentTaskId ?? ""}` : null;
  if (syncKey !== currentKey) {
    setSyncKey(currentKey);
    if (currentKey !== null) {
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      setColumnId(task?.columnId ?? defaultColumnId ?? columns[0]?.id ?? "");
      setAssigneeIds(task?.assigneeIds ?? []);
      setDueDate(task?.dueDate ?? "");
      setStartDate(task?.startDate ?? "");
      setProgress(task?.progress ?? 0);
      setIsMilestone(task?.isMilestone ?? false);
      setPriority(task?.priority ?? "medium");
      setConstraintType(task?.constraintType ?? "asap");
      setConstraintDate(task?.constraintDate ?? "");
      setPredecessorTaskId("none");
      setTargetProjectId(projectId);
      setFormError(null);
      setConfirmingDelete(false);
      setDetails(null);
      links.resetLinks();
    }
  }

  const taskId = open ? task?.id ?? null : null;
  useEffect(() => {
    if (!taskId) return;
    let active = true;
    getTaskDialogDetails(taskId)
      .then((next) => {
        if (active) setDetails(next);
      })
      .catch(() => {
        if (active) toast.error(tCommon("error"));
      });
    return () => {
      active = false;
    };
  }, [taskId, detailsVersion, tCommon]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (dateOrderInvalid) return;
    if (!isSummary && constraintType === "must_start_on" && !constraintDate) {
      setFormError(t("constraintDateRequired"));
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      const saved = await saveTaskFromDialog({
        id: task?.id,
        projectId,
        columnId,
        parentTaskId: task?.parentTaskId ?? defaultParentTaskId,
        title,
        description,
        assigneeIds,
        startDate: startDate || null,
        dueDate: isMilestone ? startDate || null : dueDate || null,
        progress,
        isMilestone,
        priority,
        // Summaries have no constraint of their own; leave the stored one alone.
        ...(isSummary
          ? {}
          : {
              constraintType,
              constraintDate: constraintType === "asap" ? null : constraintDate || null,
            }),
        predecessor: !task && predecessorTaskId !== "none" ? (() => { const [type, id] = predecessorTaskId.split(":"); return { type: type as "project" | "task", id }; })() : null,
      });
      if (!saved.ok) {
        setFormError(failureMessage(t, tCommon, saved.code));
        return;
      }
      if (task && movesProject) {
        const moved = await moveTaskToProject({ taskId: task.id, projectId: targetProjectId });
        if (!moved.ok) {
          // The edits are saved; only the move was refused.
          setFormError(failureMessage(t, tCommon, moved.code));
          router.refresh();
          return;
        }
        toast.success(t("taskMoved", {
          name: details?.projects.find((project) => project.id === targetProjectId)?.name ?? "",
        }));
      } else {
        toast.success(tCommon("saved"));
      }
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  function onDelete(keepSubtasks: boolean) {
    if (!task || readOnly) return;
    const taskId = task.id;
    // Delayed delete: hidden now, committed after the Undo window.
    scheduleDelete({
      hiddenIds: keepSubtasks ? [taskId] : [taskId, ...subtasks.map((subtask) => subtask.id)],
      commit: async () => {
        if (keepSubtasks) await deleteTaskKeepingSubtasks(taskId);
        else await deleteTask(taskId);
      },
      onCommitted: () => router.refresh(),
    });
    setConfirmingDelete(false);
    onOpenChange(false);
  }

  const priorityLabel = {
    low: t("priorityLow"),
    medium: t("priorityMedium"),
    high: t("priorityHigh"),
  }[priority];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader className="flex-row items-center gap-2 pr-8">
          <DialogTitle className="min-w-0 flex-1">
            {task ? t("editTask") : isSubtask ? t("newSubtask") : t("newTask")}
          </DialogTitle>
          {task && (
            <ShareMenu
              target={{ href: canonicalTaskHref(task.id, task.projectId), title: task.title }}
              label={tShare("shareTask")}
              variant="ghost"
            />
          )}
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {readOnly && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("taskReadOnlyArchived")}
            </p>
          )}
          {task && <BugReportDetails key={task.id} taskId={task.id} />}
          {isSubtask && parentTask && (
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
              <span>{t("subtaskOf")}</span>
              <ChevronRight className="size-3.5" />
              <span className="truncate font-medium text-foreground">
                {parentTask.title}
              </span>
            </div>
          )}

          {isSummary && (
            <div className="rounded-md border border-l-2 border-l-brand bg-muted/50 px-3 py-2.5 text-xs text-text-secondary">
              <p>{t("summaryScheduleDescription")}</p>
              {unscheduledSubtasks > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {t("unscheduledSubtasks", { count: unscheduledSubtasks })}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-title">{t("taskTitle")}</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={300}
              disabled={readOnly}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-description">{t("description")}</Label>
            <Textarea
              id="task-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              disabled={readOnly}
            />
          </div>

          {task && !task.parentTaskId && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-project">{t("taskProject")}</Label>
              <Select
                value={targetProjectId}
                onValueChange={(value) => setTargetProjectId(value ?? projectId)}
                disabled={readOnly || !details}
              >
                <SelectTrigger className="w-full" id="task-project">
                  <SelectValue>
                    {details?.projects.find((project) => project.id === targetProjectId)?.name ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(details?.projects ?? []).map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {movesProject && (
                <p className="text-xs text-muted-foreground">{t("taskProjectHint")}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-column">{t("column")}</Label>
              <Select
                value={columnId}
                onValueChange={(value) => setColumnId(value ?? "")}
                disabled={readOnly || movesProject}
              >
                <SelectTrigger className="w-full" id="task-column">
                  <SelectValue>
                    {columns.find((c) => c.id === columnId)?.name ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {column.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-priority">{t("priority")}</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as typeof priority)}
                disabled={readOnly}
              >
                <SelectTrigger className="w-full" id="task-priority">
                  <SelectValue>{priorityLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("priorityLow")}</SelectItem>
                  <SelectItem value="medium">{t("priorityMedium")}</SelectItem>
                  <SelectItem value="high">{t("priorityHigh")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-assignee">{t("assignee")}</Label>
              {readOnly ? (
                <p id="task-assignee" className="min-h-8 rounded-lg border px-2.5 py-1.5 text-sm text-muted-foreground">
                  {task?.assigneeName ?? t("unassigned")}
                </p>
              ) : (
                <TaskAssigneeSelect id="task-assignee" value={assigneeIds} onChange={setAssigneeIds}
                  members={members} assignedMembers={task?.assignees} />
              )}
            </div>
          </div>

          {!task && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-predecessor">{t("choosePredecessor")}</Label>
              <Select value={predecessorTaskId} disabled={readOnly} onValueChange={(value) => {
                const next = value ?? "none";
                setPredecessorTaskId(next);
                const predecessor = creationPredecessors.find((candidate) => `${candidate.type}:${candidate.id}` === next);
                if (predecessor?.dueDate) setStartDate(addCalendarDays(predecessor.dueDate, 1));
              }}>
                <SelectTrigger id="task-predecessor" className="w-full"><SelectValue>{predecessorTaskId === "none" ? t("choosePredecessor") : creationPredecessors.find((candidate) => `${candidate.type}:${candidate.id}` === predecessorTaskId)?.title}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("choosePredecessor")}</SelectItem>
                  {creationPredecessors.map((candidate) => <SelectItem key={`${candidate.type}:${candidate.id}`} value={`${candidate.type}:${candidate.id}`}>{candidate.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="task-milestone"
              checked={isMilestone}
              onCheckedChange={(checked) => setIsMilestone(Boolean(checked))}
              disabled={isSummary || readOnly}
            />
            <Label htmlFor="task-milestone">{t("milestone")}</Label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-start">
                {isMilestone ? t("milestoneDate") : t("startDate")}
              </Label>
              <Input
                id="task-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isSummary || readOnly}
                aria-invalid={dateOrderInvalid || undefined}
              />
            </div>
            {!isMilestone && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="task-due">{t("dueDate")}</Label>
                <Input
                  id="task-due"
                  type="date"
                  min={startDate || undefined}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={isSummary || readOnly}
                  aria-invalid={dateOrderInvalid || undefined}
                  aria-describedby={dateOrderInvalid ? "task-date-error" : undefined}
                />
              </div>
            )}
          </div>
          {dateOrderInvalid && (
            <p id="task-date-error" role="alert" className="-mt-2 text-xs text-destructive">
              {t("dateOrderInvalid")}
            </p>
          )}

          {!isSummary && (
            <TaskConstraintFields
              constraintType={constraintType}
              setConstraintType={setConstraintType}
              constraintDate={constraintDate}
              setConstraintDate={setConstraintDate}
              readOnly={readOnly}
            />
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-progress">{t("progress")}</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {inCompletedColumn ? 100 : progress}%
              </span>
            </div>
            <Input
              id="task-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={inCompletedColumn ? 100 : progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              disabled={isSummary || inCompletedColumn || readOnly}
              aria-describedby={inCompletedColumn && !isSummary ? "task-progress-hint" : undefined}
            />
            {inCompletedColumn && !isSummary && (
              <p id="task-progress-hint" className="text-xs text-muted-foreground">
                {t("progressLockedCompleted")}
              </p>
            )}
          </div>

          {isSummary && (
            <div className="flex flex-col gap-2">
              <Label>{t("subtasks")}</Label>
              <div className="divide-y rounded-md border">
                {subtasks.map((subtask) => (
                  <div
                    key={subtask.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{subtask.title}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {subtask.progress}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("summaryScheduleDescription")}</p>
            </div>
          )}

          {task && <TaskDependenciesSection details={details} readOnly={readOnly} {...links} />}

          {task && (
            <>
              <ContextPanel
                subjectType="task"
                subjectId={task.id}
                subjectLabel={task.title}
                subjectHref={canonicalTaskHref(task.id, task.projectId)}
                compact
              />
              <EvidencePanel targetType="task" targetId={task.id} compact />
            </>
          )}

          {formError && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {formError}
            </p>
          )}

          {task && confirmingDelete && !readOnly ? (
            <div role="alertdialog" aria-labelledby="task-delete-title" className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p id="task-delete-title" className="text-sm font-medium">{t("deleteTaskTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {descendantCount > 0
                  ? t("deleteTaskWithSubtasks", { title: task.title, count: descendantCount })
                  : t("deleteTaskConfirm", { title: task.title })}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={pending}>
                  {tCommon("cancel")}
                </Button>
                {descendantCount > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => onDelete(true)} disabled={pending}>
                    {t("outdentChildrenInstead")}
                  </Button>
                )}
                <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(false)} disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {tCommon("delete")}
                </Button>
              </div>
            </div>
          ) : !readOnly && (
            <div className="flex items-center justify-between gap-2">
              {task ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                >
                  <Trash2 className="size-4" />
                  {t("deleteTask")}
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={pending || !columnId || dateOrderInvalid}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {tCommon("save")}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
