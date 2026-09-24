"use client";

// The node-graph analysis editor: graph state, undo/redo, React Flow wiring and the studio layout.
// Used by municipality-analysis-client.tsx inside a ReactFlowProvider.
import { createId } from "@paralleldrive/cuid2";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Background,
  MiniMap,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  SelectionMode,
  type Viewport,
  useReactFlow,
} from "@xyflow/react";
import {
  BarChart3, Loader2, MapPin, Maximize2, Menu,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil, Plus,
  Redo2, Save, SlidersHorizontal, Trash2, Undo2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  renameMunicipalityAnalysis,
  saveMunicipalityAnalysisGraph,
} from "../../actions";
import {
  municipalityDatasetRefSchema,
  ANALYSIS_OPERATION_VERSION,
  analysisNodeHeight,
  analysisNodeWidth,
  analysisOperatorIds,
  applyMunicipalityAnalysisGraphOperations,
  datasetMunicipalityName,
  wouldCreateAnalysisCycle,
  type AnalysisOperatorId,
  type AnalysisAnnotationColor,
  type MunicipalityAnalysisData,
  type MunicipalityAnalysisGraph,
  type MunicipalityAnalysisGraphOperation,
  type MunicipalityDatasetRef,
} from "../../analysis";
import { arrangeAnalysisNodes, autoLayoutAnalysisGraph, type AnalysisArrangeAction } from "../../analysis-layout";
import { loadMunicipalityAnalysisData } from "../../analysis-data";
import {
  buildKennzahlGraph,
  expandKennzahlIntoGraph,
} from "../../kennzahlen";
import type { MunicipalityAnalysisSummary, MunicipalityMetricRecord } from "../../queries";
import { useMunicipalityAnalysisPersistence } from "../municipality-analysis-persistence-provider";
import { CONSTANT_DRAG_VALUE, DATASET_DRAG_TYPE, OPERATOR_DRAG_TYPE } from "./analysis-editor-constants";
import { DeleteAnalysisDialog, SaveAsKennzahlDialog } from "./analysis-editor-dialogs";
import type { AnalysisDisplayEdge, AnalysisRecord, DisplayNode } from "./analysis-editor-types";
import { AnalysisInspectorPanel } from "./analysis-inspector-panel";
import { analysisOptionLabel, datasetTitle } from "./analysis-labels";
import { edgeTypes, nodeTypes } from "./analysis-node-card";
import { AnalysisQuickAddDialog } from "./analysis-quick-add-dialog";
import { MunicipalityPicker } from "./municipality-picker";
import { StudioPalette } from "./studio-palette";
import { useAnalysisDisplayGraph } from "./use-analysis-display-graph";
import { useAnalysisShortcuts } from "./use-analysis-shortcuts";

/** How many edits back undo reaches. Each entry is a whole graph, capped at 100 nodes. */
const UNDO_DEPTH = 50;
// The node card is w-52 and roughly this tall — enough to tell whether a restored
// viewport still shows anything, which is all these are used for.
const NODE_WIDTH = 208;
const NODE_HEIGHT = 150;

