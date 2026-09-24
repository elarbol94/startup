// Drag-and-drop payload types and annotation note colours shared by the analysis editor's pieces.
// Used by analysis-editor.tsx, studio-palette.tsx, dataset-catalog.tsx, analysis-node-card.tsx and the inspector.
import type { AnalysisAnnotationColor } from "../../analysis";

export const DATASET_DRAG_TYPE = "application/x-municipality-analysis-dataset";
export const OPERATOR_DRAG_TYPE = "application/x-municipality-analysis-operator";
/** Dragged like an operator, but drops a constant node. */
export const CONSTANT_DRAG_VALUE = "constant";

export const NOTE_STYLES: Record<AnalysisAnnotationColor, string> = {
  gray: "border-slate-300 bg-slate-50 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50",
  sand: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50",
  blue: "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-50",
  green: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50",
};
