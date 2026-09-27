// The project's activity feed, grouped by day. Used by the project page.
import type { ReactNode } from "react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  CalendarRange,
  CheckCircle2,
  CirclePlus,
  Clock3,
  Link2,
  ReceiptText,
} from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { localDateInZone } from "@/modules/calendar/date-utils";
import type { ActivityItem, ActivityKind } from "../activity";

const TIME_ZONE = "Europe/Vienna";

const ICONS: Record<ActivityKind, ReactNode> = {
  taskCreated: <CirclePlus />,
  taskDone: <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" />,
  time: <Clock3 />,
  linked: <Link2 />,
  schedule: <CalendarRange />,
  invoicePaid: <ReceiptText className="text-emerald-600 dark:text-emerald-400" />,
};

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(".", ",");
}

export async function ProjectActivityFeed({
  items,
  hasMore,
  moreHref,
  today,
}: {
  items: ActivityItem[];
  hasMore: boolean;
  moreHref: string;
  today: string;
}) {
  const t = await getTranslations("projectLinks.activity");
  const format = await getFormatter();

  const yesterday = localDateInZone(new Date(new Date(`${today}T12:00:00Z`).getTime() - 86_400_000), TIME_ZONE);
  const days: { date: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const date = localDateInZone(new Date(item.at), TIME_ZONE);
    const day = days.at(-1);
    if (day?.date === date) day.items.push(item);
    else days.push({ date, items: [item] });
  }

  function dayLabel(date: string) {
    if (date === today) return t("today");
    if (date === yesterday) return t("yesterday");
    return format.dateTime(new Date(`${date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric", timeZone: "UTC" });
  }

  function subject(item: ActivityItem) {
    return item.href ? (
      <Link href={item.href} className="font-medium text-foreground underline-offset-2 hover:underline">
        {item.title}
      </Link>
    ) : (
      <span className="font-medium text-foreground">{item.title}</span>
    );
  }

  function sentence(item: ActivityItem) {
    const title = () => subject(item);
    switch (item.kind) {
      case "taskCreated":
        return t.rich("taskCreated", { title });
      case "taskDone":
        return t.rich("taskDone", { title });
      case "time":
        return t("time", { hours: formatHours(item.minutes ?? 0) });
      case "linked":
        return t.rich("linked", { title, type: t(`types.${item.targetType ?? "app"}`) });
      case "schedule":
        return item.reverted ? t("scheduleReverted", { count: item.count ?? 0 }) : t("schedule", { count: item.count ?? 0 });
      case "invoicePaid":
        return t.rich("invoicePaid", { title });
    }
  }

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
        {t("empty")}
      </section>
    );
  }

  return (
    <section className="grid max-w-3xl gap-5" aria-label={t("label")}>
      {days.map((day) => (
        <div key={day.date} className="grid gap-1">
          <h2 className="sticky top-0 z-10 bg-background/95 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
            {dayLabel(day.date)}
          </h2>
          <ol className="ml-2.5 grid border-l pl-5">
            {day.items.map((item) => (
              <li key={item.id} className="relative flex min-w-0 items-start gap-2.5 py-1.5 text-sm">
                <span className="absolute top-1.5 -left-[1.875rem] grid size-5 place-items-center rounded-full border bg-background text-muted-foreground [&_svg]:size-3">
                  {ICONS[item.kind]}
                </span>
                {item.actorId && <UserIdentity userId={item.actorId} compact className="shrink-0" />}
                <span className="min-w-0 flex-1 text-muted-foreground">{sentence(item)}</span>
                {item.kind !== "time" && (
                  <time className="shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={new Date(item.at).toISOString()}>
                    {format.dateTime(new Date(item.at), { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE })}
                  </time>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {hasMore && (
        <Link href={moreHref} scroll={false} className="justify-self-start rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          {t("more")}
        </Link>
      )}
    </section>
  );
}
