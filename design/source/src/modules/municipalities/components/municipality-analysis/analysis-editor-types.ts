// Types shared by the municipality analysis editor: the stored analysis and React Flow's display nodes/edges.
// Used by municipality-analysis-client.tsx and the files in municipality-analysis/.
import type { Edge, Node } from "@xyflow/react";
import type {
  AnalysisAnnotationColor,
  AnalysisSeries,
  MunicipalityAnalysisGraph,
} from "../../analysis";

export type AnalysisRecord = {
  id: string;
  name: string;
  graph: MunicipalityAnalysisGraph;
  updatedAt: number;
};

export type DisplayNodeData = {
  kind: "dataset" | "operator" | "annotation";
  title: string;
  technicalTitle: string;
  subtitle?: string;
  pinned?: boolean;
  /** Present on a dataset node: releases the pin, or pins it to the graph's subject. */
  togglePin?: { label: string; apply: () => void };
  symbol?: string;
  /** Constants and unary operators carry a number the reader edits on the node itself. */
  editor?: { value: number; label: string; min?: number; max?: number; step: number; commit: (value: number) => void };
  /** Unary operators read input A only, so B would be an input nothing can satisfy. */
  singleInput?: boolean;
  series: AnalysisSeries | null;
  errorLabel: string | null;
  warningLabel: string | null;
  rename?: (title: string | null) => void;
  annotation?: { text: string; color: AnalysisAnnotationColor; commit: (text: string, color: AnalysisAnnotationColor) => void };
};
export type DisplayNode = Node<DisplayNodeData, "dataset" | "operator" | "annotation">;
export type AnalysisEdgeData = { path: string; [key: string]: unknown };
export type AnalysisDisplayEdge = Edge<AnalysisEdgeData, "analysis">;
