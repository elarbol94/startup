"use client";

// Team view: a free/busy timeline with one row per member and a mini
// working-day timeline per day, plus an "all free" row. Used by calendar-client.tsx.
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { UserIdentity } from "@/components/user-identity";
import { cn } from "@/lib/utils";
import { parseDate } from "../../date-utils";
import type { CalendarItem, CalendarWorkspace } from "../../types";
import { freeWindows, hourTicks, mergeIntervals, percentOf, workingRange } from "./team/free-busy";
import { memberDay } from "./team/team-day";
import { TeamDayCell } from "./team/team-day-cell";
import { intervalLabel, tickStepHours } from "./team/team-format";
import { TeamDayHeader, TeamTimelineTrack } from "./team/team-timeline";

const NAME_COLUMN = "9rem";
const MIN_DAY_COLUMN = "6rem";

export function TeamView({
  days,
  today,
  items,
  members,
  locale,
  timezone,
  t,
  preferences,
  selectedId,
  onSelect,
}: {
  days: string[];
  today: string;
  items: CalendarItem[];
  members: { id: string; name: string }[];
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  preferences: CalendarWorkspace["preferences"];
  selectedId: string | null;
  onSelect: (item: CalendarItem) => void;
}) {
  const range = useMemo(
    () => workingRange(preferences.workingDayStart, preferences.workingDayEnd),
    [preferences.workingDayStart, preferences.workingDayEnd],
  );
  const ticks = useMemo(() => hourTicks(range, tickStepHours(days.length)), [range, days.length]);
  const rows = useMemo(
    () =>
      members.map((member) => ({
        member,
        days: days.map((day) => memberDay(items, member.id, day, timezone, range)),
      })),
    [members, days, items, timezone, range],
  );
  const commonFree = useMemo(
    () =>
      days.map((_, index) =>
        freeWindows(mergeIntervals(rows.flatMap((row) => row.days[index].busy)), range),
      ),
    [days, rows, range],
  );
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const gridStyle = {
    gridTemplateColumns: `${NAME_COLUMN} repeat(${days.length}, minmax(${MIN_DAY_COLUMN}, 1fr))`,
  };
  const nameCell = "sticky left-0 z-10 flex min-w-0 items-center border-r border-line-soft bg-card px-3";

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `calc(${NAME_COLUMN} + ${days.length} * ${MIN_DAY_COLUMN})` }}>
        <div className="grid border-b bg-surface-raised" style={gridStyle}>
          <div className={cn(nameCell, "bg-surface-raised text-[11.5px] font-medium text-muted-foreground")}>
            <span className="truncate">{t("people")}</span>
          </div>
          {days.map((day) => (
            <TeamDayHeader
              key={day}
              label={weekday.format(parseDate(day))}
              date={parseDate(day).getUTCDate()}
              isToday={day === today}
              range={range}
              ticks={ticks}
            />
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.member.id} className="grid min-h-14 border-b border-line-soft" style={gridStyle}>
            <div className={cn(nameCell, "text-[13px]")}>
              <UserIdentity userId={row.member.id} name={row.member.name} />
            </div>
            {row.days.map((data, index) => (
              <TeamDayCell
                key={days[index]}
                data={data}
                range={range}
                ticks={ticks}
                isToday={days[index] === today}
                selectedId={selectedId}
                locale={locale}
                timezone={timezone}
                t={t}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
        {members.length === 0 ? (
          <p className="p-6 text-center text-[13.5px] text-muted-foreground">{t("teamNoMembers")}</p>
        ) : (
          <div className="grid" style={gridStyle}>
            <div className={cn(nameCell, "py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary")} title={t("teamAllFreeHint")}>
              <span className="truncate">{t("teamAllFree")}</span>
            </div>
            {days.map((day, index) => {
              const windows = commonFree[index];
              return (
                <div
                  key={day}
                  className={cn("min-w-0 border-r border-line-soft px-1.5 py-2.5 last:border-r-0", day === today && "bg-brand-soft")}
                  title={windows.length === 0 ? t("teamNoCommonSlot") : undefined}
                >
                  <TeamTimelineTrack range={range} ticks={ticks} className="h-3">
                    {windows.map((window) => {
                      const { left, width } = percentOf(window, range);
                      const label = t("teamCommonSlot", { range: intervalLabel(window) });
                      return (
                        <span
                          key={window.start}
                          title={label}
                          aria-label={label}
                          role="img"
                          className="absolute inset-y-0 rounded-[3px] bg-brand/70"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                      );
                    })}
                  </TeamTimelineTrack>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
