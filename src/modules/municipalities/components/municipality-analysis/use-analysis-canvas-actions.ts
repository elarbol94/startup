"use client";

// What the palette, toolbar and inspector do to the canvas: adding operators, constants, notes and
// datasets, pinning a node, auto layout, arranging, resizing and deleting the selection.
// Used by analysis-editor.tsx.
import { createId } from "@paralleldrive/cuid2";
import { useTranslations } from "next-intl";
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useReactFlow, type Edge } from "@xyflow/react";
import { toast } from "sonner";
import {
  ANALYSIS_OPERATION_VERSION,
  analysisNodeHeight,
  analysisNodeWidth,
  datasetMunicipalityName,
  type AnalysisOperatorId,
  type MunicipalityAnalysisGraph,
  type MunicipalityAnalysisGraphOperation,
  type MunicipalityDatasetRef,
} from "../../analysis";
import { arrangeAnalysisNodes, autoLayoutAnalysisGraph, type AnalysisArrangeAction } from "../../analysis-layout";
import type { DisplayNode } from "./analysis-editor-types";

export function useAnalysisCanvasActions({
  graphRef,
  commitOperations,
  pointerFlowPosition,
  selectedNodeIdsRef,
  setSelectedNodeIds,
}: {
  graphRef: RefObject<MunicipalityAnalysisGraph>;
  commitOperations: (operations: MunicipalityAnalysisGraphOperation[], options?: { debounceKey?: string; delay?: number; recordHistory?: boolean }) => boolean;
  pointerFlowPosition: () => { x: number; y: number } | null;
  selectedNodeIdsRef: RefObject<string[]>;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
}) {
  const t = useTranslations("municipalities");
  const reactFlow = useReactFlow<DisplayNode, Edge>();

  /**
   * Pins the node to the graph's subject, or releases a pinned one. A node that arrived
   * from the map carries the municipality that was selected there; without this the
   * header can say "no municipality" while every node is about one.
   */
  const togglePin = useCallback((nodeId: string) => {
    const node = graphRef.current.nodes.find(({ id }) => id === nodeId);
    if (!node || node.type !== "dataset" || node.data.dataset.kind === "constant") return;
    const pinned = Boolean(datasetMunicipalityName(node.data.dataset));
    if (!pinned && !graphRef.current.subject) { toast.error(t("pinNodeNoSubject")); return; }
    commitOperations([{
      version: ANALYSIS_OPERATION_VERSION, type: "set-node-municipality", nodeId,
      municipality: pinned ? null : graphRef.current.subject,
    }]);
  }, [commitOperations, graphRef, t]);

  // Stable identities: the palette below is a hundred-odd catalog entries, and it must
  // not be rebuilt on every frame of a node drag just because a callback is new.
  const addOperator = useCallback((operator: AnalysisOperatorId, position?: { x: number; y: number }) => {
    if (graphRef.current.nodes.length >= 100) { toast.error(t("analysisNodeLimit")); return; }
    const id = createId();
    if (commitOperations([{
      version: ANALYSIS_OPERATION_VERSION,
      type: "add-node",
      node: { id, type: "operator", position: position ?? pointerFlowPosition() ?? { x: 360, y: 120 + graphRef.current.nodes.length * 30 }, data: { operator } },
    }])) {
      selectedNodeIdsRef.current = [id];
      setSelectedNodeIds([id]);
    }
  }, [commitOperations, graphRef, pointerFlowPosition, selectedNodeIdsRef, setSelectedNodeIds, t]);

  const addConstant = useCallback((position?: { x: number; y: number }) => {
    if (graphRef.current.nodes.length >= 100) { toast.error(t("analysisNodeLimit")); return; }
    const id = createId();
    if (commitOperations([{
      version: ANALYSIS_OPERATION_VERSION,
      type: "add-node",
      node: {
        id, type: "dataset",
        position: position ?? pointerFlowPosition() ?? { x: 360, y: 120 + graphRef.current.nodes.length * 30 },
        data: { dataset: { kind: "constant", value: 0 } },
      },
    }])) {
      selectedNodeIdsRef.current = [id];
      setSelectedNodeIds([id]);
    }
  }, [commitOperations, graphRef, pointerFlowPosition, selectedNodeIdsRef, setSelectedNodeIds, t]);

  const addAnnotation = useCallback((position?: { x: number; y: number }) => {
    if (graphRef.current.nodes.length >= 100) { toast.error(t("analysisNodeLimit")); return; }
    const id = createId();
    if (commitOperations([{
      version: ANALYSIS_OPERATION_VERSION,
      type: "add-node",
      node: {
        id,
        type: "annotation",
        position: position ?? pointerFlowPosition() ?? { x: 240, y: 160 + graphRef.current.nodes.length * 24 },
        data: { text: t("studioNotePlaceholder"), color: "sand" },
      },
    }])) {
      selectedNodeIdsRef.current = [id];
      setSelectedNodeIds([id]);
    }
  }, [commitOperations, graphRef, pointerFlowPosition, selectedNodeIdsRef, setSelectedNodeIds, t]);

  function applyNodePositions(positions: Record<string, { x: number; y: number }>) {
    const operations = Object.entries(positions).flatMap(([nodeId, position]): MunicipalityAnalysisGraphOperation[] => {
      const node = graphRef.current.nodes.find(({ id }) => id === nodeId);
      if (!node || (node.position.x === position.x && node.position.y === position.y)) return [];
      return [{ version: ANALYSIS_OPERATION_VERSION, type: "move-node", nodeId, position }];
    });
    if (operations.length) commitOperations(operations);
  }

  function autoLayout() {
    applyNodePositions(autoLayoutAnalysisGraph(graphRef.current));
    requestAnimationFrame(() => void reactFlow.fitView({ padding: 0.2, duration: 250 }));
  }

  function arrangeSelection(action: AnalysisArrangeAction) {
    applyNodePositions(arrangeAnalysisNodes(graphRef.current, selectedNodeIdsRef.current, action));
  }

  function resizeSelectedNode(size: { width?: number; height?: number }) {
    const node = selectedNodeIdsRef.current.length === 1
      ? graphRef.current.nodes.find(({ id }) => id === selectedNodeIdsRef.current[0])
      : null;
    if (!node) return;
    const width = size.width ?? analysisNodeWidth(node);
    const height = size.height ?? analysisNodeHeight(node);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    commitOperations([{
      version: ANALYSIS_OPERATION_VERSION,
      type: "resize-node",
      nodeId: node.id,
      position: node.position,
      width,
      height,
    }], { debounceKey: `node-size:${node.id}`, delay: 300 });
  }

  function deleteSelection() {
    const ids = [...selectedNodeIdsRef.current];
    if (!ids.length) return;
    commitOperations(ids.map((nodeId) => ({ version: ANALYSIS_OPERATION_VERSION, type: "remove-node", nodeId })));
    selectedNodeIdsRef.current = [];
    setSelectedNodeIds([]);
  }

  /**
   * Puts a catalog entry on the canvas. One operation for both catalogs: `add-kennzahl`
   * expands a derivation into real nodes and falls back to a single node for an
   * Ausgangsdatum, which is exactly the difference between the two lists.
   */
  const insertDataset = useCallback((request: { label: string; dataset: MunicipalityDatasetRef }, position?: { x: number; y: number }) => {
    const inserted = commitOperations([{
      version: ANALYSIS_OPERATION_VERSION, type: "add-kennzahl", nodeId: createId(), dataset: request.dataset, position,
    }]);
    if (inserted) toast.success(t("kennzahlInserted", { kennzahl: request.label }));
  }, [commitOperations, t]);

  return {
    togglePin, addOperator, addConstant, addAnnotation, insertDataset,
    autoLayout, arrangeSelection, resizeSelectedNode, deleteSelection,
  };
}
