"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  moveDashboardTask,
  upsertContextualTask,
} from "@/modules/projects/contextual-task-actions";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayLocal } from "../deadline-utils";
import type { OverviewTask } from "./task-overview";

const stages = ["todo", "in_progress", "done"] as const;
type Stage = typeof stages[number];

function TaskCard({ task, pending, onEdit, onMove }: {
  task: OverviewTask; pending: boolean; onEdit: (task: OverviewTask) => void; onMove: (id: string, stage: Stage) => void;
}) {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: task.id, disabled: pending });
  const today = todayLocal(new Date());
  return <article ref={setNodeRef} data-task-card={task.id} className={`rounded-md border bg-card p-2.5 ${isDragging ? "opacity-30" : ""}`}>
    <div className="flex items-start gap-1">
      <button type="button" onClick={() => onEdit(task)} className={`min-w-0 flex-1 break-words text-left text-sm font-medium hover:underline ${task.boardStage === "done" ? "text-muted-foreground line-through" : ""}`}>{task.title}</button>
      <button type="button" {...attributes} {...listeners} aria-label={t("board.drag", { title: task.title })} className="-mr-1 grid min-h-7 min-w-7 touch-none place-items-center rounded text-muted-foreground hover:bg-muted" disabled={pending}><GripVertical className="size-3.5" /></button>
    </div>
    {task.projectName && <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.projectColor || undefined }} /><span className="truncate">{task.projectName}</span></p>}
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {task.assignees.slice(0, 3).map(person => <UserIdentity key={person.id} userId={person.id} name={person.name} avatarOnly compact />)}
      {task.assignees.length > 3 && <span title={task.assignees.slice(3).map(person => person.name).join(", ")} className="text-xs text-muted-foreground">+{task.assignees.length - 3}</span>}
      {task.dueDate && <time dateTime={task.dueDate} className={`text-[11px] ${task.boardStage !== "done" && task.dueDate < today ? "font-medium text-destructive" : "text-muted-foreground"}`}>{format.dateTime(new Date(`${task.dueDate}T12:00:00`), { day: "numeric", month: "short" })}</time>}
      {task.priority === "high" && <span className="rounded bg-destructive/10 px-1 text-[11px] font-medium text-destructive">{t("priorities.high")}</span>}
      <select aria-label={t("board.move", { title: task.title })} value={task.boardStage} disabled={pending} onChange={event => onMove(task.id, event.target.value as Stage)} className="ml-auto max-w-full rounded border-0 bg-transparent py-1 text-[11px] text-muted-foreground focus-visible:outline-2">
        {stages.map(stage => <option key={stage} value={stage}>{t(`board.${stage}`)}</option>)}
      </select>
    </div>
  </article>;
}

function BoardLane({ stage, tasks, pending, onEdit, onMove, onCreate }: {
  stage: Stage; tasks: OverviewTask[]; pending: boolean; onEdit: (task: OverviewTask) => void;
  onMove: (id: string, stage: Stage) => void; onCreate: (title: string, stage: Stage) => Promise<boolean>;
}) {
  const t = useTranslations("tasks");
  const common = useTranslations("common");
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const [expanded, setExpanded] = useState(stage !== "done");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  return <section ref={setNodeRef} aria-label={t(`board.${stage}`)} data-board-stage={stage} className={`flex min-w-[190px] flex-1 flex-col self-start rounded-lg p-2 ${isOver ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/45"}`}>
    <div className="mb-2 flex items-center gap-2 px-1">
      <button type="button" className="flex min-h-8 flex-1 items-center gap-1.5 text-left text-xs font-semibold" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}{t(`board.${stage}`)}<span className="ml-1 text-muted-foreground tabular-nums">{tasks.length}</span>
      </button>
      <Button variant="ghost" size="icon-sm" aria-label={t("board.addIn", { stage: t(`board.${stage}`) })} onClick={() => { setCreating(true); setExpanded(true); }}><Plus className="size-3.5" /></Button>
    </div>
    {expanded && <div className="flex flex-col gap-2">
      {tasks.map(task => <TaskCard key={task.id} task={task} pending={pending} onEdit={onEdit} onMove={onMove} />)}
      {!tasks.length && !creating && <p className="px-2 py-4 text-xs text-muted-foreground">{t("board.emptyColumn")}</p>}
      {creating ? <form onSubmit={async event => { event.preventDefault(); if (!title.trim() || pending) return; if (await onCreate(title.trim(), stage)) { setTitle(""); } }} className="space-y-1.5 rounded-md border bg-card p-2">
        <Input autoFocus aria-label={t("title")} placeholder={t("title")} value={title} maxLength={300} disabled={pending} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === "Escape" && !pending) { setCreating(false); setTitle(""); } }} />
        <div className="flex items-center justify-between gap-1"><Button type="submit" size="sm" disabled={pending || !title.trim()}>{t("createTask")}</Button><Button type="button" variant="ghost" size="icon-sm" aria-label={common("cancel")} disabled={pending} onClick={() => { setCreating(false); setTitle(""); }}><X /></Button></div>
      </form> : <button type="button" className="flex min-h-9 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setCreating(true)}><Plus className="size-3.5" />{t("createTask")}</button>}
    </div>}
  </section>;
}

export function TaskBoard({ tasks, onEdit, projectId, assigneeId, priority }: {
  tasks: OverviewTask[]; onEdit: (task: OverviewTask) => void; projectId: string | null; assigneeId: string | null; priority: "low" | "medium" | "high";
}) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticTasks, moveOptimistically] = useOptimistic(tasks, (rows, update: { id: string; stage: Stage }) => rows.map(task => task.id === update.id ? { ...task, boardStage: update.stage } : task));
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));
  function move(id: string, stage: Stage) {
    if (pending || tasks.find(task => task.id === id)?.boardStage === stage) return;
    startTransition(async () => {
      moveOptimistically({ id, stage });
      try { await moveDashboardTask({ taskId: id, stage }); router.refresh(); }
      catch { toast.error(t("board.moveFailed")); }
    });
  }
  async function create(title: string, stage: Stage): Promise<boolean> {
    return new Promise(resolve => startTransition(async () => {
      try {
        await upsertContextualTask({ title, projectId, assigneeIds: assigneeId ? [assigneeId] : [], priority, status: stage === "done" ? "done" : "open", workflowStage: stage === "in_progress" ? "in_progress" : "todo" });
        router.refresh(); toast.success(t("board.created")); resolve(true);
      } catch { toast.error(t("board.createFailed")); resolve(false); }
    }));
  }
  return <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={event => setActiveId(String(event.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={event => {
    setActiveId(null);
    if (event.over && stages.includes(event.over.id as Stage)) move(String(event.active.id), event.over.id as Stage);
  }}>
    <div className="min-h-0 flex-1 overflow-auto p-3" aria-busy={pending} data-testid="dashboard-task-board">
      <div className="flex min-h-full gap-2">
        {stages.map(stage => <BoardLane key={stage} stage={stage} tasks={optimisticTasks.filter(task => task.boardStage === stage)} pending={pending} onEdit={onEdit} onMove={move} onCreate={create} />)}
      </div>
    </div>
    <DragOverlay>{activeId && <div className="max-w-64 rounded-md border bg-card px-3 py-2 text-sm shadow-lg">{tasks.find(task => task.id === activeId)?.title}</div>}</DragOverlay>
  </DndContext>;
}
