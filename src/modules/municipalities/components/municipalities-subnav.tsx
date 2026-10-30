"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { BarChart3, Coins, FolderKanban, ListFilter, Map, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SubNav, SubNavLink } from "@/components/ui/sub-nav";
import { cn } from "@/lib/utils";
import { useMunicipalityAnalysisPersistence } from "./municipality-analysis-persistence-provider";
import { createId } from "@paralleldrive/cuid2";
import {
  createMunicipalityAnalysis,
  listMyMunicipalityAnalyses,
} from "../actions";
import { ANALYSIS_OPERATION_VERSION, datasetMunicipalityName, municipalityDatasetRefSchema, type MunicipalityDatasetRef } from "../analysis";
import type { MunicipalityAnalysisSummary } from "../queries";
import {
  MUNICIPALITY_DATASET_DRAG_TYPE,
  MUNICIPALITY_DATASET_TRANSFER_EVENT,
  readMunicipalityDatasetDrag,
} from "../transfer";

export function MunicipalitiesSubnav() {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const pathname = usePathname();
  const { enqueue } = useMunicipalityAnalysisPersistence();
  const [dragging, setDragging] = useState(false);
  const [dataset, setDataset] = useState<MunicipalityDatasetRef | null>(null);
  const [analyses, setAnalyses] = useState<MunicipalityAnalysisSummary[]>([]);
  const [lastAnalysisId, setLastAnalysisId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    const listener = (event: Event) => {
      const parsed = municipalityDatasetRefSchema.safeParse((event as CustomEvent).detail);
      if (parsed.success) setDataset(parsed.data);
    };
    window.addEventListener(MUNICIPALITY_DATASET_TRANSFER_EVENT, listener);
    return () => window.removeEventListener(MUNICIPALITY_DATASET_TRANSFER_EVENT, listener);
  }, []);

  useEffect(() => {
    if (!dataset) return;
    startTransition(async () => setAnalyses(await listMyMunicipalityAnalyses()));
  }, [dataset]);

  function finishTransfer(analysisId: string) {
    setLastAnalysisId(analysisId);
    setDataset(null);
    setName("");
    toast.success(t("analysisSaved"));
  }

  // Queued rather than awaited: the queue lives in the layout and survives the navigation
  // that usually follows straight after, and the graph decides whether the Kennzahl lands
  // as one node or as its whole derivation.
  function queueTransfer(analysisId: string, value: MunicipalityDatasetRef) {
    enqueue(analysisId, [{
      version: ANALYSIS_OPERATION_VERSION,
      type: "add-kennzahl",
      nodeId: createId(),
      dataset: value,
    }]);
  }

  function addToExisting(analysisId: string) {
    if (!dataset) return;
    queueTransfer(analysisId, dataset);
    finishTransfer(analysisId);
  }

  function createAnalysis() {
    if (!dataset || !name.trim()) return;
    const value = dataset;
    startTransition(async () => {
      const result = await createMunicipalityAnalysis({ name });
      queueTransfer(result.id, value);
      finishTransfer(result.id);
    });
  }

  return (
    <>
      <SubNav label={t("subnavLabel")}>
        <SubNavLink href="/municipalities/overview" active={pathname.endsWith("/overview")} icon={<Map />}>
          {t("overviewTab")}
        </SubNavLink>
        <SubNavLink href="/municipalities/filter" active={pathname.endsWith("/filter")} icon={<ListFilter />}>
          {tf("nav")}
        </SubNavLink>
        <SubNavLink href="/municipalities/income" active={pathname.endsWith("/municipalities/income")} icon={<Coins />}>
          {t("incomeTab")}
        </SubNavLink>
        <SubNavLink
          href={lastAnalysisId ? "/municipalities/analysis?analysis=" + encodeURIComponent(lastAnalysisId) : "/municipalities/analysis"}
          prefetch={false}
          active={pathname.endsWith("/analysis")}
          icon={<BarChart3 />}
          data-testid="municipality-analysis-drop-target"
          className={cn(dragging && "bg-brand-soft text-brand-ink ring-2 ring-brand/40 ring-inset")}
          onDragEnter={(event) => {
            if (event.dataTransfer.types.includes(MUNICIPALITY_DATASET_DRAG_TYPE)) {
              event.preventDefault();
              setDragging(true);
            }
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(MUNICIPALITY_DATASET_DRAG_TYPE)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            try {
              const value = readMunicipalityDatasetDrag(event);
              if (value) setDataset(value);
            } catch {
              setDataset(null);
            }
          }}
        >
          {dragging ? t("dropOnAnalysis") : t("analysisTab")}
        </SubNavLink>
      </SubNav>

      <Dialog open={Boolean(dataset)} onOpenChange={(open) => { if (!open) setDataset(null); }}>
        <DialogContent className="sm:max-w-lg" data-testid="municipality-analysis-picker">
          <DialogHeader>
            <DialogTitle>{t("chooseAnalysisTitle")}</DialogTitle>
            <DialogDescription>{t("chooseAnalysisDescription", { municipality: (dataset && datasetMunicipalityName(dataset)) ?? "" })}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-56 gap-2 overflow-y-auto">
            {analyses.length ? analyses.map((analysis) => (
              <Button
                key={analysis.id}
                variant="outline"
                className="h-auto justify-start px-3 py-2 text-left"
                disabled={loading}
                onClick={() => addToExisting(analysis.id)}
              >
                <FolderKanban className="size-4" />
                <span className="min-w-0 truncate">{analysis.name}</span>
              </Button>
            )) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {loading ? t("analysesLoading") : t("noAnalyses")}
              </p>
            )}
          </div>
          <div className="grid gap-2 border-t pt-4">
            <label htmlFor="new-municipality-analysis" className="text-sm font-medium">{t("newAnalysis")}</label>
            <div className="flex gap-2">
              <Input
                id="new-municipality-analysis"
                value={name}
                maxLength={120}
                placeholder={t("analysisNamePlaceholder")}
                onValueChange={(value) => setName(value)}
                onKeyDown={(event) => { if (event.key === "Enter") createAnalysis(); }}
              />
              <Button disabled={loading || !name.trim()} onClick={createAnalysis}>
                <Plus className="size-4" />
                {t("create")}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDataset(null)}>{t("cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
