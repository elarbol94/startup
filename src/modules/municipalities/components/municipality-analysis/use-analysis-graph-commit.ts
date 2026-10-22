"use client";

// Committing edits to the analysis graph: applying a batch of operations optimistically and journaling
// it, the node edits built on that, and the undo/redo snapshot stacks. Used by analysis-editor.tsx.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useCallback, useRef, useState,
  type Dispatch, type RefObject, type SetStateAction, type TransitionStartFunction,
} from "react";
import { toast } from "sonner";
import { saveMunicipalityAnalysisGraph } from "../../actions";
import {
  ANALYSIS_OPERATION_VERSION,
  applyMunicipalityAnalysisGraphOperations,
  type AnalysisAnnotationColor,
  type MunicipalityAnalysisGraph,
  type MunicipalityAnalysisGraphOperation,
} from "../../analysis";
import { expandKennzahlIntoGraph } from "../../kennzahlen";
import { useMunicipalityAnalysisPersistence } from "../municipality-analysis-persistence-provider";
import type { AnalysisRecord } from "./analysis-editor-types";

/** How many edits back undo reaches. Each entry is a whole graph, capped at 100 nodes. */
const UNDO_DEPTH = 50;

export function useAnalysisGraphCommit({
  analysis,
  graphRef,
  setGraph,
  startTransition,
  setDragPositions,
  setResizeDrafts,
  selectedNodeIdsRef,
  setSelectedNodeIds,
}: {
  analysis: AnalysisRecord;
  graphRef: RefObject<MunicipalityAnalysisGraph>;
  setGraph: Dispatch<SetStateAction<MunicipalityAnalysisGraph>>;
  startTransition: TransitionStartFunction;
  setDragPositions: Dispatch<SetStateAction<Record<string, { x: number; y: number }> | null>>;
  setResizeDrafts: Dispatch<SetStateAction<Record<string, { x?: number; y?: number; width?: number; height?: number }>>>;
  selectedNodeIdsRef: RefObject<string[]>;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
}) {
  const t = useTranslations("municipalities");
  const router = useRouter();
  const { enqueue, flush, markApplied } = useMunicipalityAnalysisPersistence();
  // Undo restores a whole earlier graph rather than inverting operations, so this is a
  // bounded stack of snapshots. Selection and viewport are excluded: they would fill it
  // with entries that look like nothing happened.
  const undoStack = useRef<MunicipalityAnalysisGraph[]>([]);
  const redoStack = useRef<MunicipalityAnalysisGraph[]>([]);
  /** Set for the rest of the turn once a snapshot has been taken — see `commitOperations`. */
  const historyRecorded = useRef(false);
  const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 });

  const commitOperations = useCallback((
    operations: MunicipalityAnalysisGraphOperation[],
    options?: { debounceKey?: string; delay?: number; recordHistory?: boolean },
  ) => {
    try {
      const before = graphRef.current;
      const next = applyMunicipalityAnalysisGraphOperations(before, operations, expandKennzahlIntoGraph).graph;
      // One gesture is one step back, even when it reaches the graph as several commits.
      // Deleting a connected block is the case that needs this: React Flow reports the
      // removal of its connections first and the block itself after, both in the same
      // turn, and recording each separately left an undo that restored a block with its
      // connections silently missing.
      if ((options?.recordHistory ?? true) && operations.some(({ type }) => type !== "set-selected-node" && type !== "set-viewport")) {
        if (!historyRecorded.current) {
          undoStack.current = [...undoStack.current, before].slice(-UNDO_DEPTH);
          historyRecorded.current = true;
          queueMicrotask(() => { historyRecorded.current = false; });
        }
        redoStack.current = [];
        setHistoryDepth({ undo: undoStack.current.length, redo: 0 });
      }
      graphRef.current = next;
      setGraph(next);
      enqueue(analysis.id, operations, options);
      // Applied right here, so the queue never hands them back for a replay on top of
      // themselves — see `markApplied`.
      markApplied(analysis.id, operations);
      return true;
    } catch {
      toast.error(t("analysisNodeLimit"));
      return false;
    }
  }, [analysis.id, enqueue, graphRef, markApplied, setGraph, setHistoryDepth, t]);

  // Debounced: editing a constant is typing, and each keystroke should not become its own
  // entry in the operation journal.
  const setNodeValue = useCallback((nodeId: string, value: number) => {
    if (!Number.isFinite(value)) return;
    commitOperations(
      [{ version: ANALYSIS_OPERATION_VERSION, type: "set-node-value", nodeId, value }],
      { debounceKey: `node-value:${nodeId}`, delay: 400 },
    );
  }, [commitOperations]);

  const setNodeTitle = useCallback((nodeId: string, title: string | null) => {
    commitOperations([{
      version: ANALYSIS_OPERATION_VERSION,
      type: "set-node-title",
      nodeId,
      title,
    }]);
  }, [commitOperations]);

  const setAnnotation = useCallback((nodeId: string, text: string, color: AnalysisAnnotationColor) => {
    commitOperations([{
      version: ANALYSIS_OPERATION_VERSION,
      type: "set-annotation",
      nodeId,
      text,
      color,
    }], { debounceKey: `annotation:${nodeId}`, delay: 300 });
  }, [commitOperations]);

  /**
   * Undo restores the graph as it stood before the last edit and writes that whole graph,
   * rather than trying to invert each operation. The queue is drained first so a delayed
   * move cannot land on top of the restored state.
   */
  const undoLastEdit = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current = [...redoStack.current, graphRef.current].slice(-UNDO_DEPTH);
    setHistoryDepth({ undo: undoStack.current.length, redo: redoStack.current.length });
    graphRef.current = previous;
    setGraph(previous);
    setDragPositions(null);
    setResizeDrafts({});
    const selection = previous.selectedNodeId ? [previous.selectedNodeId] : [];
    selectedNodeIdsRef.current = selection;
    setSelectedNodeIds(selection);
    startTransition(async () => {
      await flush(analysis.id);
      await saveMunicipalityAnalysisGraph({ analysisId: analysis.id, graph: previous });
      toast(t("analysisUndone"));
      router.refresh();
    });
  }, [analysis.id, flush, graphRef, router, selectedNodeIdsRef, setDragPositions, setGraph, setHistoryDepth, setResizeDrafts, setSelectedNodeIds, startTransition, t]);

  const redoLastEdit = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current, graphRef.current].slice(-UNDO_DEPTH);
    setHistoryDepth({ undo: undoStack.current.length, redo: redoStack.current.length });
    graphRef.current = next;
    setGraph(next);
    setDragPositions(null);
    setResizeDrafts({});
    const selection = next.selectedNodeId ? [next.selectedNodeId] : [];
    selectedNodeIdsRef.current = selection;
    setSelectedNodeIds(selection);
    startTransition(async () => {
      await flush(analysis.id);
      await saveMunicipalityAnalysisGraph({ analysisId: analysis.id, graph: next });
      toast(t("analysisRedone"));
      router.refresh();
    });
  }, [analysis.id, flush, graphRef, router, selectedNodeIdsRef, setDragPositions, setGraph, setHistoryDepth, setResizeDrafts, setSelectedNodeIds, startTransition, t]);

  return { commitOperations, setNodeValue, setNodeTitle, setAnnotation, undoLastEdit, redoLastEdit, historyDepth };
}
