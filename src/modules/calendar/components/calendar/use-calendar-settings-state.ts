"use client";

// State of the create/edit calendar dialog (name, colour, visibility, feed address of
// subscriptions) and its submit.
// Used by calendar-client.tsx.
import { useState, type FormEvent, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createCalendar, updateCalendar } from "../../calendar-management-actions";
import { updateCalendarSubscriptionUrl } from "../../subscription-actions";
import type { CalendarWorkspace } from "../../types";
import { feedErrorMessage } from "./calendar-feed-dialogs";
import type { CalendarDraft } from "./calendar-types";

const NEW_CALENDAR: CalendarDraft = { name: "", color: "#6D5EF7", visibility: "private" };

export function useCalendarSettingsState({
  t,
  router,
  startTransition,
}: {
  t: ReturnType<typeof useTranslations<"calendar">>;
  router: ReturnType<typeof useRouter>;
  startTransition: TransitionStartFunction;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft>(NEW_CALENDAR);

  function openNewCalendar() {
    setCalendarDraft(NEW_CALENDAR);
    setCalendarOpen(true);
  }

  function openEditCalendar(calendar: CalendarWorkspace["calendars"][number]) {
    setCalendarDraft({
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      visibility: calendar.visibility,
      subscriptionHost: calendar.subscription?.host,
      feedUrl: "",
    });
    setCalendarOpen(true);
  }

  function submitCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { id, name, color, visibility, feedUrl } = calendarDraft;
    startTransition(() => {
      void (id ? updateCalendar({ calendarId: id, name, color, visibility }) : createCalendar({ name, color, visibility }))
        .then(async () => {
          if (id && feedUrl?.trim()) {
            const result = await updateCalendarSubscriptionUrl({ calendarId: id, url: feedUrl });
            if (result.status === "error") {
              toast.error(feedErrorMessage(t, result.error));
              return;
            }
          }
          setCalendarOpen(false);
          router.refresh();
        })
        .catch(() => toast.error(t("calendarSaveError")));
    });
  }

  return { calendarOpen, setCalendarOpen, calendarDraft, setCalendarDraft, openNewCalendar, openEditCalendar, submitCalendar };
}
