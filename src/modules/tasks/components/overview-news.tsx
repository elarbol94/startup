"use client";
import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { withWorkItemFocus } from "@/modules/context/routes";
import type { listNotifications } from "@/modules/wiki/research-queries";
import { useMarkNotificationRead } from "@/modules/wiki/components/use-mark-notification-read";
import { ItemDetails } from "./item-details";

const shownItems = 6;
type Activity = "mention" | "reply" | "assignment" | "resolved";

/** "Neuigkeiten" (design 1b): the latest notifications as a compact list; "Alle" opens the full inbox. */
export function OverviewNews({ items }: { items: ReturnType<typeof listNotifications> }) {
  const t = useTranslations("overviewLayout");
  const dashboard = useTranslations("dashboard");
  const wiki = useTranslations("wiki");
  const format = useFormatter();
  const markRead = useMarkNotificationRead();
  const [now] = useState(() => new Date());
  const unread = items.filter(item => !item.readAt).length;
  const when = (date: Date) => date.toDateString() === now.toDateString()
    ? format.dateTime(date, { hour: "2-digit", minute: "2-digit" })
    : format.dateTime(date, { day: "numeric", month: "short" });

  return (
    <section aria-labelledby="overview-news" className="overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="flex items-center gap-2.5 border-b border-line-soft px-[18px] py-3">
        <h2 id="overview-news" className="text-sm font-semibold">{t("news")}</h2>
        {unread > 0 && <span className="inline-flex h-5 items-center rounded-full bg-brand-soft px-2 text-[11px] font-semibold text-brand-ink">{dashboard("newsNew", { count: unread })}</span>}
        <Button variant="ghost" size="sm" className="ml-auto" nativeButton={false} render={<Link href="/wiki/notifications" />}>{dashboard("allNews")}</Button>
      </header>
      {items.length === 0 ? (
        <EmptyState compact icon={<Bell />} title={dashboard("newsEmpty")} />
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.slice(0, shownItems).map(item => {
            const title = item.taskTitle || item.pageTitle || wiki("notifications");
            const href = item.taskTitle && item.taskId
              ? withWorkItemFocus(item.taskRoute || "/", item.taskId, item.taskKind === "deadline" ? "deadline" : "task")
              : item.pageSlug ? `/wiki/pages/${encodeURIComponent(item.pageSlug)}` : null;
            return (
              <li key={item.id} className="flex items-center gap-3 px-[18px] py-2.5 transition-colors hover:bg-accent">
                <UserIdentity userId={item.actorId} name={item.actorName} avatarOnly className="[&>span:first-child]:size-6 [&>span:first-child]:text-[10px]" />
                <div className="min-w-0 flex-1">
                  <ItemDetails
                    title={title}
                    description={[`${item.actorName} ${wiki(`notificationTypes.${item.type}`)} ${title}`, item.taskDescription, item.anchorQuote].filter(Boolean).join("\n\n")}
                    origin={item.taskOrigin || item.pageTitle || item.taskRoute || "—"}
                    href={href}
                    fields={[{ label: t("actorColumn"), value: <UserIdentity userId={item.actorId} name={item.actorName} /> }, { label: t("dateColumn"), value: format.dateTime(item.createdAt, { dateStyle: "medium", timeStyle: "short" }) }]}
                    onOpen={markRead(item)}
                    className="block w-full rounded"
                  >
                    <span className={cn("block truncate text-[13.5px] font-medium", !item.readAt && "text-brand-ink")}>{title}</span>
                  </ItemDetails>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.actorName} {dashboard(`newsActivity.${item.type as Activity}`)} · {when(item.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
