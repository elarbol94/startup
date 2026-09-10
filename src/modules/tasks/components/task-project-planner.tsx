"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getContextualProjectSchedule } from "@/modules/projects/actions";
import type { PortfolioSchedule, PortfolioTask } from "@/modules/projects/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PortfolioClient = dynamic(() => import("@/modules/projects/components/portfolio-client").then((module) => module.PortfolioClient));

export function TaskProjectPlanner({
  projectId, projectName, title, startDate, dueDate, onDatesChange, onClose,
}: {
  projectId: string;
  projectName: string;
  title: string;
  startDate: string;
  dueDate: string;
  onDatesChange: (dates: { startDate: string; dueDate: string }) => void;
  onClose: () => void;
}) {
  const t = useTranslations("tasks.planner");
  const [schedule, setSchedule] = useState<PortfolioSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestId = useRef({ version: 0 });
  const refresh = useCallback(async () => {
    const current = ++requestId.current.version;
    setLoading(true);
    setError(false);
    try {
      const next = await getContextualProjectSchedule(projectId);
      if (current === requestId.current.version) setSchedule(next);
    } catch {
      if (current === requestId.current.version) setError(true);
    } finally {
      if (current === requestId.current.version) setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    const requests = requestId.current;
    const frame = requestAnimationFrame(() => void refresh());
    return () => { cancelAnimationFrame(frame); requests.version++; };
  }, [refresh]);

  const column = schedule?.columns.find((candidate) => candidate.projectId === projectId && !candidate.isCompleted);
  const draftTask: PortfolioTask = {
    id: "document-task-draft",
    projectId,
    parentTaskId: null,
    columnId: column?.id ?? "",
    columnName: column?.name ?? "",
    columnIsCompleted: false,
    title: t("draftTitle", { title: title.trim() || t("untitled") }),
    description: "",
    assigneeIds: [],
    assignees: [],
    assigneeName: null,
    startDate: startDate || null,
    dueDate: dueDate || null,
    progress: 0,
    isMilestone: false,
    constraintType: "asap",
    constraintDate: null,
    priority: "medium",
    sortOrder: Number.MAX_SAFE_INTEGER,
    updatedAt: new Date(0),
  };

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[94dvh] w-[96vw] max-w-[96vw] flex-col overflow-y-auto sm:max-w-[96vw]" data-testid="document-task-planner">
      <DialogHeader className="pr-8">
        <DialogTitle>{t("title", { project: projectName })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/40 p-3 dark:bg-indigo-950/20">
        <p className="min-w-40 flex-1 font-medium">{draftTask.title}</p>
        <div className="space-y-1"><Label htmlFor="draft-task-start">{t("startDate")}</Label><Input id="draft-task-start" type="date" value={startDate} onChange={(event) => {
          const next = event.target.value;
          onDatesChange({ startDate: next, dueDate: next && (!dueDate || dueDate < next) ? next : dueDate });
        }} /></div>
        <div className="space-y-1"><Label htmlFor="draft-task-end">{t("dueDate")}</Label><Input id="draft-task-end" type="date" min={startDate || undefined} value={dueDate} onChange={(event) => {
          const next = event.target.value;
          onDatesChange({ startDate: next ? startDate && startDate > next ? next : startDate : "", dueDate: next });
        }} /></div>
      </div>
      {loading && <p role="status">{t("loading")}</p>}
      {error && <div role="alert" className="flex items-center gap-3"><p>{t("loadError")}</p><Button variant="outline" onClick={() => void refresh()}>{t("retry")}</Button></div>}
      {schedule && !error && <div aria-busy={loading} className={loading ? "pointer-events-none opacity-60" : undefined} inert={loading}>
        <PortfolioClient schedule={schedule} projects={[]} embedded={{ projectId, draftTask, onDraftDatesChange: onDatesChange, onRefresh: refresh }} />
      </div>}
      <div className="flex justify-end"><Button onClick={onClose}>{t("back")}</Button></div>
    </DialogContent>
  </Dialog>;
}
