// Reordering and reparenting rows in the work breakdown by grip drag or Alt+arrow keys,
// plus resetting all dependency routes. Used by portfolio-client.tsx.
"use client";

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { reorderProject } from "@/modules/projects/actions";
import { resetDependencyRoutes } from "@/modules/projects/dependency-actions";
import { reparentTask } from "@/modules/projects/task-actions";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import {
  planStructureMove,
  structureDropPlacement,
  type DropPlacement,
} from "@/modules/projects/structure";
import type { layoutDependencyRoutes } from "./dependency-geometry";
import { HEADER_HEIGHT } from "./portfolio-constants";
import type { DependencyDraft, Row, SetState } from "./portfolio-types";
import { scheduleErrorMessage } from "./schedule-error-message";

export function useStructureDrag({
  rows,
  effectiveSchedule,
  scrollRef,
  refreshSchedule,
  structurePending,
  setStructurePending,
  setExpandedProjects,
  setExpandedTasks,
  dependencyGeometries,
  setDependencyDraft,
}: Pick<ReturnType<typeof layoutDependencyRoutes>, "dependencyGeometries"> & {
  rows: Row[];
  effectiveSchedule: PortfolioSchedule;
  scrollRef: RefObject<HTMLDivElement | null>;
  refreshSchedule: () => Promise<void>;
  structurePending: boolean;
  setStructurePending: SetState<boolean>;
  setExpandedProjects: SetState<Set<string>>;
  setExpandedTasks: SetState<Set<string>>;
  setDependencyDraft: SetState<DependencyDraft | null>;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const [structureDrag, setStructureDrag] = useState<Row | null>(null);
  const [structureDrop, setStructureDrop] = useState<{ row: Row; placement: DropPlacement; valid: boolean } | null>(null);
  const structureGesture = useRef<{ source: Row; x: number; y: number; active: boolean; target: { row: Row; placement: DropPlacement; valid: boolean } | null } | null>(null);

  // An insertion after an expanded summary belongs below its entire subtree.
  const insertionIndicatorId = (() => {
    if (!structureDrop || structureDrop.placement !== "after") return structureDrop?.row.id;
    const target = structureDrop.row;
    let lastId = target.id;
    for (const candidate of rows.slice(rows.findIndex(row => row.id === target.id) + 1)) {
      if (candidate.kind === "project" || candidate.projectId !== target.projectId) break;
      if (target.kind !== "project" && (candidate.depth ?? 0) <= (target.depth ?? 0)) break;
      lastId = candidate.id;
    }
    return lastId;
  })();

  async function moveStructure(source: Row, target: Row, placement: DropPlacement) {
    if (structurePending) return;
    try {
      const move = planStructureMove(source, target, placement, effectiveSchedule.tasks, effectiveSchedule.projects.map(p => p.id), effectiveSchedule.dependencies);
      setStructurePending(true);
      if (move.kind === "project") await reorderProject(move);
      else {
        const result = await reparentTask(move);
        if (!result.ok) {
          toast.error(scheduleErrorMessage(t, result.code, "structure"));
          return;
        }
        setExpandedProjects(current => new Set([...current, source.projectId]));
        if (move.parentTaskId) setExpandedTasks(current => new Set([...current, move.parentTaskId!]));
      }
      await refreshSchedule();
      toast.success(t("structureMoved"));
    } catch {
      toast.error(t("structureInvalid"));
    } finally { setStructurePending(false); }
  }

  function beginStructureDrag(event: ReactPointerEvent<HTMLButtonElement>, row: Row) {
    if (event.button !== 0 || structurePending) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    structureGesture.current = { source: row, x: event.clientX, y: event.clientY, active: false, target: null };
  }
  function updateStructureDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = structureGesture.current;
    if (!gesture) return;
    if (!gesture.active && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) return;
    gesture.active = true;
    setStructureDrag(gesture.source);
    const container = scrollRef.current;
    if (container) {
      const bounds = container.getBoundingClientRect();
      if (event.clientY > bounds.bottom - 40) container.scrollTop += 16;
      if (event.clientY < bounds.top + HEADER_HEIGHT + 32) container.scrollTop -= 16;
    }
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-structure-row]");
    const target = rows.find(row => row.id === element?.dataset.structureRow);
    if (!element || !target) { gesture.target = null; setStructureDrop(null); return; }
    const bounds = element.getBoundingClientRect();
    const fraction = (event.clientY - bounds.top) / bounds.height;
    const placement = structureDropPlacement(gesture.source.kind, target.kind, fraction);
    let valid = true;
    try { planStructureMove(gesture.source, target, placement, effectiveSchedule.tasks, effectiveSchedule.projects.map(p => p.id), effectiveSchedule.dependencies); } catch { valid = false; }
    gesture.target = { row: target, placement, valid };
    setStructureDrop(gesture.target);
  }
  function endStructureDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (structureGesture.current?.active) updateStructureDrag(event);
    const gesture = structureGesture.current;
    structureGesture.current = null;
    setStructureDrag(null); setStructureDrop(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture?.active && gesture.target?.valid) void moveStructure(gesture.source, gesture.target.row, gesture.target.placement);
  }
  function cancelStructureDrag() { structureGesture.current = null; setStructureDrag(null); setStructureDrop(null); }
  function structureKey(event: ReactKeyboardEvent<HTMLButtonElement>, row: Row) {
    if (event.key === "Escape") { cancelStructureDrag(); return; }
    if (!event.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const siblings = rows.filter(r => row.kind === "project" ? r.kind === "project" : r.task && r.projectId === row.projectId && r.task.parentTaskId === row.task?.parentTaskId);
    const index = siblings.findIndex(r => r.id === row.id);
    if (event.key === "ArrowUp" && index > 0) void moveStructure(row, siblings[index - 1], "before");
    if (event.key === "ArrowDown" && siblings[index + 1]) void moveStructure(row, siblings[index + 1], "after");
    if (event.key === "ArrowRight" && row.task && index > 0) void moveStructure(row, siblings[index - 1], "inside");
    if (event.key === "ArrowLeft" && row.task?.parentTaskId) {
      const parent = rows.find(r => r.id === row.task!.parentTaskId);
      if (parent) void moveStructure(row, parent, "after");
    }
  }
  async function tidyDependencyLines() {
    try {
      setStructurePending(true);
      await resetDependencyRoutes({ ids: [...dependencyGeometries.keys()] });
      setDependencyDraft(null);
      await refreshSchedule();
      toast.success(t("routesTidied"));
    } catch { toast.error(tCommon("error")); }
    finally { setStructurePending(false); }
  }

  return {
    structureDrag, structureDrop, insertionIndicatorId, beginStructureDrag,
    updateStructureDrag, endStructureDrag, cancelStructureDrag, structureKey, tidyDependencyLines,
  };
}