export function AnalysisEditor({ analysis, analyses, metrics }: { analysis: AnalysisRecord; analyses: MunicipalityAnalysisSummary[]; metrics: MunicipalityMetricRecord[] }) {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const router = useRouter();
  const reactFlow = useReactFlow<DisplayNode, Edge>();
  const { enqueue, flush, getPendingOperations, getSaveState, markApplied } = useMunicipalityAnalysisPersistence();
  const optimisticOperations = getPendingOperations(analysis.id);
  const [graph, setGraph] = useState(analysis.graph);
  const graphRef = useRef(graph);
  const [data, setData] = useState<MunicipalityAnalysisData | null>(null);
  const [dataError, setDataError] = useState(false);
  const saveState = getSaveState(analysis.id);
  const [name, setName] = useState(analysis.name);
  const [renaming, setRenaming] = useState(false);
  // A drag streams a position per frame. Committing each one would clone the graph and
  // re-evaluate every series mid-drag, so the live positions stay local until the drop.
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }> | null>(null);
  const [resizeDrafts, setResizeDrafts] = useState<Record<string, { x?: number; y?: number; width?: number; height?: number }>>({});
  const resizeDraftsRef = useRef(resizeDrafts);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(analysis.graph.selectedNodeId ? [analysis.graph.selectedNodeId] : []);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  // Which connection is selected is not worth persisting, but it has to reach React Flow:
  // the delete key removes the edges its store has marked selected, and with a controlled
  // edge list nothing marks them unless the selection change is applied here.
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [paletteSheetOpen, setPaletteSheetOpen] = useState(false);
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savingMetric, setSavingMetric] = useState(false);
  const [metricName, setMetricName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);
  /** Where a new block lands: the last place the pointer was over the canvas. */
  const pointerFlowPosition = useCallback(
    () => lastPointerPosition.current ? reactFlow.screenToFlowPosition(lastPointerPosition.current) : null,
    [reactFlow],
  );
  // Undo restores a whole earlier graph rather than inverting operations, so this is a
  // bounded stack of snapshots. Selection and viewport are excluded: they would fill it
  // with entries that look like nothing happened.
  const undoStack = useRef<MunicipalityAnalysisGraph[]>([]);
  const redoStack = useRef<MunicipalityAnalysisGraph[]>([]);
  /** Set for the rest of the turn once a snapshot has been taken — see `commitOperations`. */
  const historyRecorded = useRef(false);
  const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 });
  const datasetSignature = useMemo(() => JSON.stringify(graph.nodes.flatMap((node) => node.type === "dataset" ? [node.data.dataset] : [])), [graph.nodes]);
  const optimisticSignature = JSON.stringify(optimisticOperations);

  useEffect(() => {
    let cancelled = false;
    loadMunicipalityAnalysisData(graph).then((result) => { if (!cancelled) { setDataError(false); setData(result); } }).catch(() => { if (!cancelled) setDataError(true); });
    return () => { cancelled = true; };
    // Positions and selections do not change which data files are required.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetSignature]);

  /**
   * Operations can also be enqueued from outside this editor: dropping a dataset on the
   * analysis tab queues it and then navigates here. Applying whatever is still unconfirmed
   * shows it immediately instead of waiting for the next server round trip.
   */
  useEffect(() => {
    if (!optimisticOperations.length) return;
    const next = applyMunicipalityAnalysisGraphOperations(graphRef.current, optimisticOperations, expandKennzahlIntoGraph).graph;
    graphRef.current = next;
    setGraph(next);
    markApplied(analysis.id, optimisticOperations);
    // The signature changes only when the operation journal does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimisticSignature]);

  /**
   * A stored viewport can end up pointing at empty canvas — nodes were moved, or the
   * window is a different size than when it was saved. React Flow only fits the view for
   * an empty graph, which would leave a graph that does have nodes looking like it has
   * none, with nothing on screen to say otherwise.
   */
  useEffect(() => {
    // After paint: before it the canvas has no size, and a zero-sized viewport contains no
    // node — which would discard a perfectly good stored viewport on every load.
    const frame = requestAnimationFrame(() => {
      const container = flowRef.current;
      const { nodes, viewport } = graphRef.current;
      if (!container?.clientWidth || !container.clientHeight || !nodes.length) return;
      const left = -viewport.x / viewport.zoom;
      const top = -viewport.y / viewport.zoom;
      const right = left + container.clientWidth / viewport.zoom;
      const bottom = top + container.clientHeight / viewport.zoom;
      const anyVisible = nodes.some(({ position }) => position.x < right && position.x + NODE_WIDTH > left
        && position.y < bottom && position.y + NODE_HEIGHT > top);
      if (!anyVisible) void reactFlow.fitView();
    });
    return () => cancelAnimationFrame(frame);
  }, [reactFlow]);

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
  }, [analysis.id, enqueue, markApplied, setGraph, setHistoryDepth, t]);

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
  }, [analysis.id, flush, router, setDragPositions, setGraph, setHistoryDepth, setResizeDrafts, setSelectedNodeIds, startTransition, t]);

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
  }, [analysis.id, flush, router, setDragPositions, setGraph, setHistoryDepth, setResizeDrafts, setSelectedNodeIds, startTransition, t]);

  const { quickAddOpen, setQuickAddOpen } = useAnalysisShortcuts({ undoLastEdit, redoLastEdit });

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
  }, [commitOperations, t]);

  const {
    results, positionedNodes, displayEdges,
  } = useAnalysisDisplayGraph({
    graph, data, selectedNodeIds, selectedEdgeIds, dragPositions, resizeDrafts, setAnnotation,
    setNodeTitle, setNodeValue, togglePin,
  });
  const selectedNode = selectedNodeIds.length === 1 ? graph.nodes.find(({ id }) => id === selectedNodeIds[0]) ?? null : null;
  const selectedSeries = selectedNode ? results.get(selectedNode.id) ?? null : null;
  const selectedTechnicalTitle = selectedNode?.type === "dataset" ? datasetTitle(selectedNode.data.dataset, t, tf)
    : selectedNode?.type === "operator" ? t(`operator_${selectedNode.data.operator}`)
      : selectedNode?.type === "annotation" ? t("studioNote") : t("analysisNoResultSelected");
  const selectedTitle = selectedNode && selectedNode.type !== "annotation" ? selectedNode.data.alias ?? selectedTechnicalTitle : selectedTechnicalTitle;

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
  }, [commitOperations, setDragPositions, setResizeDrafts, setSelectedNodeIds, t]);

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
  }, [commitOperations, t]);

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
  }, [commitOperations, pointerFlowPosition, setSelectedNodeIds, t]);

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
  }, [commitOperations, pointerFlowPosition, setSelectedNodeIds, t]);

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
  }, [commitOperations, pointerFlowPosition, setSelectedNodeIds, t]);

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

  function commitRename() {
    if (!name.trim() || name.trim() === analysis.name) { setName(analysis.name); setRenaming(false); return; }
    startTransition(async () => {
      await renameMunicipalityAnalysis({ analysisId: analysis.id, name });
      setRenaming(false);
      router.refresh();
    });
  }

  // Held across renders: dragging a node re-renders this editor on every frame, and the
  // library it holds is the whole Ausgangsdaten and Kennzahlen catalog.
  const addConstantAtPointer = useCallback(() => addConstant(), [addConstant]);
  const addAnnotationAtPointer = useCallback(() => addAnnotation(), [addAnnotation]);
  const palettePanel = useMemo(() => (
    <StudioPalette
      metrics={metrics}
      onOperator={addOperator}
      onConstant={addConstantAtPointer}
      onAnnotation={addAnnotationAtPointer}
      onDataset={insertDataset}
    />
  ), [addAnnotationAtPointer, addConstantAtPointer, addOperator, insertDataset, metrics]);

  const inspectorPanel = (
    <AnalysisInspectorPanel
      selectedNodeIds={selectedNodeIds}
      selectedNode={selectedNode}
      selectedTitle={selectedTitle}
      selectedTechnicalTitle={selectedTechnicalTitle}
      selectedSeries={selectedSeries}
      data={data}
      dataError={dataError}
      pending={pending}
      arrangeSelection={arrangeSelection}
      deleteSelection={deleteSelection}
      resizeSelectedNode={resizeSelectedNode}
      commitOperations={commitOperations}
      setNodeTitle={setNodeTitle}
      setAnnotation={setAnnotation}
      togglePin={togglePin}
      setMetricName={setMetricName}
      setSavingMetric={setSavingMetric}
    />
  );

  return (
    <div className="flex min-h-[42rem] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm lg:h-[calc(100vh-10.5rem)]" data-analysis-editor data-testid="municipality-analysis-editor">
      <header className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <select id="analysis-switcher" className="h-8 max-w-52 rounded-lg border bg-background px-2 text-xs" value={analysis.id} aria-label={t("savedAnalyses")} onChange={(event) => router.push(`/municipalities/analysis?analysis=${encodeURIComponent(event.target.value)}`)}>
          {analyses.map((item) => <option key={item.id} value={item.id}>{analysisOptionLabel(item, t)}</option>)}
        </select>
        <div className="min-w-32 flex-1">
          <div className="min-w-0 flex-1">
            {renaming ? <Input className="h-8 max-w-xs text-sm" value={name} maxLength={120} autoFocus onValueChange={(value) => setName(value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === "Enter") commitRename(); if (event.key === "Escape") { setName(analysis.name); setRenaming(false); } }} /> : (
              <button className="flex max-w-full items-center gap-1.5 text-left" onClick={() => setRenaming(true)}>
                <span className="truncate text-sm font-semibold">{analysis.name}</span><Pencil className="size-3 shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-32 truncate text-[11px] font-medium" data-testid="analysis-subject">{graph.subject?.municipalityName ?? t("analysisSubjectNone")}</span>
          <div className="w-36"><MunicipalityPicker compact label={t("analysisSubject")} placeholder={t("kennzahlMunicipalityPlaceholder")} onPick={(item) => commitOperations([{ version: ANALYSIS_OPERATION_VERSION, type: "set-subject", subject: { municipalityCode: item.municipalityCode, municipalityName: item.name } }])} /></div>
        </div>
        <span className={cn("flex items-center gap-1 text-[11px]", saveState === "error" ? "text-destructive" : "text-muted-foreground")}><Save className="size-3.5" />{t(saveState === "saving" ? "analysisSaving" : saveState === "error" ? "analysisSaveError" : "analysisSaved")}</span>
        <Button variant="ghost" size="icon-sm" className="text-destructive" disabled={pending} aria-label={t("deleteAnalysis")} onClick={() => setDeleting(true)}><Trash2 className="size-3.5" /></Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={cn("hidden min-h-0 shrink-0 border-r bg-muted/10 transition-[width] lg:flex lg:flex-col", paletteCollapsed ? "w-11 p-1" : "w-64 p-3")}>
          <div className="mb-2 flex items-center justify-between">
            {!paletteCollapsed && <h2 className="text-xs font-semibold tracking-wide uppercase">{t("studioLibrary")}</h2>}
            <Button variant="ghost" size="icon-sm" className={cn(paletteCollapsed && "mx-auto")} aria-label={paletteCollapsed ? t("studioOpenPalette") : t("studioClosePalette")} onClick={() => setPaletteCollapsed((value) => !value)}>{paletteCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</Button>
          </div>
          {!paletteCollapsed && palettePanel}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-muted/20">
          <div className="flex flex-wrap items-center gap-1 border-b bg-background px-2 py-1.5">
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setPaletteSheetOpen(true)}><Menu className="size-3.5" />{t("studioLibrary")}</Button>
            <Button variant="outline" size="sm" onClick={() => setQuickAddOpen(true)}><Plus className="size-3.5" />{t("studioQuickAdd")}<span className="ml-2 hidden rounded border px-1 text-[9px] text-muted-foreground sm:inline">⇧ ⇧ · Ctrl/⌘K</span></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="icon-sm" aria-label={t("analysisUndo")} title={t("analysisUndo")} disabled={!historyDepth.undo} onClick={undoLastEdit}><Undo2 className="size-3.5" /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("studioRedo")} title={t("studioRedo")} disabled={!historyDepth.redo} onClick={redoLastEdit}><Redo2 className="size-3.5" /></Button>
            <Button variant="ghost" size="sm" onClick={autoLayout}><WandSparkles className="size-3.5" />{t("studioAutoLayout")}</Button>
            <Button variant="ghost" size="sm" onClick={() => void reactFlow.fitView({ padding: 0.2, duration: 250 })}><Maximize2 className="size-3.5" />{t("studioFit")}</Button>
            {selectedNodeIds.length > 1 && <span className="ml-auto rounded-full bg-teal-100 px-2 py-1 text-[10px] font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-200">{t("studioSelectionCount", { count: selectedNodeIds.length })}</span>}
            <Button variant="outline" size="sm" className="ml-auto lg:hidden" onClick={() => setInspectorSheetOpen(true)}><SlidersHorizontal className="size-3.5" />{t("studioInspector")}</Button>
          </div>
          <div
            className="relative min-h-0 flex-1"
            ref={flowRef}
            // Only the screen coordinates are kept. Converting them here would measure the
            // canvas on every pointer move, interleaved with the transforms React Flow
            // writes during a drag, which is a forced layout per frame for a number that is
            // read at most once, when a block is placed.
            onPointerMove={(event) => { lastPointerPosition.current = { x: event.clientX, y: event.clientY }; }}
          >
            <ReactFlow
              nodes={positionedNodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={connect}
              onMoveEnd={(_, viewport: Viewport) => { const current = graphRef.current.viewport; if (current.x !== viewport.x || current.y !== viewport.y || current.zoom !== viewport.zoom) commitOperations([{ version: ANALYSIS_OPERATION_VERSION, type: "set-viewport", viewport }], { debounceKey: "viewport", delay: 500, recordHistory: false }); }}
              defaultViewport={graph.viewport}
              minZoom={0.2}
              maxZoom={2}
              fitView={!graph.nodes.length}
              deleteKeyCode={["Backspace", "Delete"]}
              // Dragging the empty canvas pans it, which React Flow takes as reason enough
              // to ignore `selectionOnDrag` entirely — it was never in effect. Holding
              // shift while dragging draws the selection box instead, and partial mode
              // means a card only has to be touched by it, not enclosed.
              selectionMode={SelectionMode.Partial}
              onPaneClick={() => { selectedNodeIdsRef.current = []; setSelectedNodeIds([]); if (graphRef.current.selectedNodeId) commitOperations([{ version: ANALYSIS_OPERATION_VERSION, type: "set-selected-node", nodeId: null }], { recordHistory: false }); }}
              onDragOver={(event) => { if (event.dataTransfer.types.includes(OPERATOR_DRAG_TYPE) || event.dataTransfer.types.includes(DATASET_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
              onDrop={(event) => { event.preventDefault(); const payload = event.dataTransfer.getData(OPERATOR_DRAG_TYPE); const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }); const datasetPayload = event.dataTransfer.getData(DATASET_DRAG_TYPE); if (datasetPayload) { try { const request = JSON.parse(datasetPayload); if (typeof request.metricId === "string") { const metric = metrics.find(item => item.id === request.metricId); if (!metric) return; const built = buildKennzahlGraph(metric.expression, graphRef.current.subject, position); commitOperations([...built.nodes.map(node => ({ version: 1 as const, type: "add-node" as const, node })), ...built.edges.map(edge => ({ version: 1 as const, type: "add-edge" as const, edge }))]); return; } const dataset = municipalityDatasetRefSchema.parse(request.dataset); insertDataset({ label: String(request.label).slice(0, 160), dataset }, position); } catch { /* Ignore invalid external drag payloads. */ } return; } if (payload === "annotation") addAnnotation(position); else if (payload === CONSTANT_DRAG_VALUE) addConstant(position); else if (analysisOperatorIds.includes(payload as AnalysisOperatorId)) addOperator(payload as AnalysisOperatorId, position); }}
            >
              <Background gap={20} size={1} />
              <Controls position="bottom-left" showInteractive={false} />
              {graph.nodes.length > 4 && <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.type === "operator" ? "#8b5cf6" : node.type === "annotation" ? "#f59e0b" : "#0d9488"} maskColor="rgb(15 23 42 / 0.08)" />}
            </ReactFlow>
            {!graph.nodes.length && <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center"><div><BarChart3 className="mx-auto size-8 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">{t("emptyAnalysisTitle")}</p><p className="mt-1 max-w-xs text-xs text-muted-foreground">{t("studioEmptyDescription")}</p></div></div>}
            {!data && !dataError && graph.nodes.some(({ type }) => type !== "annotation") && <div className="pointer-events-none absolute inset-x-0 top-2 grid place-items-center" role="status"><span className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1 text-xs shadow-sm backdrop-blur"><Loader2 className="size-3.5 animate-spin" />{t("analysisDataLoading")}</span></div>}
          </div>
        </section>

        <aside className={cn("hidden min-h-0 shrink-0 border-l bg-background transition-[width] lg:flex lg:flex-col", inspectorCollapsed ? "w-11 p-1" : "w-72 p-3")}>
          <div className="mb-2 flex items-center justify-between">
            {!inspectorCollapsed && <h2 className="text-xs font-semibold tracking-wide uppercase">{t("studioInspector")}</h2>}
            <Button variant="ghost" size="icon-sm" className={cn(inspectorCollapsed && "mx-auto")} aria-label={inspectorCollapsed ? t("studioOpenInspector") : t("studioCloseInspector")} onClick={() => setInspectorCollapsed((value) => !value)}>{inspectorCollapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}</Button>
          </div>
          {!inspectorCollapsed && inspectorPanel}
        </aside>
      </div>

      <Sheet open={paletteSheetOpen} onOpenChange={setPaletteSheetOpen}><SheetContent side="left" className="p-4"><SheetHeader className="p-0"><SheetTitle>{t("studioLibrary")}</SheetTitle></SheetHeader>{palettePanel}</SheetContent></Sheet>
      <Sheet open={inspectorSheetOpen} onOpenChange={setInspectorSheetOpen}><SheetContent side="right" className="p-4"><SheetHeader className="p-0"><SheetTitle>{t("studioInspector")}</SheetTitle></SheetHeader>{inspectorPanel}</SheetContent></Sheet>

      <AnalysisQuickAddDialog
        quickAddOpen={quickAddOpen}
        setQuickAddOpen={setQuickAddOpen}
        insertDataset={insertDataset}
        addOperator={addOperator}
        addConstant={addConstant}
        addAnnotation={addAnnotation}
      />

      <SaveAsKennzahlDialog
        analysis={analysis}
        selectedNode={selectedNode}
        savingMetric={savingMetric}
        setSavingMetric={setSavingMetric}
        metricName={metricName}
        setMetricName={setMetricName}
        pending={pending}
        startTransition={startTransition}
        flush={flush}
      />

      <DeleteAnalysisDialog
        analysis={analysis}
        deleting={deleting}
        setDeleting={setDeleting}
        pending={pending}
        startTransition={startTransition}
      />
    </div>
  );
}
