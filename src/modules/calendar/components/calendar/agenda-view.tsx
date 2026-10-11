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

const PHONE_LIST_DAYS = 7;

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
  // Phones list the first week day by day, empty days included (design 1b day list);
  // the wider agenda only shows days that have something on them.
  const groups = buildAgendaDays(items, days, today, timezone, PHONE_LIST_DAYS);
  const desktopDays = new Set(buildAgendaDays(items, days, today, timezone).map((group) => group.day));
  return (
    <div>
      {desktopDays.size === 0 && (
        <div className="grid min-h-[32rem] place-items-center max-md:hidden">
          <EmptyState icon={<CalendarDays />} title={t("empty")} />
        </div>
      )}
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
          phoneOnly={!desktopDays.has(group.day)}
        />
      ))}
    </div>
  );
}
