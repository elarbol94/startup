"use client";

import "@xyflow/react/dist/style.css";
import { ReactFlowProvider } from "@xyflow/react";
import type { MunicipalityAnalysisSummary, MunicipalityMetricRecord } from "../queries";
import { AnalysisEditor } from "./municipality-analysis/analysis-editor";
import type { AnalysisRecord } from "./municipality-analysis/analysis-editor-types";
import { AnalysisLanding } from "./municipality-analysis/analysis-landing";

export function MunicipalityAnalysisClient({ analyses, initialAnalysis, metrics }: { analyses: MunicipalityAnalysisSummary[]; initialAnalysis: AnalysisRecord | null; metrics: MunicipalityMetricRecord[] }) {
  if (!initialAnalysis) return <AnalysisLanding analyses={analyses} metrics={metrics} />;
  return <ReactFlowProvider><AnalysisEditor key={initialAnalysis.id} analysis={initialAnalysis} analyses={analyses} metrics={metrics} /></ReactFlowProvider>;
}
