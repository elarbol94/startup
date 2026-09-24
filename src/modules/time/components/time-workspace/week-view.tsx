"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ChevronLeft, ChevronRight, Hand, Plus, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addDays } from "@/modules/calendar/date-utils";
import { entryNetMinutes, type DaySummary } from "../../lib/balance";
import type { TimeEntryView } from "../../queries";
import { clockInVienna, formatDay, formatMinutes, timeHref } from "./time-utils";

export function WeekView({
  weekStart,
  today,
  days,
  entries,
  userParam,
  now,
  onCreate,
  onEdit,
}: {
  weekStart: string;
  today: string;
  days: DaySummary[];
  entries: TimeEntryView[];
  userParam: string | null;
  now: number;
  onCreate: (date: string) => void;
  onEdit: (entry: TimeEntryView) => void;
}) {
  const t = useTranslations("time");
  const locale = useLocale();
  const byDate = new Map<string, TimeEntryView[]>();
  for (const entry of entries) byDate.set(entry.workDate, [...(byDate.get(entry.workDate) ?? []), entry]);

  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2 className="text-base font-semibold">{t("week.title", { date: formatDay(weekStart, locale) })}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="icon" nativeButton={false} aria-label={t("week.previous")} render={<Link href={timeHref({ week: addDays(weekStart, -7), user: userParam })} />}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href={timeHref({ user: userParam })} />}>
            {t("week.today")}
          </Button>
          <Button variant="outline" size="icon" nativeButton={false} aria-label={t("week.next")} render={<Link href={timeHref({ week: addDays(weekStart, 7), user: userParam })} />}>
            <ChevronRight className="size-4" />
          </Button>
          <Button onClick={() => onCreate(weekStart <= today && today < addDays(weekStart, 7) ? today : weekStart)}>
            <Plus className="size-4" />
            {t("week.addEntry")}
          </Button>
        </div>
      </header>
      <ol className="divide-y">
        {days.map((day) => {
          const dayEntries = byDate.get(day.date) ?? [];
          return (
            <li key={day.date} className={`grid gap-2 p-4 md:grid-cols-[10rem_1fr_7rem] ${day.date === today ? "bg-muted/40" : ""}`}>
              <div>
                <p className="text-sm font-medium">{formatDay(day.date, locale)}</p>
                {day.holiday && <Badge variant="secondary" className="mt-1">{t(`holidays.${day.holiday}`)}</Badge>}
              </div>
              <div className="min-w-0 space-y-1.5">
                {dayEntries.length === 0 && <p className="text-sm text-muted-foreground">{t("week.noEntries")}</p>}
                {dayEntries.map((entry) => {
                  const net = entryNetMinutes(
                    { startedAt: new Date(entry.startedAt), endedAt: entry.endedAt ? new Date(entry.endedAt) : null, breakMinutes: entry.breakMinutes },
                    new Date(now),
                  );
                  const SourceIcon = entry.source === "timer" ? Timer : Hand;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={!entry.endedAt}
                      onClick={() => onEdit(entry)}
                      className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <SourceIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={entry.source === "timer" ? t("week.sourceTimer") : t("week.sourceManual")} />
                      <span className="font-mono tabular-nums">
                        {clockInVienna(entry.startedAt)}–{entry.endedAt ? clockInVienna(entry.endedAt) : t("week.running")}
                      </span>
                      <span className="font-medium tabular-nums">{formatMinutes(net)}</span>
                      {entry.projectName && (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.projectColor ?? undefined }} />
                          <span className="truncate">{entry.projectName}{entry.taskTitle ? ` · ${entry.taskTitle}` : ""}</span>
                        </span>
                      )}
                      {entry.kind !== "work" && <Badge variant="outline">{t(`kinds.${entry.kind}`)}</Badge>}
                      {entry.note && <span className="min-w-0 truncate text-muted-foreground">{entry.note}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="text-right text-sm tabular-nums">
                <p className="font-semibold">
                  {day.longDay && <AlertTriangle className="mr-1 inline size-3.5 text-amber-600" aria-label={t("week.longDay")} />}
                  {formatMinutes(day.actualMinutes)}
                </p>
                {day.targetMinutes > 0 && <p className="text-xs text-muted-foreground">{t("week.target", { value: formatMinutes(day.targetMinutes) })}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
