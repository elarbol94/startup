"use client";
// The header save state of the presentation editor: one source (the collaboration
// transport's pending/in-flight state plus the browser's connectivity). Used by presentation-editor.tsx.
import { useCallback, useSyncExternalStore } from "react";
import type { CollaborationClient } from "../../collaboration/provider";
import { presentationSaveState, type PresentationSaveInput, type PresentationSaveState } from "../../lib/presentation-save-state";

export function usePresentationSaveState(
  collaboration: CollaborationClient | null,
  { local, dirty, failed }: Pick<PresentationSaveInput, "local" | "dirty" | "failed">,
): PresentationSaveState {
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribe = collaboration?.subscribe(listener);
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => { unsubscribe?.(); window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
  }, [collaboration]);
  const derive = (online: boolean) => presentationSaveState({
    collaboration: collaboration && { status: collaboration.status, hasPendingChanges: collaboration.hasPendingChanges },
    online, local, dirty, failed,
  });
  return useSyncExternalStore(subscribe, () => derive(navigator.onLine), () => derive(true));
}
