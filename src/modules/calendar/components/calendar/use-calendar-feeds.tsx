"use client";

// State and handlers for subscribed/imported calendars: opens the subscribe and
// import dialogs, syncs a subscription on demand and removes it after confirmation.
// Used by calendar-client.tsx.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  removeCalendarSubscription,
  syncCalendarSubscriptionNow,
} from "../../subscription-actions";
import type { CalendarSource } from "../../types";
import {
  feedErrorMessage,
  ImportCalendarDialog,
  SubscribeCalendarDialog,
} from "./calendar-feed-dialogs";

export function useCalendarFeeds({
  calendars,
  refresh,
  t,
}: {
  calendars: CalendarSource[];
  refresh: () => void;
  t: ReturnType<typeof useTranslations<"calendar">>;
}) {
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDialog, confirm] = useConfirm();
  const importTargets = calendars.filter(
    (calendar) => !calendar.subscription && (calendar.role === "owner" || calendar.role === "editor"),
  );

  async function syncNow(calendar: CalendarSource) {
    const toastId = toast.loading(t("feeds.syncNow"));
    try {
      const result = await syncCalendarSubscriptionNow(calendar.id);
      if (result.status === "ok") toast.success(t("feeds.synced"), { id: toastId });
      else toast.error(feedErrorMessage(t, result.error), { id: toastId });
    } catch {
      toast.error(feedErrorMessage(t, null), { id: toastId });
    }
    refresh();
  }

  async function remove(calendar: CalendarSource) {
    const confirmed = await confirm({
      title: t("feeds.removeTitle", { name: calendar.name }),
      description: t("feeds.removeDescription"),
      confirmLabel: t("feeds.remove"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await removeCalendarSubscription(calendar.id);
      toast.success(t("feeds.removed"));
      refresh();
    } catch {
      toast.error(feedErrorMessage(t, null));
    }
  }

  const dialogs = (
    <>
      <SubscribeCalendarDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        t={t}
        onSubscribed={(created) => {
          setSubscribeOpen(false);
          toast.success(t("feeds.subscribed", { count: created }));
          refresh();
        }}
      />
      <ImportCalendarDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        calendars={importTargets}
        t={t}
        onImported={(result) => {
          setImportOpen(false);
          toast.success(t("feeds.imported", result));
          refresh();
        }}
      />
      {confirmDialog}
    </>
  );

  return {
    openSubscribe: () => setSubscribeOpen(true),
    openImport: () => setImportOpen(true),
    canImport: importTargets.length > 0,
    syncNow,
    remove,
    dialogs,
  };
}
