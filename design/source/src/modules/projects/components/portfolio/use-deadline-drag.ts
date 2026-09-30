// Dragging and keyboard-moving contextual deadlines in the Gantt deadline lane, with a
// frame-throttled preview and undo toast. Used by portfolio-client.tsx.
"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { moveContextualDeadline } from "@/modules/projects/deadline-actions";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { DRAG_CLICK_THRESHOLD } from "./portfolio-constants";
import type { DeadlinePreview } from "./portfolio-types";
import { addCalendarDays, deadlineTimestampForDate } from "./portfolio-utils";
import { ScheduleCommitError, scheduleErrorMessage } from "./schedule-error-message";
import type { useDragClickGuard } from "./use-drag-click-guard";

export function useDeadlineDrag({
  dayWidth,
  dependencyCommitPending,
  dependencyEditorOpen,
  draggedRef,
  trackDragMovement,
  releaseDragFlag,
  refreshSchedule,
}: ReturnType<typeof useDragClickGuard> & {
  dayWidth: number;
  dependencyCommitPending: boolean;
  dependencyEditorOpen: boolean;
  refreshSchedule: () => Promise<void>;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const [deadlinePreview, setDeadlinePreview] = useState<DeadlinePreview | null>(null);
  const [deadlineCommitPending, setDeadlineCommitPending] = useState(false);
  const deadlineDragRef = useRef<{
    pointerId: number;
    deadline: PortfolioSchedule["deadlines"][number];
    startX: number;
    latestDate: string;
  } | null>(null);
  const deadlinePreviewFrameRef = useRef<number | null>(null);
  const pendingDeadlinePreviewRef = useRef<DeadlinePreview | null>(null);

  function cancelDeadlineDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = deadlineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    deadlineDragRef.current = null;
    pendingDeadlinePreviewRef.current = null;
    if (deadlinePreviewFrameRef.current !== null) {
      cancelAnimationFrame(deadlinePreviewFrameRef.current);
      deadlinePreviewFrameRef.current = null;
    }
    draggedRef.current = true;
    setDeadlinePreview(null);
    releaseDragFlag();
  }

  function queueDeadlinePreview(next: DeadlinePreview) {
    pendingDeadlinePreviewRef.current = next;
    if (deadlinePreviewFrameRef.current !== null) return;
    deadlinePreviewFrameRef.current = requestAnimationFrame(() => {
      deadlinePreviewFrameRef.current = null;
      const pending = pendingDeadlinePreviewRef.current;
      pendingDeadlinePreviewRef.current = null;
      if (pending) setDeadlinePreview(pending);
    });
  }

  function startDeadlineDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    deadline: PortfolioSchedule["deadlines"][number],
  ) {
    if (
      deadlineCommitPending ||
      dependencyCommitPending ||
      dependencyEditorOpen ||
      !deadline.dueDate
    ) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = false;
    deadlineDragRef.current = {
      pointerId: event.pointerId,
      deadline,
      startX: event.clientX,
      latestDate: deadline.dueDate,
    };
  }

  function moveDeadlineDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = deadlineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const movement = event.clientX - drag.startX;
    trackDragMovement(event.clientX, drag.startX);
    if (Math.abs(movement) <= DRAG_CLICK_THRESHOLD) return;
    const deadlineDate = addCalendarDays(
      drag.deadline.dueDate!,
      Math.round(movement / dayWidth),
    );
    drag.latestDate = deadlineDate;
    queueDeadlinePreview({
      id: drag.deadline.id,
      deadlineDate,
      deadlineAt: deadlineTimestampForDate(
        drag.deadline.deadlineAt,
        deadlineDate,
      ),
      updatedAt: drag.deadline.updatedAt,
    });
  }

  async function commitDeadlineMove(
    deadline: PortfolioSchedule["deadlines"][number],
    deadlineDate: string,
  ) {
    if (deadlineCommitPending) return;
    const next: DeadlinePreview = {
      id: deadline.id,
      deadlineDate,
      deadlineAt: deadlineTimestampForDate(deadline.deadlineAt, deadlineDate),
      updatedAt: deadline.updatedAt,
    };
    setDeadlinePreview(next);
    setDeadlineCommitPending(true);
    try {
      const result = await moveContextualDeadline({
        id: deadline.id,
        deadlineDate: next.deadlineDate,
        deadlineAt: next.deadlineAt,
        expectedUpdatedAt: deadline.updatedAt,
      });
      if (!result.ok) {
        setDeadlinePreview(null);
        toast.error(scheduleErrorMessage(t, result.code, "schedule"));
        return;
      }
      setDeadlinePreview({ id: deadline.id, ...result.current });
      await refreshSchedule();
      toast.success(t("scheduleSaved"), {
        action: {
          label: t("undo"),
          onClick: () => {
            void (async () => {
              try {
                setDeadlinePreview({ id: deadline.id, ...result.previous });
                const reverted = await moveContextualDeadline({
                  id: deadline.id,
                  deadlineDate: result.previous.deadlineDate,
                  deadlineAt: result.previous.deadlineAt,
                  expectedUpdatedAt: result.current.updatedAt,
                });
                if (!reverted.ok) throw new ScheduleCommitError(reverted.code);
                await refreshSchedule();
              } catch {
                setDeadlinePreview({ id: deadline.id, ...result.current });
                toast.error(t("undoUnavailable"));
              }
            })();
          },
        },
      });
    } catch {
      setDeadlinePreview(null);
      toast.error(tCommon("error"));
    } finally {
      setDeadlineCommitPending(false);
    }
  }

  function endDeadlineDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = deadlineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    deadlineDragRef.current = null;
    releaseDragFlag();
    if (drag.latestDate === drag.deadline.dueDate) {
      setDeadlinePreview(null);
      return;
    }
    void commitDeadlineMove(drag.deadline, drag.latestDate);
  }

  function handleDeadlineKey(
    event: React.KeyboardEvent<HTMLButtonElement>,
    deadline: PortfolioSchedule["deadlines"][number],
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (!deadline.dueDate) return;
    event.preventDefault();
    const offset =
      (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 7 : 1);
    void commitDeadlineMove(
      deadline,
      addCalendarDays(deadline.dueDate, offset),
    );
  }

  return {
    deadlinePreview, setDeadlinePreview, deadlinePreviewFrameRef, startDeadlineDrag, moveDeadlineDrag,
    endDeadlineDrag, cancelDeadlineDrag, handleDeadlineKey,
  };
}
