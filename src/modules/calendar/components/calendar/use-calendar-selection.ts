"use client";

// The selected calendar item, stored by id and looked up in the current workspace items so the
// inspector shows fresh data after router.refresh(). Also deletes the selected event (with a
// confirmation; recurring events open the edit dialog to choose the scope). Used by calendar-client.tsx.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteCalendarEvent } from "../../actions";
import type { CalendarItem } from "../../types";
import type { CalendarConfirm } from "./use-calendar-confirm";

export function useCalendarSelection({
  items,
  t,
  router,
  confirm,
  openEditEvent,
}: {
  items: CalendarItem[];
  t: ReturnType<typeof useTranslations<"calendar">>;
  router: ReturnType<typeof useRouter>;
  confirm: CalendarConfirm;
  openEditEvent: (item: CalendarItem) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? (items.find((item) => item.id === selectedId) ?? null) : null;

  async function deleteItem(item: CalendarItem) {
    if (item.recurring) {
      openEditEvent(item);
      return;
    }
    const accepted = await confirm({
      title: t("coreDeleteConfirmTitle", { title: item.title }),
      description: item.attendeeIds.length > 0 ? t("coreDeleteConfirmDescription") : undefined,
      confirmLabel: t("delete"),
      destructive: true,
    });
    if (!accepted) return;
    try {
      await deleteCalendarEvent(item.sourceId);
      setSelectedId((current) => (current === item.id ? null : current));
      router.refresh();
      toast.success(t("eventDeleted"));
    } catch {
      toast.error(t("coreDeleteError"));
    }
  }

  return {
    selected,
    selectedId: selected?.id ?? null,
    select: (item: CalendarItem) => setSelectedId(item.id),
    setSelected: (item: CalendarItem | null) => setSelectedId(item?.id ?? null),
    deselect: () => setSelectedId(null),
    deleteItem,
  };
}
