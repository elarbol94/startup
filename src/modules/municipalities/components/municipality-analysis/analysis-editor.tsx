"use client";

// The node-graph analysis editor: graph state, data loading and the studio layout. Committing edits and
// undo/redo live in use-analysis-graph-commit.ts, React Flow change handlers in use-analysis-flow-changes.ts
// and palette/toolbar actions in use-analysis-canvas-actions.ts.
// Used by municipality-analysis-client.tsx inside a ReactFlowProvider.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Background,
  MiniMap,
  Controls,
  ReactFlow,
  type Edge,
  SelectionMode,
  type Viewport,
  useReactFlow,
} from "@xyflow/react";
import {
  BarChart3, Loader2, MapPin, Maximize2, Menu,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil,
  Save, SlidersHorizontal, Trash2,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { renameMunicipalityAnalysis } from "../../actions";
import {
  municipalityDatasetRefSchema,
  ANALYSIS_OPERATION_VERSION,
  analysisOperatorIds,
  applyMunicipalityAnalysisGraphOperations,
  type AnalysisOperatorId,
  type MunicipalityAnalysisData,
} from "../../analysis";
import { loadMunicipalityAnalysisData } from "../../analysis-data";
import {
  buildKennzahlGraph,
  expandKennzahlIntoGraph,
} from "../../kennzahlen";
import type { MunicipalityAnalysisSummary, MunicipalityMetricRecord } from "../../queries";
import { useMunicipalityAnalysisPersistence } from "../municipality-analysis-persistence-provider";
import { CONSTANT_DRAG_VALUE, DATASET_DRAG_TYPE, OPERATOR_DRAG_TYPE } from "./analysis-editor-constants";
import { DeleteAnalysisDialog, SaveAsKennzahlDialog } from "./analysis-editor-dialogs";
import type { AnalysisRecord, DisplayNode } from "./analysis-editor-types";
import { AnalysisInspectorPanel } from "./analysis-inspector-panel";
import { analysisOptionLabel, datasetTitle } from "./analysis-labels";
import { edgeTypes, nodeTypes } from "./analysis-node-card";
import { AnalysisQuickAddDialog } from "./analysis-quick-add-dialog";
import { AnalysisHistoryButtons, AnalysisQuickAddButton } from "./analysis-toolbar-buttons";
import { MunicipalityPicker } from "./municipality-picker";
import { StudioPalette } from "./studio-palette";
import { useAnalysisCanvasActions } from "./use-analysis-canvas-actions";
import { useAnalysisDisplayGraph } from "./use-analysis-display-graph";
import { useAnalysisFlowChanges } from "./use-analysis-flow-changes";
import { useAnalysisGraphCommit } from "./use-analysis-graph-commit";
import { useAnalysisShortcuts } from "./use-analysis-shortcuts";

// The node card is w-52 and roughly this tall — enough to tell whether a restored
// viewport still shows anything, which is all these are used for.
const NODE_WIDTH = 208;
const NODE_HEIGHT = 150;

export function AnalysisEditor({ analysis, analyses, metrics }: { analysis: AnalysisRecord; analyses: MunicipalityAnalysisSummary[]; metrics: MunicipalityMetricRecord[] }) {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const router = useRouter();
  const reactFlow = useReactFlow<DisplayNode, Edge>();
  const { flush, getPendingOperations, getSaveState, markApplied } = useMunicipalityAnalysisPersistence();
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

  const {
    commitOperations, setNodeValue, setNodeTitle, setAnnotation, undoLastEdit, redoLastEdit, historyDepth,
  } = useAnalysisGraphCommit({
    analysis, graphRef, setGraph, startTransition, setDragPositions, setResizeDrafts, selectedNodeIdsRef, setSelectedNodeIds,
  });

  const { quickAddOpen, setQuickAddOpen } = useAnalysisShortcuts({ undoLastEdit, redoLastEdit });

  const {
    togglePin, addOperator, addConstant, addAnnotation, insertDataset,
    autoLayout, arrangeSelection, resizeSelectedNode, deleteSelection,
  } = useAnalysisCanvasActions({ graphRef, commitOperations, pointerFlowPosition, selectedNodeIdsRef, setSelectedNodeIds });

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

  const { onNodesChange, onEdgesChange, connect } = useAnalysisFlowChanges({
    graphRef, commitOperations, setDragPositions, resizeDraftsRef, setResizeDrafts, selectedNodeIdsRef, setSelectedNodeIds, setSelectedEdgeIds,
  });

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
    <div className="flex min-h-[42rem] flex-col overflow-hidden rounded-xl border bg-card shadow-card lg:h-[calc(100vh-10.5rem)]" data-analysis-editor data-owns-double-shift data-testid="municipality-analysis-editor">
      <header className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-card px-3 py-2">
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
        <aside className={cn("hidden min-h-0 shrink-0 border-r bg-surface-raised transition-[width] lg:flex lg:flex-col", paletteCollapsed ? "w-11 p-1" : "w-64 p-3")}>
          <div className="mb-2 flex items-center justify-between">
            {!paletteCollapsed && <h2 className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("studioLibrary")}</h2>}
            <Button variant="ghost" size="icon-sm" className={cn(paletteCollapsed && "mx-auto")} aria-label={paletteCollapsed ? t("studioOpenPalette") : t("studioClosePalette")} onClick={() => setPaletteCollapsed((value) => !value)}>{paletteCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</Button>
          </div>
          {!paletteCollapsed && palettePanel}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-muted/20">
          <div className="flex flex-wrap items-center gap-1 border-b border-line-soft bg-card px-2 py-1.5">
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setPaletteSheetOpen(true)}><Menu className="size-3.5" />{t("studioLibrary")}</Button>
            <AnalysisQuickAddButton onOpen={() => setQuickAddOpen(true)} />
            <span className="mx-1 h-5 w-px bg-border" />
            <AnalysisHistoryButtons canUndo={historyDepth.undo > 0} canRedo={historyDepth.redo > 0} onUndo={undoLastEdit} onRedo={redoLastEdit} />
            <Button variant="ghost" size="sm" onClick={autoLayout}><WandSparkles className="size-3.5" />{t("studioAutoLayout")}</Button>
            <Button variant="ghost" size="sm" onClick={() => void reactFlow.fitView({ padding: 0.2, duration: 250 })}><Maximize2 className="size-3.5" />{t("studioFit")}</Button>
            {selectedNodeIds.length > 1 && <span className="ml-auto inline-flex h-5 items-center rounded-full bg-brand-soft px-2 text-[11px] font-semibold text-brand-ink">{t("studioSelectionCount", { count: selectedNodeIds.length })}</span>}
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
            {!data && !dataError && graph.nodes.some(({ type }) => type !== "annotation") && <div className="pointer-events-none absolute inset-x-0 top-2 grid place-items-center" role="status"><span className="flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1 text-xs shadow-sm backdrop-blur"><Loader2 className="size-3.5 animate-spin" />{t("analysisDataLoading")}</span></div>}
          </div>
        </section>

        <aside className={cn("hidden min-h-0 shrink-0 border-l bg-card transition-[width] lg:flex lg:flex-col", inspectorCollapsed ? "w-11 p-1" : "w-72 p-3")}>
          <div className="mb-2 flex items-center justify-between">
            {!inspectorCollapsed && <h2 className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("studioInspector")}</h2>}
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
