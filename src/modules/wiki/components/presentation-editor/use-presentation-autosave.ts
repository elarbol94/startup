"use client";
// Persistence of the presentation canvas: queued writes, flush-before-leaving, debounced
// autosave, save on exit, save status, presence and the viewer refresh. Used by presentation-editor.tsx.
import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import type { useCollaborationContext } from "../../collaboration/ui";
import type { PresentationCanvasAction, PresentationCanvasState } from "../../lib/presentation";
import type { PresentationRecord } from "../../presentation-queries";
import type { SaveState } from "./presentation-editor-utils";

const AUTOSAVE_DELAY = 1_200;

export function usePresentationAutosave({
  collaboration, canvas, readOnly, restoring, status, setStatus, paused, latest: latestRef, inFlight: inFlightRef, lastPersisted,
  selectedIds, canEdit, presentation, rawDispatch,
}: {
  collaboration: ReturnType<typeof useCollaborationContext>;
  canvas: PresentationCanvasState;
  readOnly: boolean;
  restoring: string | null;
  status: Exclude<SaveState, "unsaved">;
  setStatus: Dispatch<SetStateAction<Exclude<SaveState, "unsaved">>>;
  paused: RefObject<boolean>;
  latest: RefObject<{ canvas: PresentationCanvasState; readOnly: boolean }>;
  inFlight: RefObject<Promise<boolean> | null>;
  lastPersisted: RefObject<PresentationCanvasState | null>;
  selectedIds: string[];
  canEdit: boolean;
  presentation: PresentationRecord;
  rawDispatch: Dispatch<PresentationCanvasAction>;
}) {
  /** Writes one canvas and reports whether it reached the database. Writes queue behind
   * each other so a flush during a save cannot race the older canvas back over the newer. */
  const persist = useCallback(() => {
    const write = async () => {
      if (!collaboration) return true;
      const saved = await collaboration.flush();
      setStatus(saved ? "saved" : "error");
      return saved;
    };
    const next = write(); inFlightRef.current = next; return next;
  }, [collaboration, inFlightRef, setStatus]);

  /** Writes whatever is on the canvas right now, waiting for a save already in flight.
   * Used by every exit that would otherwise drop the pending debounce on the floor. Leaving
   * mid-save with nothing further edited can repeat that same write once, which is a wasted
   * request rather than a wrong one. */
  const flush = useCallback(async () => {
    // Commit the field that still has focus before taking the save snapshot.
    flushSync(() => {
      if (document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, select, [contenteditable=true]")) document.activeElement.blur();
    });
    await inFlightRef.current?.catch(() => false);
    const current = latestRef.current;
    if (!current.canvas.dirty) return collaboration ? collaboration.flush() : true;
    if (current.readOnly) return false;
    return persist();
  }, [persist, collaboration, inFlightRef, latestRef]);

  // Debounced autosave: every edit marks the canvas unsaved, and the last edit of a
  // burst is the one that writes.
  useEffect(() => {
    if (!canvas.dirty || canvas.failed || readOnly || restoring || status === "saving") return;
    const timer = setTimeout(() => { if (!paused.current) void persist(); }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [canvas, status, persist, readOnly, restoring, paused]);

  // Re-pointed after every commit, so the exits above see the canvas as it is now.
  useEffect(() => {
    latestRef.current = { canvas, readOnly };
  });

  // Browser back can hide the route's Activity boundary without a link click. The fixed
  // endpoint remains usable after navigation. Use the same queue and saved bookkeeping
  // so returning to a preserved editor does not retry an already-saved canvas.
  useEffect(() => () => {
    const saveOnExit = async () => {
      await inFlightRef.current;
      const current = latestRef.current;
      if (paused.current || current.readOnly || !current.canvas.dirty || current.canvas === lastPersisted.current) return;
      await persist();
    };
    void saveOnExit().catch(() => undefined);
  }, [persist, inFlightRef, lastPersisted, latestRef, paused]);

  useEffect(() => {
    if (!collaboration) return;
    const update = () => {
      setStatus(collaboration.status === "saved" ? "saved" : collaboration.status === "saving" ? "saving" : "error");
    };
    const unsubscribe = collaboration.subscribe(update);
    return unsubscribe;
  }, [collaboration, setStatus]);
  useEffect(() => { collaboration?.setPresence({ selectedIds }); }, [collaboration, selectedIds]);
  // Viewers continue using the redacted read API: shared state contains speaker notes.
  useEffect(() => {
    if (canEdit) return;
    const timer = setInterval(() => {
      void fetch(`/api/wiki/presentations/${presentation.id}`, { cache: "no-store" }).then(async response => {
        if (response.ok) rawDispatch({ type: "reset", snapshot: await response.json() });
      }).catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [canEdit, presentation.id, rawDispatch]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const draft = document.activeElement;
      const editing = draft instanceof HTMLInputElement || draft instanceof HTMLTextAreaElement;
      if (!latestRef.current.canvas.dirty && status !== "saving" && !editing) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [canvas.dirty, status, latestRef]);

  return { persist, flush };
}
