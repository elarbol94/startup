"use client";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { OverviewKpi } from "../overview-data";
import { ItemDetails } from "./item-details";
import { OverviewTable, useOverviewTable } from "./overview-table";

function KpiTile({ kpi }: { kpi: OverviewKpi }) {
  const t = useTranslations("overviewLayout");
  const format = useFormatter();
  const table = useOverviewTable(`metric:${kpi.id}`, kpi.records, [
    { id: "title", label: t("titleColumn"), width: 330, value: row => row.title, render: row => <ItemDetails title={row.title} description={row.description ?? ""} origin={row.actor ?? ""} href={row.href} fields={[]} className="block w-full rounded text-left font-medium"><span className="block truncate">{row.title}</span></ItemDetails> },
    { id: "date", label: t("dateColumn"), width: 160, value: row => row.date, render: row => row.date ? format.dateTime(row.date, { dateStyle: "medium", timeZone: row.dateOnly ? "UTC" : undefined }) : "—" },
  ]);
  return (
    <Dialog>
      <DialogTrigger
        aria-label={t("showMetricDetails", { metric: t(kpi.id) })}
        className="min-w-0 cursor-pointer px-[18px] py-4 text-left shadow-[1px_0_0_var(--border),0_1px_0_var(--border)] transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="block truncate text-xs text-muted-foreground">{t(kpi.id)}</span>
        <span className={cn("mt-2 block text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular-nums", kpi.id === "overdue" && kpi.value > 0 && "text-late")}>{kpi.value}</span>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
        <DialogTitle>{t(kpi.id)}</DialogTitle>
        <DialogDescription>{t("metricDetailsHint", { count: kpi.records.length })}</DialogDescription>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border"><OverviewTable table={table} label={t(kpi.id)} empty={t("collectionEmpty")} /></div>
      </DialogContent>
    </Dialog>
  );
}

/** Dashboard key figures as one bordered 2 × 2 strip (design 1b); a tile opens the rows behind it. */
export function OverviewKpis({ kpis }: { kpis: OverviewKpi[] }) {
  const t = useTranslations("dashboard");
  return (
    <section aria-label={t("kpis")} className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-card">
      {kpis.map(kpi => <KpiTile key={kpi.id} kpi={kpi} />)}
    </section>
  );
}
