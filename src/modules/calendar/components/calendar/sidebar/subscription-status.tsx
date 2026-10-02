"use client";

// Sync line of a subscribed calendar: feed host plus last update time or the last error.
// Used by calendar-row.tsx.
import { useLocale } from "next-intl";
import { RefreshCw } from "lucide-react";
import { feedErrorMessage } from "../calendar-feed-dialogs";
import type { CalendarEntry, CalendarT } from "./sidebar-types";

export function SubscriptionStatus({
  t,
  subscription,
  compact,
}: {
  t: CalendarT;
  subscription: NonNullable<CalendarEntry["subscription"]>;
  /** Sidebar rows: an icon only, with the full status as its label; errors show in red. */
  compact?: boolean;
}) {
  const locale = useLocale();
  const time = subscription.lastSyncedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(subscription.lastSyncedAt))
    : null;
  const state = subscription.lastError
    ? feedErrorMessage(t, subscription.lastError)
    : time ? t("feeds.lastSynced", { time }) : t("feeds.notSynced");
  const source = t("feeds.syncedFrom", { host: subscription.host });
  if (compact) {
    return (
      <span role="img" aria-label={`${source} · ${state}`} title={`${source} · ${state}`} className="shrink-0">
        <RefreshCw className={subscription.lastError ? "size-3 text-destructive" : "size-3 text-muted-foreground"} />
      </span>
    );
  }
  return (
    <span className="block text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1"><RefreshCw className="size-3" />{source}</span>
      {" · "}
      <span className={subscription.lastError ? "text-destructive" : undefined}>{state}</span>
    </span>
  );
}
