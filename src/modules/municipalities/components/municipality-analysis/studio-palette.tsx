"use client";

// The analysis editor's library panel: data catalog with condition blocks, and draggable operator blocks.
// Used by analysis-editor.tsx.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Database, Sigma, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ANALYSIS_OPERATOR_SYMBOLS,
  type AnalysisOperatorId,
  type MunicipalityDatasetRef,
} from "../../analysis";
import { defaultCondition, conditionSchema, type FilterCondition } from "../../filters";
import type { MunicipalityMetricRecord } from "../../queries";
import { MunicipalityConditionEditor } from "../municipality-condition-editor";
import { CONSTANT_DRAG_VALUE, DATASET_DRAG_TYPE, OPERATOR_DRAG_TYPE } from "./analysis-editor-constants";
import { DatasetCatalog } from "./dataset-catalog";

const OPERATOR_GROUPS: Array<{ key: "arithmetic" | "comparison" | "logic" | "utility"; operators: AnalysisOperatorId[] }> = [
  { key: "arithmetic", operators: ["add", "subtract", "multiply", "divide"] },
  { key: "comparison", operators: ["greater-than", "greater-or-equal", "less-than", "less-or-equal", "equal", "not-equal"] },
  { key: "logic", operators: ["and", "or"] },
  { key: "utility", operators: ["shift"] },
];

export function StudioPalette({
  metrics,
  onOperator,
  onConstant,
  onAnnotation,
  onDataset,
}: {
  metrics: MunicipalityMetricRecord[];
  onOperator: (operator: AnalysisOperatorId) => void;
  onConstant: () => void;
  onAnnotation: () => void;
  onDataset: (request: { label: string; dataset: MunicipalityDatasetRef }) => void;
}) {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const [condition, setCondition] = useState<FilterCondition>(defaultCondition("availability"));
  return (
    <Tabs defaultValue="data" className="min-h-0 flex-1">
      <TabsList className="grid h-9 w-full grid-cols-2">
        <TabsTrigger value="data"><Database className="size-3.5" />{t("studioData")}</TabsTrigger>
        <TabsTrigger value="blocks"><Sigma className="size-3.5" />{t("studioBlocks")}</TabsTrigger>
      </TabsList>
      <TabsContent value="data" className="min-h-0 overflow-y-auto pr-1">
        <details className="my-3 rounded-lg border p-2"><summary className="cursor-pointer text-sm font-medium">{tf("conditionBlock")}</summary><div className="mt-3 space-y-3"><MunicipalityConditionEditor value={condition} onChange={setCondition} /><p className="text-xs text-muted-foreground">{tf("snapshotHint")}</p><Button size="sm" className="h-auto whitespace-normal" disabled={!conditionSchema.safeParse(condition).success} draggable={conditionSchema.safeParse(condition).success} onDragStart={event => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(DATASET_DRAG_TYPE, JSON.stringify({ label: tf("conditionBlock"), dataset: { kind: "condition", condition } })); }} onClick={() => onDataset({ label: tf("fields." + condition.field), dataset: { kind: "condition", condition } })}>{tf("addBlock")}</Button></div></details>
        <DatasetCatalog variant="sidebar" ownMetrics={metrics} onOpen={onDataset} />
      </TabsContent>
      <TabsContent value="blocks" className="min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-4 py-3">
          {OPERATOR_GROUPS.map((group) => (
            <section key={group.key}>
              <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{t(`studioOperatorGroup_${group.key}`)}</h3>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {group.operators.map((operator) => (
                  <button
                    key={operator}
                    type="button"
                    draggable
                    className="flex h-9 items-center gap-2 rounded-lg border bg-background px-2 text-left text-xs font-medium hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950"
                    title={t(`operator_${operator}`)}
                    aria-label={t("addOperator", { operator: t(`operator_${operator}`) })}
                    onClick={() => onOperator(operator)}
                    onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(OPERATOR_DRAG_TYPE, operator); }}
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-violet-100 font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{ANALYSIS_OPERATOR_SYMBOLS[operator]}</span>
                    <span className="truncate">{t(`operator_${operator}`)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <section>
            <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{t("studioOperatorGroup_inputs")}</h3>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {/* Draggable like the operators beside it: the drop handler has always
                  accepted a constant, but nothing offered one to drag. */}
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                draggable
                aria-label={t("addConstant")}
                onClick={onConstant}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(OPERATOR_DRAG_TYPE, CONSTANT_DRAG_VALUE); }}
              ><span className="font-mono text-xs">123</span>{t("constantNode")}<span className="sr-only">{t("addConstant")}</span></Button>
              <Button variant="outline" size="sm" className="justify-start" draggable onDragStart={event => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(OPERATOR_DRAG_TYPE, "annotation"); }} onClick={onAnnotation}><StickyNote className="size-3.5" />{t("studioNote")}</Button>
            </div>
          </section>
          <p className="text-[10px] leading-4 text-muted-foreground">{t("analysisUnitRule")}</p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
