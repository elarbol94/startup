"use client";

// Moving/resizing a timed event from the week grid, with a conflict confirmation and an undo
// (toast action, or Ctrl/⌘+Z for a few seconds afterwards). Recurring events open the edit
// dialog instead, so the person can pick the occurrence scope. Used by calendar-client.tsx.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { moveCalendarEvent } from "../../actions";
import type { CalendarItem } from "../../types";
import type { CalendarConfirm } from "./use-calendar-confirm";

const UNDO_WINDOW_MS = 10_000;

type PendingUndo = { run: () => void; toastId: string | number; expiresAt: number };

export function useEventTimeChange({
  t,
  router,
  confirm,
  openRecurring,
}: {
  t: ReturnType<typeof useTranslations<"calendar">>;
  router: ReturnType<typeof useRouter>;
  confirm: CalendarConfirm;
  /** Opens the edit dialog for a recurring item already moved to the new time. */
  openRecurring: (item: CalendarItem) => void;
}) {
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const pendingRef = useRef<PendingUndo | null>(null);

  useEffect(() => {
    pendingRef.current = pendingUndo;
    if (!pendingUndo) return;
    const timer = window.setTimeout(() => setPendingUndo(null), Math.max(0, pendingUndo.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pendingUndo]);

  function offerUndo(item: CalendarItem, updatedAt: string) {
    const previous = { startAt: item.startAt!, endAt: item.endAt! };
    let used = false;
    const run = () => {
      if (used) return;
      used = true;
      setPendingUndo(null);
      toast.dismiss(toastId);
      // The original slot was valid a moment ago; a conflict there is accepted rather than asked again.
      void moveCalendarEvent({ id: item.sourceId, ...previous, expectedUpdatedAt: updatedAt, allowConflicts: true })
        .then(() => toast.success(t("coreMoveReverted")))
        .catch(() => toast.error(t("coreUndoFailed")))
        .finally(() => router.refresh());
    };
    const toastId = toast.success(t("coreMoved"), {
      duration: UNDO_WINDOW_MS,
      action: { label: t("undo"), onClick: run },
    });
    setPendingUndo({ run, toastId, expiresAt: Date.now() + UNDO_WINDOW_MS });
  }

  async function changeEventTime(item: CalendarItem, startAt: string, endAt: string) {
    if (!item.editable) return false;
    if (item.recurring) {
      openRecurring({ ...item, startAt, endAt });
      return false;
    }
    try {
      const input = { id: item.sourceId, startAt, endAt, expectedUpdatedAt: item.updatedAt };
      let result = await moveCalendarEvent(input);
      if (result.status === "conflict") {
        const accepted = await confirm({
          title: t("conflictTitle"),
          description: t("conflictDescription"),
          confirmLabel: t("saveAnyway"),
        });
        if (!accepted) return false;
        result = await moveCalendarEvent({ ...input, allowConflicts: true });
      }
      if (result.status === "saved" && item.startAt && item.endAt) offerUndo(item, result.updatedAt);
      router.refresh();
      return true;
    } catch {
      toast.error(t("timeChangeError"));
      return false;
    }
  }

  return {
    changeEventTime,
    canUndo: pendingUndo !== null,
    /** Runs the last undo if it is still within its time window. */
    undoLast: () => {
      const current = pendingRef.current;
      if (current && Date.now() < current.expiresAt) current.run();
    },
  };
}
