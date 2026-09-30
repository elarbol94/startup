"use client";

// The analysis editor's inspector: properties of the selected node(s) and the selected result's preview.
// Used by analysis-editor.tsx (desktop sidebar and mobile sheet).
import type { Dispatch, SetStateAction } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal,
  AlignStartVertical, Bookmark, ChartLine, Columns3, Copy, Pin, PinOff, Rows3, SlidersHorizontal, Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ANALYSIS_OPERATION_VERSION,
  analysisAnnotationColors,
  analysisNodeHeight,
  analysisNodeWidth,
  analysisSeriesToCsv,
  datasetMunicipalityName,
  MAX_ANALYSIS_NODE_HEIGHT,
  MAX_ANALYSIS_NODE_WIDTH,
  MIN_ANALYSIS_NODE_HEIGHT,
  MIN_ANALYSIS_NODE_WIDTH,
  MIN_ANALYSIS_NOTE_HEIGHT,
  MIN_ANALYSIS_NOTE_WIDTH,
  type AnalysisAnnotationColor,
  type AnalysisSeries,
  type MunicipalityAnalysisData,
  type MunicipalityAnalysisGraph,
  type MunicipalityAnalysisGraphOperation,
} from "../../analysis";
import type { AnalysisArrangeAction } from "../../analysis-layout";
import { conditionSchema } from "../../filters";
import { AnalysisSeriesChart } from "../analysis-series-chart";
import { ConditionNodeEditor } from "../municipality-condition-editor";
import { NOTE_STYLES } from "./analysis-editor-constants";
import { seriesErrorLabel } from "./analysis-labels";

