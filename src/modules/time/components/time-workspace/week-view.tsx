"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ChevronLeft, ChevronRight, Hand, Plus, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import { addDays } from "@/modules/calendar/date-utils";
import { entryNetMinutes, type DaySummary } from "../../lib/balance";
import type { TimeEntryView } from "../../queries";
import { clockInVienna, formatDay, formatMinutes, timeHref } from "./time-utils";

export function WeekView({
  weekStart,
  today,
  days,
  entries,
  now,
  onCreate,
  onEdit,
}: {
  weekStart: string;
  today: string;
  days: DaySummary[];
  entries: TimeEntryView[];
  now: number;
  onCreate: (date: string) => void;
  onEdit: (entry: TimeEntryView) => void;
}) {
  const t = useTranslations("time");
  const locale = useLocale();
  const byDate = new Map<string, TimeEntryView[]>();
  for (const entry of entries) byDate.set(entry.workDate, [...(byDate.get(entry.workDate) ?? []), entry]);
  const router = useRouter();
  const createEntry = () => onCreate(weekStart <= today && today < addDays(weekStart, 7) ? today : weekStart);
  useKeyboardShortcuts([
    { shortcut: SECTION_PAGE_SHORTCUTS.time.newEntry, handler: createEntry },
    { shortcut: SECTION_PAGE_SHORTCUTS.time.today, handler: () => router.push(timeHref({})) },
  ]);

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line-soft px-[18px] py-3">
        <h2 className="text-[15px] font-semibold">{t("week.title", { date: formatDay(weekStart, locale) })}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="icon-sm" nativeButton={false} aria-label={t("week.previous")} render={<Link href={timeHref({ week: addDays(weekStart, -7) })} />}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <ShortcutTooltip label={t("week.today")} shortcut={SECTION_PAGE_SHORTCUTS.time.today}>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={timeHref({})} />}>
              {t("week.today")}
            </Button>
          </ShortcutTooltip>
          <Button variant="outline" size="icon-sm" nativeButton={false} aria-label={t("week.next")} render={<Link href={timeHref({ week: addDays(weekStart, 7) })} />}>
            <ChevronRight className="size-3.5" />
          </Button>
          <ShortcutTooltip label={t("week.addEntry")} shortcut={SECTION_PAGE_SHORTCUTS.time.newEntry}>
            <Button size="sm" onClick={createEntry}>
              <Plus className="size-3.5" />
              {t("week.addEntry")}
            </Button>
          </ShortcutTooltip>
        </div>
      </header>
      <ol className="divide-y divide-line-soft">
        {days.map((day) => {
          const dayEntries = byDate.get(day.date) ?? [];
          const isToday = day.date === today;
          return (
            <li
              key={day.date}
              aria-current={isToday ? "date" : undefined}
              className={cn("grid gap-x-4 gap-y-1.5 px-[18px] py-[11px] text-[13.5px] md:grid-cols-[120px_minmax(0,1fr)_auto]", isToday && "bg-surface-raised")}
            >
              <div className="flex flex-wrap items-center gap-1.5 md:block">
                <p className={cn("font-medium", isToday && "text-brand-ink")}>{formatDay(day.date, locale)}</p>
                {day.holiday && (
                  <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-semibold whitespace-nowrap text-text-secondary md:mt-1">
                    {t(`holidays.${day.holiday}`)}
                  </span>
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                {dayEntries.length === 0 && <p className="text-muted-foreground">{t("week.noEntries")}</p>}
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
                      className="-mx-2 flex w-[calc(100%+1rem)] min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <SourceIcon className="size-3.5 shrink-0 text-text-tertiary" aria-label={entry.source === "timer" ? t("week.sourceTimer") : t("week.sourceManual")} />
                      <span className={cn("font-mono text-[12.5px] tabular-nums", !entry.endedAt && "text-brand-ink")}>
                        {clockInVienna(entry.startedAt)}–{entry.endedAt ? clockInVienna(entry.endedAt) : t("week.running")}
                      </span>
                      <span className="font-medium tabular-nums">{formatMinutes(net)}</span>
                      {entry.projectName && (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.projectColor ?? undefined }} />
                          <span className="truncate">{entry.projectName}{entry.taskTitle ? ` · ${entry.taskTitle}` : ""}</span>
                        </span>
                      )}
                      {entry.kind !== "work" && (
                        <span className="inline-flex h-5 items-center rounded-full border border-line-strong px-2 text-[11px] font-medium whitespace-nowrap text-text-secondary">
                          {t(`kinds.${entry.kind}`)}
                        </span>
                      )}
                      {entry.note && <span className="min-w-0 truncate text-muted-foreground">{entry.note}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="tabular-nums md:text-right">
                <p className="font-semibold">
                  {day.longDay && <AlertTriangle className="mr-1 inline size-3.5 align-[-2px] text-late" aria-label={t("week.longDay")} />}
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
