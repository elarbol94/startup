"use client";

import { UserIdentity } from "@/components/user-identity";
import { useFormatter, useTranslations } from "next-intl";
import { ItemDetails } from "@/modules/tasks/components/item-details";
import { withWorkItemFocus } from "@/modules/context/routes";
import type { listNotifications } from "../research-queries";

export function NotificationList({ items }: { items: ReturnType<typeof listNotifications> }) {
  const t = useTranslations("wiki");
  const details = useTranslations("overviewDetails");
  const format = useFormatter();
  if (!items.length) return <p className="p-6 text-sm text-muted-foreground">{t("noNotifications")}</p>;
  return <div className="divide-y">{items.map((item) => {
    const title = item.taskTitle || item.pageTitle || t("notifications");
    const message = `${item.actorName} ${t(`notificationTypes.${item.type}`)} ${title}`;
    const href = item.taskTitle && item.taskId
      ? withWorkItemFocus(item.taskRoute || "/", item.taskId, item.taskKind === "deadline" ? "deadline" : "task")
      : item.pageSlug ? `/wiki/pages/${encodeURIComponent(item.pageSlug)}` : null;
    const when = format.dateTime(item.createdAt, { dateStyle: "medium", timeStyle: "short" });
    return <ItemDetails key={item.id} title={title} description={[message, item.taskDescription, item.anchorQuote].filter(Boolean).join("\n\n")} origin={item.taskOrigin || item.pageTitle || item.taskRoute || details("unavailable")} href={href}
      fields={[{ label: details("actor"), value: item.actorName }, { label: details("date"), value: when }]}
      className={`flex w-full gap-3 p-4 hover:bg-accent ${item.readAt ? "" : "bg-indigo-50/40 dark:bg-indigo-950/20"}`}>
      <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-muted-foreground/30" : "bg-indigo-500"}`} />
      <span className="min-w-0"><span className="block break-words text-sm"><UserIdentity userId={item.actorId} name={item.actorName} /> {t(`notificationTypes.${item.type}`)} <strong>{title}</strong></span><span className="mt-1 block text-xs text-muted-foreground">{when}</span></span>
    </ItemDetails>;
  })}</div>;
}
