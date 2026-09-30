"use client";

// Polls for due calendar reminders every minute and shows them as toasts.
// Used by calendar-client.tsx.
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlarmClock } from "lucide-react";
import { toast } from "sonner";
import { claimDueCalendarReminders } from "../../reminder-actions";

export function useCalendarReminderPolling(
  locale: string,
  t: ReturnType<typeof useTranslations<"calendar">>,
) {
  useEffect(() => {
    let active = true;
    async function checkReminders() {
      try {
        const reminders = await claimDueCalendarReminders();
        if (!active) return;
        for (const reminder of reminders) {
          toast(reminder.title, {
            description: t("inAppReminder", {
              time: new Intl.DateTimeFormat(locale, {
                timeStyle: "short",
              }).format(new Date(reminder.startAt)),
            }),
            icon: <AlarmClock className="size-4 text-[#D97706]" />,
          });
        }
      } catch {
        // Reminder polling should never interrupt calendar work.
      }
    }
    void checkReminders();
    const timer = window.setInterval(checkReminders, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [locale, t]);
}
