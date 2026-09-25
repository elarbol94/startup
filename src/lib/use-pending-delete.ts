"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createPendingDeleteQueue,
  PENDING_DELETE_DELAY_MS,
  type PendingDeleteCommit,
} from "@/lib/pending-delete";

/**
 * One queue per browser tab. It lives outside React so a pending delete keeps
 * running when the component that scheduled it unmounts (dialog closed,
 * client-side navigation) instead of being lost or committed early.
 *
 * When the tab is hidden or closed (`visibilitychange` → hidden, `pagehide`)
 * every pending delete is flushed at once. A delete can still be lost when the
 * browser kills the tab before the flushed server action request is sent
 * (hard kill, crash, power loss); the item then simply stays undeleted.
 */
const queue = createPendingDeleteQueue();
let flushListenersInstalled = false;

function installFlushListeners() {
  if (flushListenersInstalled || typeof window === "undefined") return;
  flushListenersInstalled = true;
  const flush = () => {
    if (queue.size() > 0) void queue.flush();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

const emptySet: ReadonlySet<string> = new Set();

/** Ids that are pending deletion and should be filtered out of the UI. */
export function usePendingDeleteIds(): ReadonlySet<string> {
  return useSyncExternalStore(queue.subscribe, queue.hiddenIds, () => emptySet);
}

/**
 * Returns `scheduleDelete`: hides `hiddenIds` now, shows the "Deleted" toast
 * with Undo and runs `commit` after the undo window. `commit` may return an
 * error message; on failure the ids reappear and an error toast is shown.
 */
export function usePendingDelete() {
  const tCommon = useTranslations("common");
  return useCallback(
    ({
      hiddenIds,
      commit,
      onCommitted,
    }: {
      hiddenIds: string[];
      commit: PendingDeleteCommit;
      onCommitted?: () => void;
    }) => {
      installFlushListeners();
      const toastId = `pending-delete-${hiddenIds[0] ?? ""}-${Date.now()}`;
      const key = queue.schedule({
        hiddenIds,
        commit,
        onCommitted,
        onError: (message) => toast.error(message ?? tCommon("error")),
      });
      toast.success(tCommon("deleted"), {
        id: toastId,
        duration: PENDING_DELETE_DELAY_MS,
        action: {
          label: tCommon("undo"),
          onClick: () => {
            queue.cancel(key);
          },
        },
      });
    },
    [tCommon],
  );
}
