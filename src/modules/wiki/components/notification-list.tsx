"use client";

import { Bell } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useFormatter, useTranslations } from "next-intl";
import { ItemDetails } from "@/modules/tasks/components/item-details";
import type { listNotifications } from "../research-queries";
import { notificationHref } from "../notification-href";
import { useMarkNotificationRead } from "./use-mark-notification-read";

export function NotificationList({ items }: { items: ReturnType<typeof listNotifications> }) {
  const t = useTranslations("wiki");
  const details = useTranslations("overviewDetails");
  const format = useFormatter();
  const markRead = useMarkNotificationRead();
  if (!items.length) return <EmptyState icon={<Bell />} title={t("noNotifications")} />;
  return <div className="divide-y divide-line-soft">{items.map((item) => {
    const title = item.taskTitle || item.pageTitle || item.subject || t("notifications");
    const message = `${item.actorName} ${t(`notificationTypes.${item.type}`)} ${title}`;
    const href = notificationHref(item);
    const when = format.dateTime(item.createdAt, { dateStyle: "medium", timeStyle: "short" });
    return <ItemDetails key={item.id} title={title} description={[message, item.taskDescription, item.anchorQuote].filter(Boolean).join("\n\n")} origin={item.taskOrigin || item.pageTitle || item.taskRoute || details("unavailable")} href={href}
      fields={[{ label: details("actor"), value: <UserIdentity userId={item.actorId} name={item.actorName} /> }, { label: details("date"), value: when }]}
      onOpen={markRead(item)} className={cn("flex w-full gap-3 px-[18px] py-[11px] text-[13.5px] transition-colors hover:bg-accent", !item.readAt && "bg-brand-soft/50")}>
      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-line-strong" : "bg-brand")} />
      <span className="min-w-0"><span className="block break-words"><UserIdentity userId={item.actorId} name={item.actorName} /> {t(`notificationTypes.${item.type}`)} <strong className={cn("font-semibold", !item.readAt && "text-brand-ink")}>{title}</strong></span><span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{when}</span></span>
    </ItemDetails>;
  })}</div>;
}
