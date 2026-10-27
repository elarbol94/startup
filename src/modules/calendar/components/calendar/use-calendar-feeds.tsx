"use client";

// State and handlers for subscribed/imported and Nextcloud-synced calendars: opens the
// subscribe, import and Nextcloud dialogs, syncs on demand and removes or unlinks after confirmation.
// Used by calendar-client.tsx.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  pushCalendarToNextcloud,
  syncNextcloudCalendarNow,
  unlinkNextcloudCalendar,
} from "../../caldav-actions";
import {
  removeCalendarSubscription,
  syncCalendarSubscriptionNow,
} from "../../subscription-actions";
import type { CalendarSource } from "../../types";
import { canAddEvents } from "./calendar-types";
import {
  feedErrorMessage,
  ImportCalendarDialog,
  SubscribeCalendarDialog,
} from "./calendar-feed-dialogs";
import { NextcloudDialog } from "./nextcloud-dialog";

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
  const [nextcloudOpen, setNextcloudOpen] = useState(false);
  const [confirmDialog, confirm] = useConfirm();
  const importTargets = calendars.filter(canAddEvents);

  async function syncNow(calendar: CalendarSource) {
    const toastId = toast.loading(t("feeds.syncNow"));
    try {
      const result = calendar.nextcloud
        ? await syncNextcloudCalendarNow(calendar.id)
        : await syncCalendarSubscriptionNow(calendar.id);
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

  async function pushToNextcloud(calendar: CalendarSource) {
    const toastId = toast.loading(t("nextcloud.pushing"));
    try {
      const result = await pushCalendarToNextcloud(calendar.id);
      if (result.status === "ok") toast.success(t("nextcloud.pushed", { name: calendar.name }), { id: toastId });
      else {
        toast.error(feedErrorMessage(t, result.error), { id: toastId });
        if (result.error === "not_connected" || result.error === "auth_failed") setNextcloudOpen(true);
      }
    } catch {
      toast.error(feedErrorMessage(t, null), { id: toastId });
    }
    refresh();
  }

  async function unlink(calendar: CalendarSource) {
    const confirmed = await confirm({
      title: t("nextcloud.unlinkTitle", { name: calendar.name }),
      description: t("nextcloud.unlinkDescription"),
      confirmLabel: t("nextcloud.unlink"),
    });
    if (!confirmed) return;
    try {
      await unlinkNextcloudCalendar(calendar.id);
      toast.success(t("nextcloud.unlinked"));
      refresh();
    } catch {
      toast.error(feedErrorMessage(t, null));
    }
  }

  const dialogs = (
    <>
      <NextcloudDialog open={nextcloudOpen} onOpenChange={setNextcloudOpen} onChanged={refresh} t={t} />
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
    openNextcloud: () => setNextcloudOpen(true),
    canImport: importTargets.length > 0,
    syncNow,
    remove,
    pushToNextcloud,
    unlink,
    dialogs,
  };
}
export type CalendarFeeds = ReturnType<typeof useCalendarFeeds>;
