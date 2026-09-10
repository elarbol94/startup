"use client";
import { useContext, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Bell, CalendarClock, CalendarDays, ClipboardCheck, FileText, FolderKanban, Presentation } from "lucide-react";
import type { getPersonalWorkSummary } from "@/modules/projects/queries";
import { addLocalDays, compareDeadlineTiming, isDeadlineOverdue, todayLocal } from "../deadline-utils";
import type { CardId } from "../overview-layout";
import type { OverviewCounts } from "../overview-data";
import { OverviewEditingContext } from "./overview-preferences";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { OverviewTable, useOverviewTable } from "./overview-table";
import { ItemDetails } from "./item-details";
import type { OverviewRecord } from "../overview-data";
const icons = { openTasks: ClipboardCheck, upcomingDeadlines: CalendarClock, overdue: AlertTriangle, nextDeadline: CalendarClock, eventsToday: CalendarDays, documentsCount: FileText, presentationsCount: Presentation, projectsCount: FolderKanban, unreadNews: Bell };
export function OverviewMetric({ id, summary, counts, records }: { id: CardId; summary: ReturnType<typeof getPersonalWorkSummary>; counts: OverviewCounts; records: OverviewRecord[] }) {
  const t = useTranslations("overviewLayout");
  const dashboard = useTranslations("dashboard");
  const format = useFormatter();
  const [now] = useState(() => new Date());
  const today = todayLocal(now);
  const upcoming = summary.deadlines.filter(deadline => !isDeadlineOverdue({ ...deadline, status: "open" }, now));
  const next = [...upcoming].sort(compareDeadlineTiming)[0];
  const values = {
    ...counts, openTasks: summary.openTaskCount,
    overdue: summary.taskDueDates.filter(date => date && date < today).length + summary.deadlines.filter(deadline => isDeadlineOverdue({ ...deadline, status: "open" }, now)).length,
    upcomingDeadlines: upcoming.filter(deadline => deadline.deadlineDate <= addLocalDays(today, 7)).length,
  };
  const Icon = icons[id];
  const editing = useContext(OverviewEditingContext);
  const table = useOverviewTable(`metric:${id}`, records, [
    { id: "title", label: t("titleColumn"), width: 330, value: row => row.title, render: row => <ItemDetails title={row.title} description={row.description ?? ""} origin={row.actor ?? ""} href={row.href} fields={[]} className="block w-full rounded text-left font-medium"><span className="block truncate">{row.title}</span></ItemDetails> },
    { id: "date", label: t("dateColumn"), width: 160, value: row => row.date, render: row => row.date ? format.dateTime(row.date, { dateStyle: "medium", timeZone: row.dateOnly ? "UTC" : undefined }) : "—" },
  ]);
  return <section className="h-full min-w-0 bg-card"><Dialog><DialogTrigger disabled={editing} className="flex h-full w-full min-w-0 items-center gap-3 p-4 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring" aria-label={t("showMetricDetails", { metric: t(id) })}>
    <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${id === "overdue" && values.overdue ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300" : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"}`}><Icon className="size-4" /></span>
    <div className="min-w-0">
      {id === "nextDeadline" ? <><p className="mb-2 text-xs text-muted-foreground">{t(id)}</p>{next ? <span className="block w-full rounded text-left"><span className="block truncate text-sm font-semibold">{next.title}</span><span className="block text-xs text-muted-foreground">{format.dateTime(new Date(`${next.deadlineDate}T12:00:00`), { dateStyle: "medium" })}</span></span> : <p className="text-sm text-muted-foreground">{dashboard("noNextDeadline")}</p>}</> : <><p className="text-3xl font-semibold tabular-nums tracking-tight">{values[id]}</p><p className="text-xs text-muted-foreground">{t(id)}</p></>}
    </div>
  </DialogTrigger><DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl"><DialogTitle>{t(id)}</DialogTitle><DialogDescription>{t("metricDetailsHint", { count: records.length })}</DialogDescription><div className="flex min-h-0 flex-col overflow-hidden rounded-lg border"><OverviewTable table={table} label={t(id)} empty={t("collectionEmpty")} /></div></DialogContent></Dialog></section>;
}
