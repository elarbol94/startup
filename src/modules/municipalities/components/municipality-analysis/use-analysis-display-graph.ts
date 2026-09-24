"use client";

// Turns the analysis graph into React Flow display nodes and routed edges: evaluated series, live drag/resize
// drafts and obstacle-avoiding edge paths. Used by analysis-editor.tsx.
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  ANALYSIS_OPERATOR_SYMBOLS,
  analysisNodeHeight,
  analysisNodeWidth,
  datasetMunicipalityName,
  evaluateAnalysisGraph,
  isUnaryAnalysisOperator,
  MAX_ANALYSIS_SHIFT_YEARS,
  type AnalysisAnnotationColor,
  type AnalysisSeries,
  type MunicipalityAnalysisData,
  type MunicipalityAnalysisGraph,
} from "../../analysis";
import { analysisEdgePath, analysisStubRoute, routeAnalysisEdge } from "../../analysis-edge-routing";
import type { AnalysisDisplayEdge, DisplayNode } from "./analysis-editor-types";
import { datasetTitle, seriesErrorLabel } from "./analysis-labels";

export function useAnalysisDisplayGraph({
  graph, data, selectedNodeIds, selectedEdgeIds, dragPositions, resizeDrafts, setAnnotation,
  setNodeTitle, setNodeValue, togglePin,
}: {
  graph: MunicipalityAnalysisGraph;
  data: MunicipalityAnalysisData | null;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  dragPositions: Record<string, { x: number; y: number }> | null;
  resizeDrafts: Record<string, { x?: number; y?: number; width?: number; height?: number }>;
  setAnnotation: (nodeId: string, text: string, color: AnalysisAnnotationColor) => void;
  setNodeTitle: (nodeId: string, title: string | null) => void;
  setNodeValue: (nodeId: string, value: number) => void;
  togglePin: (nodeId: string) => void;
}) {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const results = useMemo(() => data ? evaluateAnalysisGraph(graph, data) : new Map<string, AnalysisSeries>(), [data, graph]);
  const displayNodes = useMemo<DisplayNode[]>(() => graph.nodes.map((node) => {
    const series = results.get(node.id) ?? null;
    const errorLabel = seriesErrorLabel(series?.error ?? null, t);
    const base = {
      id: node.id,
      type: node.type,
      position: node.position,
      width: analysisNodeWidth(node),
      height: analysisNodeHeight(node),
      style: { width: analysisNodeWidth(node), height: analysisNodeHeight(node) },
      selected: selectedNodeIds.includes(node.id),
    };
    if (node.type === "annotation") {
      return {
        ...base,
        type: "annotation" as const,
        data: {
          kind: "annotation" as const,
          title: t("studioNote"),
          technicalTitle: t("studioNote"),
          series: null,
          errorLabel: null,
          warningLabel: null,
          annotation: {
            text: node.data.text,
            color: node.data.color,
            commit: (text: string, color: AnalysisAnnotationColor) => setAnnotation(node.id, text, color),
          },
        },
      };
    }
    if (node.type === "dataset") {
      const technicalTitle = datasetTitle(node.data.dataset, t, tf);
      return {
        ...base,
        type: "dataset" as const,
        data: {
          kind: "dataset" as const,
          title: node.data.alias ?? technicalTitle,
          technicalTitle,
          subtitle: node.data.dataset.kind === "constant"
            ? t("constantNode")
            : datasetMunicipalityName(node.data.dataset)
              ?? graph.subject?.municipalityName
              ?? t("analysisSubjectNone"),
          pinned: Boolean(datasetMunicipalityName(node.data.dataset)),
          togglePin: node.data.dataset.kind === "constant" ? undefined : {
            label: datasetMunicipalityName(node.data.dataset) ? t("unpinNode") : t("pinNode"),
            apply: () => togglePin(node.id),
          },
          editor: node.data.dataset.kind === "constant"
            ? { value: node.data.dataset.value, label: t("constantValue"), step: 1, commit: (value: number) => setNodeValue(node.id, value) }
            : undefined,
          series,
          errorLabel,
          warningLabel: series?.warnings.length ? t("analysisDivisionWarnings", { count: series.warnings.length }) : null,
          rename: (title: string | null) => setNodeTitle(node.id, title),
        },
      };
    }
    const technicalTitle = t(`operator_${node.data.operator}`);
    return {
      ...base,
      type: "operator" as const,
      data: {
        kind: "operator" as const,
        title: node.data.alias ?? technicalTitle,
        technicalTitle,
        subtitle: t("operatorNode"),
        symbol: ANALYSIS_OPERATOR_SYMBOLS[node.data.operator],
        series,
        singleInput: isUnaryAnalysisOperator(node.data.operator),
        editor: isUnaryAnalysisOperator(node.data.operator)
          ? { value: node.data.years ?? 1, label: t("shiftYears"), min: 1, max: MAX_ANALYSIS_SHIFT_YEARS, step: 1, commit: (value: number) => setNodeValue(node.id, value) }
          : undefined,
        errorLabel,
        warningLabel: series?.warnings.length ? t("analysisDivisionWarnings", { count: series.warnings.length }) : null,
        rename: (title: string | null) => setNodeTitle(node.id, title),
      },
    };
  }), [graph.nodes, graph.subject, results, selectedNodeIds, setAnnotation, setNodeTitle, setNodeValue, togglePin, t, tf]);
  // A node with no live draft is handed back unchanged: React Flow keeps the internal node
  // it already built for an unchanged object, so dragging one card does not re-render the
  // sparkline of every other one.
  const positionedNodes = useMemo<DisplayNode[]>(() => displayNodes.map((node) => {
    const drag = dragPositions?.[node.id];
    const resize = resizeDrafts[node.id];
    if (!drag && !resize) return node;
    const position = drag ?? { x: resize?.x ?? node.position.x, y: resize?.y ?? node.position.y };
    const width = resize?.width ?? node.width;
    const height = resize?.height ?? node.height;
    return { ...node, position, width, height, style: { width, height } };
  }), [displayNodes, dragPositions, resizeDrafts]);

  /** Where each edge leaves its source card and enters its target handle. */
  const edgeGeometry = useMemo(() => {
    const byId = new Map(positionedNodes.map((node) => [node.id, node]));
    return graph.edges.map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      const targetRatio = target?.data.singleInput ? 0.5 : edge.targetHandle === "a" ? 0.38 : 0.72;
      return {
        id: edge.id,
        source: { x: (source?.position.x ?? 0) + (source?.width ?? 0), y: (source?.position.y ?? 0) + (source?.height ?? 0) / 2 },
        target: { x: target?.position.x ?? 0, y: (target?.position.y ?? 0) + (target?.height ?? 0) * targetRatio },
      };
    });
  }, [graph.edges, positionedNodes]);

  // While a card is being dragged or resized the layout changes every frame, and routing
  // every edge around every card is an A* per edge — far too much for a frame budget. The
  // stub route follows the pointer for those frames; the real routes are found on drop.
  const interacting = dragPositions !== null || Object.keys(resizeDrafts).length > 0;
  const routedPaths = useMemo(() => {
    if (interacting) return null;
    const bounds = positionedNodes.map((node) => ({
      x: node.position.x, y: node.position.y, width: node.width ?? 0, height: node.height ?? 0,
    }));
    return new Map(edgeGeometry.map(({ id, source, target }) =>
      [id, analysisEdgePath(routeAnalysisEdge(source, target, bounds))]));
  }, [edgeGeometry, interacting, positionedNodes]);

  const displayEdges = useMemo<AnalysisDisplayEdge[]>(() => graph.edges.map((edge, index) => {
    const highlighted = selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target);
    const geometry = edgeGeometry[index]!;
    return {
      ...edge,
      type: "analysis",
      animated: false,
      selected: selectedEdgeIds.includes(edge.id),
      data: { path: routedPaths?.get(edge.id) ?? analysisEdgePath(analysisStubRoute(geometry.source, geometry.target)) },
      style: highlighted || selectedEdgeIds.includes(edge.id) ? { strokeWidth: 2.5, stroke: "var(--color-teal-600)" } : undefined,
    };
  }), [edgeGeometry, graph.edges, routedPaths, selectedEdgeIds, selectedNodeIds]);

  return { results, positionedNodes, displayEdges };
}
