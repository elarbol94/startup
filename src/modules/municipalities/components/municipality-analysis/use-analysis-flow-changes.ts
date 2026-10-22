"use client";

// React Flow's change handlers for the analysis editor: node moves, resizes, removals and selection,
// edge selection and removal, and connecting two blocks. Used by analysis-editor.tsx.
import { createId } from "@paralleldrive/cuid2";
import { useTranslations } from "next-intl";
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Connection, EdgeChange, NodeChange } from "@xyflow/react";
import { toast } from "sonner";
import {
  ANALYSIS_OPERATION_VERSION,
  analysisNodeHeight,
  analysisNodeWidth,
  wouldCreateAnalysisCycle,
  type MunicipalityAnalysisGraph,
  type MunicipalityAnalysisGraphOperation,
} from "../../analysis";
import type { AnalysisDisplayEdge, DisplayNode } from "./analysis-editor-types";

type ResizeDraft = { x?: number; y?: number; width?: number; height?: number };

export function useAnalysisFlowChanges({
  graphRef,
  commitOperations,
  setDragPositions,
  resizeDraftsRef,
  setResizeDrafts,
  selectedNodeIdsRef,
  setSelectedNodeIds,
  setSelectedEdgeIds,
}: {
  graphRef: RefObject<MunicipalityAnalysisGraph>;
  commitOperations: (operations: MunicipalityAnalysisGraphOperation[], options?: { debounceKey?: string; delay?: number; recordHistory?: boolean }) => boolean;
  setDragPositions: Dispatch<SetStateAction<Record<string, { x: number; y: number }> | null>>;
  resizeDraftsRef: RefObject<Record<string, ResizeDraft>>;
  setResizeDrafts: Dispatch<SetStateAction<Record<string, ResizeDraft>>>;
  selectedNodeIdsRef: RefObject<string[]>;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  setSelectedEdgeIds: Dispatch<SetStateAction<string[]>>;
}) {
  const t = useTranslations("municipalities");

  const onNodesChange = useCallback((changes: NodeChange<DisplayNode>[]) => {
    const resizeBatchIds = new Set(changes.flatMap((change) => change.type === "dimensions" && change.resizing !== undefined ? [change.id] : []));
    const selection = new Set(selectedNodeIdsRef.current);
    let selectionChanged = false;
    const updateResizeDraft = (id: string, draft: { x?: number; y?: number; width?: number; height?: number }) => {
      const next = { ...(resizeDraftsRef.current[id] ?? {}), ...draft };
      resizeDraftsRef.current = { ...resizeDraftsRef.current, [id]: next };
      setResizeDrafts(resizeDraftsRef.current);
      return next;
    };
    // Deleting or dropping a multiple selection arrives as one batch of changes. Committing
    // each one on its own would fill the undo stack with steps the reader never took, and
    // stack up a toast per node.
    const removedIds: string[] = [];
    const moves: Array<Extract<MunicipalityAnalysisGraphOperation, { type: "move-node" }>> = [];
    for (const change of changes) {
      if (change.type === "remove") {
        removedIds.push(change.id);
        selection.delete(change.id);
        selectionChanged = true;
      } else if (change.type === "position" && change.position) {
        const { id, position } = change;
        if (resizeBatchIds.has(id)) {
          updateResizeDraft(id, position);
          continue;
        }
        if (change.dragging) {
          setDragPositions((current) => ({ ...current, [id]: position }));
          continue;
        }
        setDragPositions(null);
        const current = graphRef.current.nodes.find((node) => node.id === id);
        if (current?.position.x === position.x && current.position.y === position.y) continue;
        moves.push({ version: ANALYSIS_OPERATION_VERSION, type: "move-node", nodeId: id, position });
      } else if (change.type === "dimensions" && change.dimensions && change.resizing !== undefined) {
        const draft = updateResizeDraft(change.id, change.dimensions);
        if (change.resizing === false) {
          const node = graphRef.current.nodes.find(({ id }) => id === change.id);
          if (node) {
            commitOperations([{
              version: ANALYSIS_OPERATION_VERSION,
              type: "resize-node",
              nodeId: change.id,
              position: { x: draft.x ?? node.position.x, y: draft.y ?? node.position.y },
              width: draft.width ?? analysisNodeWidth(node),
              height: draft.height ?? analysisNodeHeight(node),
            }]);
          }
          const remaining = { ...resizeDraftsRef.current };
          delete remaining[change.id];
          resizeDraftsRef.current = remaining;
          setResizeDrafts(remaining);
        }
      } else if (change.type === "select") {
        if (change.selected) selection.add(change.id);
        else selection.delete(change.id);
        selectionChanged = true;
      }
    }
    if (removedIds.length) {
      // Backspace/Delete removes nodes straight into the persisted graph, so the removal
      // has to be reversible: keep the nodes and their edges for the undo action.
      const removed = new Set(removedIds);
      const removedNodes = graphRef.current.nodes.filter(({ id }) => removed.has(id));
      const removedEdges = graphRef.current.edges.filter(({ source, target }) => removed.has(source) || removed.has(target));
      commitOperations(removedIds.map((nodeId) => ({ version: ANALYSIS_OPERATION_VERSION, type: "remove-node", nodeId })));
      if (removedNodes.length) {
        toast(t("analysisNodeRemoved", { count: removedNodes.length }), {
          action: {
            label: t("analysisUndo"),
            onClick: () => commitOperations([
              ...removedNodes.map((node): MunicipalityAnalysisGraphOperation => ({
                version: ANALYSIS_OPERATION_VERSION, type: "add-node", node,
              })),
              ...removedEdges.map((edge): MunicipalityAnalysisGraphOperation => ({
                version: ANALYSIS_OPERATION_VERSION, type: "add-edge", edge,
              })),
            ]),
          },
        });
      }
    }
    if (moves.length) commitOperations(moves, { debounceKey: `node-position:${moves.map(({ nodeId }) => nodeId).join(",")}`, delay: 500 });
    if (selectionChanged) {
      const ids = [...selection];
      selectedNodeIdsRef.current = ids;
      setSelectedNodeIds(ids);
      const primary = ids.at(-1) ?? null;
      if (primary !== graphRef.current.selectedNodeId) {
        commitOperations([{ version: ANALYSIS_OPERATION_VERSION, type: "set-selected-node", nodeId: primary }], { recordHistory: false });
      }
    }
  }, [commitOperations, graphRef, resizeDraftsRef, selectedNodeIdsRef, setDragPositions, setResizeDrafts, setSelectedNodeIds, t]);

  /**
   * Connections carry no selection of their own in the saved graph, so it is held here and
   * handed back to React Flow — which is what lets one be clicked and then deleted.
   */
  const onEdgesChange = useCallback((changes: EdgeChange<AnalysisDisplayEdge>[]) => {
    const removed = changes.flatMap((change) => change.type === "remove" ? [change.id] : []);
    if (removed.length) {
      commitOperations(removed.map((edgeId) => ({ version: ANALYSIS_OPERATION_VERSION, type: "remove-edge", edgeId })));
    }
    const selections = changes.filter((change) => change.type === "select");
    if (removed.length || selections.length) {
      setSelectedEdgeIds((current) => {
        const next = new Set(current.filter((id) => !removed.includes(id)));
        for (const change of selections) {
          if (change.selected) next.add(change.id);
          else next.delete(change.id);
        }
        return [...next];
      });
    }
  }, [commitOperations, setSelectedEdgeIds]);

  const connect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || (connection.targetHandle !== "a" && connection.targetHandle !== "b")) return;
    if (wouldCreateAnalysisCycle(graphRef.current.edges, connection.source, connection.target)) {
      toast.error(t("analysisCycleError"));
      return;
    }
    commitOperations([{
      version: ANALYSIS_OPERATION_VERSION,
      type: "add-edge",
      edge: { id: createId(), source: connection.source, target: connection.target, sourceHandle: "output", targetHandle: connection.targetHandle },
    }]);
  }, [commitOperations, graphRef, t]);

  return { onNodesChange, onEdgesChange, connect };
}