export function AnalysisInspectorPanel({
  selectedNodeIds, selectedNode, selectedTitle, selectedTechnicalTitle, selectedSeries, data,
  dataError, pending, arrangeSelection, deleteSelection, resizeSelectedNode, commitOperations,
  setNodeTitle, setAnnotation, togglePin, setMetricName, setSavingMetric,
}: {
  selectedNodeIds: string[];
  selectedNode: MunicipalityAnalysisGraph["nodes"][number] | null;
  selectedTitle: string;
  selectedTechnicalTitle: string;
  selectedSeries: AnalysisSeries | null;
  data: MunicipalityAnalysisData | null;
  dataError: boolean;
  pending: boolean;
  arrangeSelection: (action: AnalysisArrangeAction) => void;
  deleteSelection: () => void;
  resizeSelectedNode: (size: { width?: number; height?: number }) => void;
  commitOperations: (operations: MunicipalityAnalysisGraphOperation[]) => boolean;
  setNodeTitle: (nodeId: string, title: string | null) => void;
  setAnnotation: (nodeId: string, text: string, color: AnalysisAnnotationColor) => void;
  togglePin: (nodeId: string) => void;
  setMetricName: Dispatch<SetStateAction<string>>;
  setSavingMetric: Dispatch<SetStateAction<boolean>>;
}) {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const format = useFormatter();
  async function copySeriesAsCsv() {
    if (!selectedSeries) return;
    try {
      await navigator.clipboard.writeText(analysisSeriesToCsv(selectedSeries, { year: t("csvYearHeader"), value: selectedTitle }));
      toast.success(t("copiedCsv"));
    } catch {
      toast.error(t("copyCsvFailed"));
    }
  }

  const selectedWidth = selectedNode ? analysisNodeWidth(selectedNode) : 0;
  const selectedHeight = selectedNode ? analysisNodeHeight(selectedNode) : 0;
  return (
    <Tabs defaultValue="properties" className="min-h-0 flex-1">
      <TabsList className="grid h-9 w-full grid-cols-2">
        <TabsTrigger value="properties"><SlidersHorizontal className="size-3.5" />{t("studioProperties")}</TabsTrigger>
        <TabsTrigger value="result"><ChartLine className="size-3.5" />{t("resultPreview")}</TabsTrigger>
      </TabsList>
      <TabsContent value="properties" className="min-h-0 overflow-y-auto pr-1">
        {selectedNodeIds.length > 1 ? (
          <div className="grid gap-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{t("studioSelectionCount", { count: selectedNodeIds.length })}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("studioSelectionHint")}</p>
            </div>
            <div>
              <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{t("studioAlign")}</h3>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {([
                  ["align-left", AlignStartVertical], ["align-center", AlignCenterVertical], ["align-right", AlignEndVertical],
                  ["align-top", AlignStartHorizontal], ["align-middle", AlignCenterHorizontal], ["align-bottom", AlignEndHorizontal],
                ] as const).map(([action, Icon]) => (
                  <Button key={action} variant="outline" size="icon-sm" aria-label={t(`studio_${action}`)} title={t(`studio_${action}`)} onClick={() => arrangeSelection(action)}><Icon className="size-3.5" /></Button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{t("studioDistribute")}</h3>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <Button variant="outline" size="sm" onClick={() => arrangeSelection("distribute-horizontal")}><Columns3 className="size-3.5" />{t("studioHorizontal")}</Button>
                <Button variant="outline" size="sm" onClick={() => arrangeSelection("distribute-vertical")}><Rows3 className="size-3.5" />{t("studioVertical")}</Button>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={deleteSelection}><Trash2 className="size-3.5" />{t("studioDeleteSelection")}</Button>
          </div>
        ) : selectedNode ? (
          <div className="grid gap-4 py-3">
            <div>
              <h2 className="truncate text-sm font-semibold">{selectedTitle}</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{selectedTechnicalTitle}</p>
            </div>
            {selectedNode.type === "dataset" && selectedNode.data.dataset.kind === "condition" && <div className="space-y-3"><ConditionNodeEditor key={selectedNode.id + JSON.stringify(selectedNode.data.dataset.condition)} value={selectedNode.data.dataset.condition} onSave={condition => { if (conditionSchema.safeParse(condition).success) commitOperations([{ version: ANALYSIS_OPERATION_VERSION, type: "update-condition", nodeId: selectedNode.id, condition }]); }} /><p className="text-xs text-muted-foreground">{tf("snapshotHint")}</p>{data?.digital && <p className="text-xs text-muted-foreground">{tf("snapshotDate", { date: data.digital.referenceDate })}</p>}</div>}
            {selectedNode.type !== "annotation" && (
              <label className="grid gap-1.5 text-xs font-medium">
                {t("studioCustomTitle")}
                <Input
                  key={`${selectedNode.id}:${selectedTitle}`}
                  className="h-9 text-xs"
                  defaultValue={selectedNode.data.alias ?? ""}
                  maxLength={120}
                  placeholder={selectedTechnicalTitle}
                  onBlur={(event) => setNodeTitle(selectedNode.id, event.target.value.trim() || null)}
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                />
              </label>
            )}
            {selectedNode.type === "annotation" && (
              <>
                <label className="grid gap-1.5 text-xs font-medium">
                  {t("studioNoteText")}
                  <Textarea
                    key={`${selectedNode.id}:${selectedNode.data.text}`}
                    defaultValue={selectedNode.data.text}
                    maxLength={2_000}
                    onBlur={(event) => setAnnotation(selectedNode.id, event.target.value, selectedNode.data.color)}
                  />
                </label>
                <div>
                  <h3 className="text-xs font-medium">{t("studioNoteColor")}</h3>
                  <div className="mt-1.5 flex gap-2">
                    {analysisAnnotationColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn("size-7 rounded-full border-2", NOTE_STYLES[color], selectedNode.data.color === color && "ring-2 ring-teal-600 ring-offset-2")}
                        aria-label={t(`studioNoteColor_${color}`)}
                        title={t(`studioNoteColor_${color}`)}
                        onClick={() => setAnnotation(selectedNode.id, selectedNode.data.text, color)}
                      ><span className="sr-only">{t(`studioNoteColor_${color}`)}</span></button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-xs font-medium">{t("studioDimensions")}</summary>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[10px] text-muted-foreground">{t("studioWidth")}
                  <Input key={`${selectedNode.id}:w:${selectedWidth}`} className="h-8 text-xs" type="number" defaultValue={selectedWidth} min={selectedNode.type === "annotation" ? MIN_ANALYSIS_NOTE_WIDTH : MIN_ANALYSIS_NODE_WIDTH} max={MAX_ANALYSIS_NODE_WIDTH} onBlur={(event) => resizeSelectedNode({ width: Number(event.target.value) })} />
                </label>
                <label className="grid gap-1 text-[10px] text-muted-foreground">{t("studioHeight")}
                  <Input key={`${selectedNode.id}:h:${selectedHeight}`} className="h-8 text-xs" type="number" defaultValue={selectedHeight} min={selectedNode.type === "annotation" ? MIN_ANALYSIS_NOTE_HEIGHT : MIN_ANALYSIS_NODE_HEIGHT} max={MAX_ANALYSIS_NODE_HEIGHT} onBlur={(event) => resizeSelectedNode({ height: Number(event.target.value) })} />
                </label>
              </div>
            </details>
            {selectedNode.type === "dataset" && selectedNode.data.dataset.kind !== "constant" && (
              <Button variant="outline" size="sm" onClick={() => togglePin(selectedNode.id)}>
                {datasetMunicipalityName(selectedNode.data.dataset) ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                {datasetMunicipalityName(selectedNode.data.dataset) ? t("unpinNode") : t("pinNode")}
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-destructive" onClick={deleteSelection}><Trash2 className="size-3.5" />{t("studioDeleteNode")}</Button>
          </div>
        ) : <p className="py-4 text-xs leading-5 text-muted-foreground">{t("studioSelectProperties")}</p>}
      </TabsContent>
      <TabsContent value="result" className="min-h-0 overflow-y-auto pr-1" aria-live="polite">
        {selectedNodeIds.length === 1 && selectedNode && selectedNode.type !== "annotation" && <h2 className="mt-3 truncate text-sm font-semibold">{selectedTitle}</h2>}
        {selectedNodeIds.length > 1 ? <p className="py-4 text-xs leading-5 text-muted-foreground">{t("studioMultiResult")}</p>
          : selectedNode?.type === "annotation" ? <p className="py-4 text-xs leading-5 text-muted-foreground">{t("studioNoteNoResult")}</p>
            : dataError ? <p className="mt-3 flex gap-2 text-xs text-destructive"><TriangleAlert className="size-4 shrink-0" />{t("analysisDataError")}</p>
              : selectedSeries?.error ? <p className="mt-3 flex gap-2 text-xs text-destructive"><TriangleAlert className="size-4 shrink-0" />{seriesErrorLabel(selectedSeries.error, t)}</p>
                : selectedSeries ? (
                  <div className="py-3">
                    <AnalysisSeriesChart series={selectedSeries} label={selectedTitle} trueLabel={t("booleanTrue")} falseLabel={t("booleanFalse")} />
                    {selectedSeries.warnings.length > 0 && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{t("analysisDivisionWarnings", { count: selectedSeries.warnings.length })}</p>}
                    <div className="mt-3 grid gap-2">
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => { setMetricName(selectedTitle); setSavingMetric(true); }}><Bookmark className="size-4" />{t("saveAsKennzahl")}</Button>
                      <Button variant="outline" size="sm" onClick={copySeriesAsCsv}><Copy className="size-4" />{t("copyCsv")}</Button>
                    </div>
                    <details className="mt-4 rounded-lg border">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium">{t("analysisValueTable")}</summary>
                      <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="px-2 py-1 text-left font-medium">{t("csvYearHeader")}</th><th className="px-2 py-1 text-right font-medium">{t("analysisValueHeader")}</th></tr></thead>
                        <tbody>{[...selectedSeries.points].reverse().map(({ year, value }) => <tr key={year} className="border-t"><td className="px-2 py-1">{year}</td><td className="px-2 py-1 text-right tabular-nums">{value === null ? "—" : typeof value === "boolean" ? (value ? t("booleanTrue") : t("booleanFalse")) : format.number(value, { maximumFractionDigits: 2 })}</td></tr>)}</tbody>
                      </table>
                      </div>
                    </details>
                  </div>
                ) : <p className="py-4 text-xs leading-5 text-muted-foreground">{t("analysisSelectResult")}</p>}
      </TabsContent>
    </Tabs>
  );
}
