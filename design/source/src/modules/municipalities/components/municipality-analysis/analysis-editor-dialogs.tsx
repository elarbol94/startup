"use client";

// The analysis editor's confirmation dialogs: save the selected node as a Kennzahl, and delete the analysis.
// Used by analysis-editor.tsx.
import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { deleteMunicipalityAnalysis, saveMunicipalityAnalysisNodeAsMetric } from "../../actions";
import type { MunicipalityAnalysisGraph } from "../../analysis";
import type { useMunicipalityAnalysisPersistence } from "../municipality-analysis-persistence-provider";
import type { AnalysisRecord } from "./analysis-editor-types";

export function SaveAsKennzahlDialog({
  analysis, selectedNode, savingMetric, setSavingMetric, metricName, setMetricName, pending,
  startTransition, flush,
}: {
  analysis: AnalysisRecord;
  selectedNode: MunicipalityAnalysisGraph["nodes"][number] | null;
  savingMetric: boolean;
  setSavingMetric: Dispatch<SetStateAction<boolean>>;
  metricName: string;
  setMetricName: Dispatch<SetStateAction<string>>;
  pending: boolean;
  startTransition: TransitionStartFunction;
  flush: ReturnType<typeof useMunicipalityAnalysisPersistence>["flush"];
}) {
  const t = useTranslations("municipalities");
  const router = useRouter();
  /**
   * Turns the selected node into a reusable Kennzahl. The server reads the persisted
   * graph, so anything still queued is sent first — otherwise it would save a half-built
   * formula.
   */
  function saveSelectionAsMetric(metricName: string) {
    if (!selectedNode || !metricName.trim()) return;
    setSavingMetric(false);
    startTransition(async () => {
      if (!await flush(analysis.id)) {
        toast.error(t("saveAsKennzahlPending"));
        return;
      }
      const result = await saveMunicipalityAnalysisNodeAsMetric({
        analysisId: analysis.id, nodeId: selectedNode.id, name: metricName,
      });
      if (result.ok) {
        toast.success(t("saveAsKennzahlSaved", { name: result.name }));
        router.refresh();
        return;
      }
      toast.error(t(
        result.reason === "mixed-municipalities" ? "saveAsKennzahlMixedMunicipalities"
          : result.reason === "no-municipality-input" ? "saveAsKennzahlNoMunicipality"
            : "saveAsKennzahlMissingInput",
      ));
    });
  }

  return (
    <Dialog open={savingMetric} onOpenChange={setSavingMetric}>
      <DialogContent className="sm:max-w-md" data-testid="save-kennzahl-dialog"><DialogHeader><DialogTitle>{t("saveAsKennzahl")}</DialogTitle><DialogDescription>{t("saveAsKennzahlPrompt")}</DialogDescription></DialogHeader><Input autoFocus value={metricName} maxLength={120} aria-label={t("saveAsKennzahlPrompt")} onValueChange={setMetricName} onKeyDown={(event) => { if (event.key === "Enter") saveSelectionAsMetric(metricName); }} /><DialogFooter><Button variant="outline" onClick={() => setSavingMetric(false)}>{t("cancel")}</Button><Button disabled={!metricName.trim() || pending} onClick={() => saveSelectionAsMetric(metricName)}>{t("save")}</Button></DialogFooter></DialogContent>
    </Dialog>
  );
}

export function DeleteAnalysisDialog({
  analysis, deleting, setDeleting, pending, startTransition,
}: {
  analysis: AnalysisRecord;
  deleting: boolean;
  setDeleting: Dispatch<SetStateAction<boolean>>;
  pending: boolean;
  startTransition: TransitionStartFunction;
}) {
  const t = useTranslations("municipalities");
  const router = useRouter();
  function removeAnalysis() {
    setDeleting(false);
    startTransition(async () => {
      await deleteMunicipalityAnalysis(analysis.id);
      router.push("/municipalities/analysis");
      router.refresh();
    });
  }

  return (
    <Dialog open={deleting} onOpenChange={setDeleting}>
      <DialogContent className="sm:max-w-md" data-testid="delete-analysis-dialog"><DialogHeader><DialogTitle>{t("deleteAnalysis")}</DialogTitle><DialogDescription>{t("deleteAnalysisConfirm", { name: analysis.name })}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(false)}>{t("cancel")}</Button><Button variant="destructive" disabled={pending} onClick={removeAnalysis}>{t("delete")}</Button></DialogFooter></DialogContent>
    </Dialog>
  );
}
