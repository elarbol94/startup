"use client";
import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { OverviewUpNext } from "../overview-data";

function Row({ when, accent, children }: { when: string; accent: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-[18px] py-[11px] text-[13.5px]">
      <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{when}</span>
      <span aria-hidden className={cn("w-[3px] self-stretch rounded-full", accent ? "bg-brand" : "bg-line-strong")} />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function Title({ href, children }: { href: string | null; children: string }) {
  return href
    ? <Link href={href} className="block truncate font-medium hover:underline">{children}</Link>
    : <span className="block truncate font-medium">{children}</span>;
}

/** "Als Nächstes" (design 1b): the next open deadline and what is on the calendar today. */
export function OverviewUpNext({ upNext }: { upNext: OverviewUpNext }) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const [now] = useState(() => new Date());
  const { deadline, events } = upNext;
  const deadlineDate = deadline ? (deadline.deadlineAt ? new Date(deadline.deadlineAt) : new Date(`${deadline.deadlineDate}T12:00:00`)) : null;

  return (
    <section aria-labelledby="overview-up-next" className="overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="border-b border-line-soft px-[18px] py-3.5">
        <h2 id="overview-up-next" className="text-sm font-semibold">{t("upNext")}</h2>
      </header>
      <ul className="divide-y divide-line-soft">
        {deadline && deadlineDate ? (
          <Row when={format.dateTime(deadlineDate, { day: "2-digit", month: "2-digit" })} accent>
            <Title href={deadline.href}>{deadline.title}</Title>
            <p className="text-xs text-muted-foreground">{t("deadlineIn", { when: format.relativeTime(deadlineDate, now) })}</p>
          </Row>
        ) : (
          <Row when="—" accent={false}><span className="text-muted-foreground">{t("noNextDeadline")}</span></Row>
        )}
        {events.length ? events.map((event, index) => (
          <Row key={event.id} when={index === 0 ? t("today") : ""} accent>
            <Title href={event.href}>{event.title}</Title>
            <p className="truncate text-xs text-muted-foreground">
              {event.allDay || !event.date ? t("allDay") : format.dateTime(event.date, { hour: "2-digit", minute: "2-digit" })}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </Row>
        )) : (
          <Row when={t("today")} accent={false}><span className="text-muted-foreground">{t("noEventsToday")}</span></Row>
        )}
      </ul>
    </section>
  );
}
