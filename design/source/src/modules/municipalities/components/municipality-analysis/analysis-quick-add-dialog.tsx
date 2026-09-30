"use client";

// Quick-add command dialog: search every catalog entry, operator and block and drop it on the canvas.
// Used by analysis-editor.tsx.
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { analysisOperatorIds, type AnalysisOperatorId, type MunicipalityDatasetRef } from "../../analysis";
import { normalizeMunicipalitySearch } from "../../data";
import {
  AUSGANGSDATEN_CATALOG,
  bindKennzahlInput,
  kennzahlExpressionFor,
  KENNZAHL_CATALOG,
} from "../../kennzahlen";
import { datasetTitle } from "./analysis-labels";

export function AnalysisQuickAddDialog({
  quickAddOpen, setQuickAddOpen, insertDataset, addOperator, addConstant, addAnnotation,
}: {
  quickAddOpen: boolean;
  setQuickAddOpen: Dispatch<SetStateAction<boolean>>;
  insertDataset: (request: { label: string; dataset: MunicipalityDatasetRef }) => void;
  addOperator: (operator: AnalysisOperatorId) => void;
  addConstant: () => void;
  addAnnotation: () => void;
}) {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const [quickAddQuery, setQuickAddQuery] = useState("");
  type QuickAddItem =
    | { id: string; label: string; group: string; kind: "dataset"; request: { label: string; dataset: MunicipalityDatasetRef } }
    | { id: string; label: string; group: string; kind: "operator"; operator: AnalysisOperatorId }
    | { id: string; label: string; group: string; kind: "constant" | "annotation" };
  // Both catalogs, every operator, in one list. Built once per language rather than per
  // render: it is a hundred-odd entries that never change while a node is being dragged.
  const quickAddItems = useMemo<QuickAddItem[]>(() => [
    ...AUSGANGSDATEN_CATALOG.map(({ id, output }) => ({
      id: `data:${id}`,
      label: datasetTitle(output, t, tf),
      group: t("dataKindBase"),
      kind: "dataset" as const,
      request: { label: datasetTitle(output, t, tf), dataset: bindKennzahlInput(output) },
    })),
    ...KENNZAHL_CATALOG.flatMap(({ id, labelKey, output }) => kennzahlExpressionFor(output) ? [{
      id: `metric:${id}`,
      label: t(labelKey as "populationDensity"),
      group: t("dataKindDerived"),
      kind: "dataset" as const,
      request: { label: t(labelKey as "populationDensity"), dataset: bindKennzahlInput(output) },
    }] : []),
    ...analysisOperatorIds.map((operator) => ({
      id: `operator:${operator}`,
      label: t(`operator_${operator}`),
      group: t("operators"),
      kind: "operator" as const,
      operator,
    })),
    { id: "constant", label: t("constantNode"), group: t("studioBlocks"), kind: "constant" },
    { id: "annotation", label: t("studioNote"), group: t("studioBlocks"), kind: "annotation" },
  ], [t, tf]);
  const visibleQuickAddItems = useMemo(() => {
    const needle = normalizeMunicipalitySearch(quickAddQuery);
    return quickAddItems.filter(({ label, group }) => !needle
      || normalizeMunicipalitySearch(`${label} ${group}`).includes(needle)).slice(0, 40);
  }, [quickAddItems, quickAddQuery]);

  const runQuickAdd = (item: QuickAddItem) => {
    if (item.kind === "dataset") insertDataset(item.request);
    else if (item.kind === "operator") addOperator(item.operator);
    else if (item.kind === "constant") addConstant();
    else addAnnotation();
    setQuickAddOpen(false);
    setQuickAddQuery("");
  };

  return (
    <Dialog open={quickAddOpen} onOpenChange={(open) => { setQuickAddOpen(open); if (!open) setQuickAddQuery(""); }}>
      <DialogContent className="gap-3 sm:max-w-xl" data-testid="analysis-quick-add">
        <DialogHeader><DialogTitle>{t("studioQuickAdd")}</DialogTitle><DialogDescription>{t("studioQuickAddHint")}</DialogDescription></DialogHeader>
        <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus className="pl-9" value={quickAddQuery} onValueChange={setQuickAddQuery} placeholder={t("studioQuickAddSearch")} onKeyDown={(event) => { if (event.key === "Enter" && visibleQuickAddItems[0]) { event.preventDefault(); runQuickAdd(visibleQuickAddItems[0]); } }} /></div>
        <div className="max-h-96 overflow-y-auto rounded-xl border p-1">
          {visibleQuickAddItems.map((item) => <button key={item.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent" onClick={() => runQuickAdd(item)}><span className="truncate text-sm font-medium">{item.label}</span><span className="shrink-0 text-[10px] text-muted-foreground">{item.group}</span></button>)}
          {!visibleQuickAddItems.length && <p className="p-6 text-center text-sm text-muted-foreground">{t("catalogNoMatches")}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
