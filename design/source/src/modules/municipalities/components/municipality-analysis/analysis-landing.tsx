"use client";

// Analysis landing page (no analysis open): create one, open or delete saved ones, or browse the catalog.
// Used by municipality-analysis-client.tsx.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { BarChart3, Database, MapPin, Plus, Trash2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createMunicipalityAnalysis,
  createMunicipalityAnalysisAndRedirect,
  deleteMunicipalityAnalysis,
} from "../../actions";
import type { MunicipalityDatasetRef } from "../../analysis";
import type { MunicipalityAnalysisSummary, MunicipalityMetricRecord } from "../../queries";
import { DatasetCatalog } from "./dataset-catalog";

export function AnalysisLanding({
  analyses,
  metrics,
}: {
  analyses: MunicipalityAnalysisSummary[];
  metrics: MunicipalityMetricRecord[];
}) {
  const t = useTranslations("municipalities");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [deleting, setDeleting] = useState<MunicipalityAnalysisSummary | null>(null);
  function removeSavedAnalysis() {
    if (!deleting || pending) return;
    startTransition(async () => {
      try { await deleteMunicipalityAnalysis(deleting.id); setDeleting(null); router.refresh(); }
      catch { toast.error(t("analysisDeleteFailed")); }
    });
  }

  // No analysis is open here, so opening a derivation creates one for it.
  function openAsAnalysis(request: { label: string; dataset: MunicipalityDatasetRef }) {
    if (pending) return;
    startTransition(async () => {
      const created = await createMunicipalityAnalysis({
        name: request.label.slice(0, 120),
        dataset: request.dataset,
      });
      router.push(`/municipalities/analysis?analysis=${encodeURIComponent(created.id)}`);
    });
  }

  return (
    <div className="grid gap-4" data-testid="municipality-analysis-landing">
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{t("newAnalysis")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("newAnalysisDescription")}</p>
          </div>
          <form action={createMunicipalityAnalysisAndRedirect} className="flex flex-col gap-2 sm:flex-row">
            <Input name="name" aria-label={t("analysisNamePlaceholder")} maxLength={120} required placeholder={t("analysisNamePlaceholder")} />
            <Button type="submit"><Plus className="size-4" />{t("create")}</Button>
          </form>
        </div>
      </section>

      <Tabs defaultValue="saved" className="gap-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-fit" aria-label={t("analysisTab")}>
          <TabsTrigger value="saved" className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"><BarChart3 />{t("savedAnalyses")}</TabsTrigger>
          <TabsTrigger value="catalog" className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"><Database />{t("catalog")}</TabsTrigger>
        </TabsList>
        <TabsContent value="saved" className="rounded-2xl border bg-card p-5">
          <h2 className="text-xl font-semibold">{t("savedAnalyses")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("savedAnalysesDescription")}</p>
          <div className="mt-5 grid gap-2">
            {analyses.map((analysis) => (
              <div key={analysis.id} className="flex items-center gap-2 rounded-xl border pr-3">
              <button
                type="button"
                className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl border bg-background p-4 text-left transition-colors hover:bg-muted/50 hover:border-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                onClick={() => router.push(`/municipalities/analysis?analysis=${encodeURIComponent(analysis.id)}`)}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><BarChart3 className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{analysis.name}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" /><span className="truncate">{analysis.municipalityName ?? t("analysisSubjectNone")}</span></span>
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{t("analysisNodeCount", { count: analysis.nodeCount })}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground md:block" title={t("analysisUpdatedAt", { date: format.dateTime(analysis.updatedAt, { dateStyle: "medium", timeStyle: "short" }) })}>{format.dateTime(analysis.updatedAt, { dateStyle: "medium" })}</span>
              </button>
              <Button variant="ghost" size="icon-sm" aria-label={`${t("deleteAnalysis")} · ${analysis.name}`} disabled={pending} onClick={() => setDeleting(analysis)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            ))}
            {!analyses.length && <p className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("noAnalyses")}</p>}
          </div>
        </TabsContent>

        <TabsContent value="catalog" className="rounded-2xl border bg-card p-5">
          <DatasetCatalog variant="page" ownMetrics={metrics} onOpen={openAsAnalysis} />
        </TabsContent>
      </Tabs>
      <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !pending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>{t("deleteAnalysis")}</DialogTitle><DialogDescription>{t("deleteAnalysisConfirm", { name: deleting?.name ?? "" })}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDeleting(null)}>{t("cancel")}</Button><Button variant="destructive" disabled={pending} onClick={removeSavedAnalysis}>{t("delete")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
