"use client";
import { UserIdentity } from "@/components/user-identity";
import { OverviewFilters, useOverviewFilters, matchesOverviewFilters } from "./overview-filters";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { useTimeZone, useFormatter, useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { withWorkItemFocus } from "@/modules/context/routes";
import type { listNotifications } from "@/modules/wiki/research-queries";
import { ItemDetails } from "./item-details";
import { OverviewColumnPicker, OverviewTable, useOverviewTable } from "./overview-table";
export function OverviewNews({ items }: { items: ReturnType<typeof listNotifications> }) {
  const t = useTranslations("overviewLayout");
  const wiki = useTranslations("wiki");
  const format = useFormatter();
  const timezone = useTimeZone() ?? "Europe/Vienna";
  const rows = items.map(item => ({ ...item, title: item.taskTitle || item.pageTitle || wiki("notifications") }));
  const filters = useOverviewFilters("news", [
    { id: "search", label: t("titleColumn"), type: "search" },
    { id: "actor", label: t("actorColumn"), options: [...new Map(items.map(item => [item.actorId, { value: item.actorId, label: item.actorName }])).values()] },
    { id: "type", label: t("activityColumn"), options: ["assignment", "mention", "reply", "resolved"].map(value => ({ value, label: wiki(`notificationTypes.${value}`) })) },
    { id: "status", label: t("statusColumn"), options: [{ value: "unread", label: t("unread") }, { value: "read", label: t("read") }] },
    { id: "from", label: t("dateFrom"), type: "date" }, { id: "to", label: t("dateTo"), type: "date" },
  ]);
  const filteredRows = rows.filter(row => matchesOverviewFilters(filters.values, { search: row.title, actor: row.actorId, type: row.type, status: row.readAt ? "read" : "unread", date: localDateInZone(row.createdAt, timezone) }));
  const table = useOverviewTable("news", filteredRows, [
    { id: "title", label: t("titleColumn"), width: 230, value: item => item.title, render: item => <ItemDetails title={item.title} description={[`${item.actorName} ${wiki(`notificationTypes.${item.type}`)} ${item.title}`, item.taskDescription, item.anchorQuote].filter(Boolean).join("\n\n")} origin={item.taskOrigin || item.pageTitle || item.taskRoute || "—"}
      href={item.taskTitle && item.taskId ? withWorkItemFocus(item.taskRoute || "/", item.taskId, item.taskKind === "deadline" ? "deadline" : "task") : item.pageSlug ? `/wiki/pages/${encodeURIComponent(item.pageSlug)}` : null}
      fields={[{ label: t("actorColumn"), value: <UserIdentity userId={item.actorId} name={item.actorName} /> }, { label: t("dateColumn"), value: format.dateTime(item.createdAt, { dateStyle: "medium", timeStyle: "short" }) }]}
      className="block w-full rounded font-medium"><span className={`block truncate ${item.readAt ? "" : "text-indigo-600 dark:text-indigo-300"}`}>{item.title}</span></ItemDetails> },
    { id: "actor", label: t("actorColumn"), value: item => item.actorName, render: item => <UserIdentity userId={item.actorId} name={item.actorName} compact /> },
    { id: "type", label: t("activityColumn"), value: item => wiki(`notificationTypes.${item.type}`) },
    { id: "date", label: t("dateColumn"), width: 180, value: item => item.createdAt.getTime(), render: item => <span className="text-xs text-muted-foreground">{format.dateTime(item.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span> },
    { id: "status", label: t("statusColumn"), width: 110, value: item => item.readAt ? 1 : 0, render: item => item.readAt ? t("read") : t("unread") },
  ]);
  return <section className="flex h-full min-h-0 flex-col bg-card"><header className="flex flex-wrap items-center gap-3 border-b px-4 py-4"><Bell className="size-4 text-muted-foreground" /><h2 className="flex-1 text-sm font-semibold">{t("news")}</h2><OverviewColumnPicker table={table} /><OverviewFilters filters={filters} /></header><OverviewTable table={table} label={t("news")} empty={wiki("noNotifications")} /></section>;
}
