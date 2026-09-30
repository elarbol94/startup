// State and actions for editing dependencies on the timeline: linking source/hover, the
// selected draft, route-handle dragging/nudging and save/delete. Used by portfolio-client.tsx.
"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteTaskDependency, upsertTaskDependency } from "@/modules/projects/dependency-actions";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { dependencyTypeOf } from "@/modules/projects/schedule";
import { dependencyDraftIsInvalid } from "./dependency-utils";
import { ROW_HEIGHT } from "./portfolio-constants";
import type { DependencyDraft, PortfolioDependency } from "./portfolio-types";
import { scheduleErrorMessage } from "./schedule-error-message";

export function useDependencyEditor({
  schedule,
  refreshSchedule,
  dayWidthRef,
}: {
  schedule: PortfolioSchedule;
  refreshSchedule: () => Promise<void>;
  dayWidthRef: RefObject<number>;
}) {
  const t = useTranslations("projects");
  const [dependencySourceId, setDependencySourceId] = useState<string | null>(null);
  const [dependencyHoverId, setDependencyHoverId] = useState<string | null>(null);
  const [hoveredDependencyId, setHoveredDependencyId] = useState<string | null>(
    null,
  );
  const [dependencyDraft, setDependencyDraft] =
    useState<DependencyDraft | null>(null);
  const [dependencyEditorOpen, setDependencyEditorOpen] = useState(false);
  const [dependencyCommitPending, setDependencyCommitPending] = useState(false);
  const [dependencyRouteDragging, setDependencyRouteDragging] = useState<
    "x" | "y" | null
  >(null);
  const dependencyRouteDragRef = useRef<{
    pointerId: number;
    axis: "x" | "y";
    dependency: DependencyDraft;
    startX: number;
    startY: number;
    baseDays: number;
    baseRows: number;
    latestDays: number;
    latestRows: number;
    frame: number | null;
  } | null>(null);

  function openDependencyEditor(dependency: PortfolioDependency) {
    setDependencyDraft({
      ...dependency,
      dependencyType: dependencyTypeOf(dependency),
      isNew: dependency.id.startsWith("draft-"),
    });
    setDependencyEditorOpen(true);
    setHoveredDependencyId(null);
  }

  function selectDependency(dependency: PortfolioDependency) {
    if (
      dependencyDraft?.id === dependency.id &&
      !dependencyEditorOpen
    ) {
      setDependencyEditorOpen(true);
      return;
    }
    setDependencyDraft({
      ...dependency,
      dependencyType: dependencyTypeOf(dependency),
      isNew: dependency.id.startsWith("draft-"),
    });
    setDependencyEditorOpen(false);
    setHoveredDependencyId(null);
  }

  function cancelDependencyEditor() {
    if (dependencyCommitPending || dependencyRouteDragging) return;
    setDependencyDraft(null);
    setDependencyEditorOpen(false);
    setHoveredDependencyId(null);
  }

  async function persistDependencyRoute(
    dependency: DependencyDraft,
    routeOffsetDays: number,
    routeOffsetRows: number,
  ) {
    if (dependencyCommitPending || dependency.isNew) return;
    setDependencyCommitPending(true);
    try {
      const result = await upsertTaskDependency({
        id: dependency.id,
        predecessorTaskId: dependency.predecessorTaskId,
        successorTaskId: dependency.successorTaskId,
        dependencyType: dependency.dependencyType,
        lagDays: dependency.lagDays,
        routeOffsetDays,
        routeOffsetRows,
      });
      if (!result.ok) {
        setDependencyDraft(dependency);
        toast.error(t("dependencyRouteSaveError"));
        return;
      }
      const persisted = result.dependency;
      setDependencyDraft({
        ...persisted,
        dependencyType: dependencyTypeOf(persisted),
        isNew: false,
      });
      await refreshSchedule();
      toast.success(t("dependencyRouteSaved"));
    } catch {
      setDependencyDraft(dependency);
      toast.error(t("dependencyRouteSaveError"));
    } finally {
      setDependencyCommitPending(false);
    }
  }

  function beginDependencyRouteDrag(
    axis: "x" | "y",
    event: ReactPointerEvent<SVGGElement>,
  ) {
    if (
      !dependencyDraft ||
      dependencyDraft.isNew ||
      dependencyCommitPending
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dependencyRouteDragRef.current = {
      pointerId: event.pointerId,
      axis,
      dependency: dependencyDraft,
      startX: event.clientX,
      startY: event.clientY,
      baseDays: dependencyDraft.routeOffsetDays ?? 0,
      baseRows: dependencyDraft.routeOffsetRows ?? 0,
      latestDays: dependencyDraft.routeOffsetDays ?? 0,
      latestRows: dependencyDraft.routeOffsetRows ?? 0,
      frame: null,
    };
    setDependencyRouteDragging(axis);
  }

  function nudgeDependencyRoute(
    axis: "x" | "y",
    event: ReactKeyboardEvent<SVGGElement>,
  ) {
    if (
      !dependencyDraft ||
      dependencyDraft.isNew ||
      dependencyCommitPending
    ) {
      return;
    }
    const negative =
      axis === "x" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const positive =
      axis === "x" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!negative && !positive) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? (axis === "x" ? 7 : 4) : 1;
    const delta = negative ? -step : step;
    const nextDays =
      axis === "x"
        ? Math.max(
            -3650,
            Math.min(3650, (dependencyDraft.routeOffsetDays ?? 0) + delta),
          )
        : dependencyDraft.routeOffsetDays ?? 0;
    const nextRows =
      axis === "y"
        ? Math.max(
            -400,
            Math.min(400, (dependencyDraft.routeOffsetRows ?? 0) + delta),
          )
        : dependencyDraft.routeOffsetRows ?? 0;
    setDependencyDraft({
      ...dependencyDraft,
      routeOffsetDays: nextDays,
      routeOffsetRows: nextRows,
    });
    void persistDependencyRoute(dependencyDraft, nextDays, nextRows);
  }

  function updateDependencyRouteDrag(
    pointerId: number,
    clientX: number,
    clientY: number,
  ) {
    const drag = dependencyRouteDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    if (drag.axis === "x") {
      drag.latestDays = Math.max(
        -3650,
        Math.min(
          3650,
          drag.baseDays +
            Math.round((clientX - drag.startX) / dayWidthRef.current),
        ),
      );
    } else {
      drag.latestRows = Math.max(
        -400,
        Math.min(
          400,
          drag.baseRows +
            Math.round((clientY - drag.startY) / (ROW_HEIGHT / 4)),
        ),
      );
    }
    if (drag.frame !== null) return;
    drag.frame = requestAnimationFrame(() => {
      const latest = dependencyRouteDragRef.current;
      if (!latest) return;
      latest.frame = null;
      setDependencyDraft((current) =>
        current?.id === latest.dependency.id
          ? {
              ...current,
              routeOffsetDays: latest.latestDays,
              routeOffsetRows: latest.latestRows,
            }
          : current,
      );
    });
  }

  function completeDependencyRouteDrag(
    pointerId: number,
    cancelled = false,
  ) {
    const drag = dependencyRouteDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    if (drag.frame !== null) cancelAnimationFrame(drag.frame);
    dependencyRouteDragRef.current = null;
    setDependencyRouteDragging(null);
    if (cancelled) {
      setDependencyDraft(drag.dependency);
      return;
    }
    setDependencyDraft((current) =>
      current?.id === drag.dependency.id
        ? {
            ...current,
            routeOffsetDays: drag.latestDays,
            routeOffsetRows: drag.latestRows,
          }
        : current,
    );
    void persistDependencyRoute(
      drag.dependency,
      drag.latestDays,
      drag.latestRows,
    );
  }

  useEffect(() => {
    function moveDependencyRouteGlobally(event: PointerEvent) {
      if (!dependencyRouteDragRef.current) return;
      updateDependencyRouteDrag(
        event.pointerId,
        event.clientX,
        event.clientY,
      );
    }
    function finishDependencyRouteGlobally(event: PointerEvent) {
      if (!dependencyRouteDragRef.current) return;
      completeDependencyRouteDrag(
        event.pointerId,
        event.type === "pointercancel",
      );
    }
    window.addEventListener("pointermove", moveDependencyRouteGlobally);
    window.addEventListener("pointerup", finishDependencyRouteGlobally);
    window.addEventListener("pointercancel", finishDependencyRouteGlobally);
    return () => {
      window.removeEventListener("pointermove", moveDependencyRouteGlobally);
      window.removeEventListener("pointerup", finishDependencyRouteGlobally);
      window.removeEventListener(
        "pointercancel",
        finishDependencyRouteGlobally,
      );
    };
  });

  async function saveGraphicalDependency() {
    if (!dependencyDraft || dependencyCommitPending) return;
    if (
      dependencyDraftIsInvalid(
        schedule.tasks,
        schedule.dependencies,
        dependencyDraft,
      )
    ) {
      toast.error(t("dependencyInvalid"));
      return;
    }
    setDependencyCommitPending(true);
    try {
      const result = await upsertTaskDependency({
        id: dependencyDraft.isNew ? undefined : dependencyDraft.id,
        predecessorTaskId: dependencyDraft.predecessorTaskId,
        successorTaskId: dependencyDraft.successorTaskId,
        dependencyType: dependencyDraft.dependencyType,
        lagDays: dependencyDraft.lagDays,
        routeOffsetDays: dependencyDraft.routeOffsetDays,
        routeOffsetRows: dependencyDraft.routeOffsetRows,
      });
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "dependency"));
        return;
      }
      const persisted = result.dependency;
      setDependencyDraft({
        ...persisted,
        dependencyType: dependencyTypeOf(persisted),
        isNew: false,
      });
      setDependencyEditorOpen(false);
      await refreshSchedule();
      toast.success(t("dependencySaved"));
    } catch {
      toast.error(t("dependencySaveError"));
    } finally {
      setDependencyCommitPending(false);
    }
  }

  async function deleteGraphicalDependency() {
    if (
      !dependencyDraft ||
      dependencyDraft.isNew ||
      dependencyCommitPending
    ) {
      return;
    }
    setDependencyCommitPending(true);
    try {
      const result = await deleteTaskDependency(dependencyDraft.id);
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "dependency"));
        return;
      }
      setDependencyDraft(null);
      setDependencyEditorOpen(false);
      await refreshSchedule();
      toast.success(t("dependencyDeleted"));
    } catch {
      toast.error(t("dependencySaveError"));
    } finally {
      setDependencyCommitPending(false);
    }
  }

  return {
    dependencySourceId, setDependencySourceId, dependencyHoverId, setDependencyHoverId,
    hoveredDependencyId, setHoveredDependencyId, dependencyDraft, setDependencyDraft,
    dependencyEditorOpen, setDependencyEditorOpen, dependencyCommitPending, dependencyRouteDragging,
    openDependencyEditor, selectDependency, cancelDependencyEditor, beginDependencyRouteDrag,
    nudgeDependencyRoute, saveGraphicalDependency, deleteGraphicalDependency,
  };
}
