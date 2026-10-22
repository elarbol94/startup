"use client";
// Restoring a saved revision over the live canvas: the pending edit is written first, the
// property editors unmounted, then the restored snapshot replaces the canvas and the
// collaboration document. Used by presentation-editor.tsx.
import { useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import type { useRouter } from "next/navigation";
import type { useTranslations } from "next-intl";
import * as Y from "yjs";
import { toast } from "sonner";
import { decode, REMOTE } from "../../collaboration/codec";
import type { useCollaborationContext } from "../../collaboration/ui";
import type { PresentationCanvasAction } from "../../lib/presentation";
import { restorePresentationRevision } from "../../presentation-actions";
import type { SaveState } from "./presentation-editor-utils";

export function usePresentationRestore({ updatedAt, flush, sessionId, collaboration, dispatch, paused: pausedRef, setRestoring, setSelectedIds, setActiveStepId, setStatus, onRestored, router, t }: {
  updatedAt: number;
  flush: () => Promise<boolean>;
  sessionId: string;
  collaboration: ReturnType<typeof useCollaborationContext>;
  dispatch: (action: PresentationCanvasAction) => void;
  paused: RefObject<boolean>;
  setRestoring: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setActiveStepId: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<Exclude<SaveState, "unsaved">>>;
  onRestored: () => void;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations<"wiki">>;
}) {
  const savedVersion = useRef(updatedAt);
  return async (revisionId: string) => {
    if (!confirm(t("presentations.restoreConfirm"))) return;
    pausedRef.current = true;
    setRestoring(revisionId);
    try {
      if (!await flush()) return;
      // Unmount rich-text property editors before replacing their shared content.
      flushSync(() => setSelectedIds([]));
      const restored = await restorePresentationRevision({ revisionId, sessionId, expectedUpdatedAt: savedVersion.current });
      if (collaboration && "collaboration" in restored && restored.collaboration) Y.applyUpdate(collaboration.doc, decode(restored.collaboration.update), REMOTE);
      savedVersion.current = restored.savedAt;
      dispatch({ type: "reset", snapshot: restored.snapshot });
      setSelectedIds([]);
      setActiveStepId(null);
      setStatus("saved");
      onRestored();
      router.refresh();
    } catch {
      toast.error(t("presentations.restoreFailed"));
    } finally {
      pausedRef.current = false;
      setRestoring(null);
    }
  };
}
