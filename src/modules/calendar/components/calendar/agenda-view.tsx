"use client";

// Agenda (day-grouped list) view of calendar items.
// Used by calendar-client.tsx; the pieces live in ./agenda/.
import type { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { CalendarItem } from "../../types";
import { AgendaDay } from "./agenda/agenda-day";
import { buildAgendaDays } from "./agenda/agenda-utils";
import { useNowMinute } from "./agenda/use-now-minute";

export function AgendaView({
  days,
  today,
  items,
  locale,
  timezone,
  t,
  selectedId,
  onSelect,
}: {
  days: string[];
  today: string;
  items: CalendarItem[];
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  selectedId: string | null;
  onSelect: (item: CalendarItem) => void;
}) {
  const now = useNowMinute();
  const groups = buildAgendaDays(items, days, today, timezone);
  if (groups.length === 0) {
    return (
      <div className="grid min-h-[32rem] place-items-center">
        <EmptyState icon={<CalendarDays />} title={t("empty")} />
      </div>
    );
  }
  return (
    <div>
      {groups.map((group) => (
        <AgendaDay
          key={group.day}
          group={group}
          today={today}
          now={now}
          locale={locale}
          timezone={timezone}
          t={t}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
