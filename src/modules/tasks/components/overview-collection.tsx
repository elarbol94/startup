"use client";
import { OverviewFilters, useOverviewFilters, filterOptions, matchesOverviewFilters } from "./overview-filters";
import { localDateInZone } from "@/modules/calendar/date-utils";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowUpRight, CalendarDays, FileText, FolderKanban, Presentation } from "lucide-react";
import type { OverviewRecord } from "../overview-data";
import { OverviewColumnPicker, OverviewTable, useOverviewTable, type OverviewColumn } from "./overview-table";
const icons = { calendar: CalendarDays, documents: FileText, presentations: Presentation, projects: FolderKanban };
const links = { calendar: "/calendar", documents: "/wiki/pages", presentations: "/wiki/presentations", projects: "/projects" };
export function OverviewCollection({ kind, rows, timezone }: { kind: keyof typeof icons; rows: OverviewRecord[]; timezone: string }) {
  const t = useTranslations("overviewLayout");
  const format = useFormatter();
  const filters = useOverviewFilters(kind, [
    { id: "search", label: t("titleColumn"), type: "search" },
    ...(kind === "calendar" ? [{ id: "calendar", label: t("calendar"), options: filterOptions(rows.map(row => row.calendar)) }, { id: "location", label: t("locationColumn"), options: filterOptions(rows.map(row => row.detailsHidden ? null : row.location)) }] : []),
    { id: "from", label: t("dateFrom"), type: "date" }, { id: "to", label: t("dateTo"), type: "date" },
  ]);
  const filteredRows = kind === "calendar" ? rows.filter(row => matchesOverviewFilters(filters.values, { search: row.detailsHidden ? t("busy") : row.title, calendar: row.calendar, location: row.detailsHidden ? null : row.location, date: row.dateOnly ?? (row.date == null ? null : localDateInZone(new Date(row.date), timezone)) })) : rows;
  const columns: OverviewColumn<OverviewRecord>[] = [
    { id: "title", label: t("titleColumn"), width: 230, value: row => row.detailsHidden ? t("busy") : row.title, render: row => row.href ? <Link href={row.href} className="block truncate rounded font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">{row.title}</Link> : <span className="font-medium">{row.detailsHidden ? t("busy") : row.title}</span> },
    { id: "date", label: kind === "calendar" ? t("dateColumn") : kind === "projects" ? t("targetDate") : t("updatedColumn"), width: 180, value: row => row.date, render: row => row.date == null ? "—" : <span className="text-xs text-muted-foreground">{format.dateTime(row.date, { dateStyle: "medium", ...(!row.allDay && kind !== "projects" ? { timeStyle: "short" as const } : {}), timeZone: row.dateOnly ? "UTC" : timezone })}</span> },
  ];
  if (kind === "calendar") columns.push(
    { id: "calendar", label: t("calendar"), value: row => row.calendar ?? null },
    { id: "location", label: t("locationColumn"), value: row => row.location || null },
  );
  else if (kind !== "projects") columns.push({ id: "actor", label: t("updatedBy"), value: row => row.actor ?? null });
  if (kind === "documents" || kind === "projects") columns.push({ id: "status", label: t("statusColumn"), value: row => row.status ?? null, render: row => row.status ? t(`recordStatus.${row.status}`) : "—" });
  const table = useOverviewTable(kind, filteredRows, columns);
  const Icon = icons[kind];
  return <section className="flex h-full min-h-0 flex-col bg-card">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-4">
      <Icon className="size-4 text-muted-foreground" /><h2 className="flex-1 text-sm font-semibold">{t(kind)}</h2>
      <OverviewColumnPicker table={table} />
      <Link href={links[kind]} aria-label={t("openSection", { section: t(kind) })} className="rounded p-1 text-muted-foreground hover:text-foreground"><ArrowUpRight className="size-4" /></Link>
      {kind === "calendar" && <><p className="w-full text-xs text-muted-foreground">{t("next30Days")}</p><OverviewFilters filters={filters} /></>}
    </header>
    <OverviewTable table={table} label={t(kind)} empty={t("collectionEmpty")} />
  </section>;
}
