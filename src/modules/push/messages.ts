import { createTranslator } from "next-intl";
import { timeZone, type Locale } from "@/i18n/config";
import type { wikiNotifications } from "@/modules/wiki/schema";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

/** What the service worker shows (public/sw.js). `tag` collapses repeats of the same item. */
export type PushPayload = { title: string; body: string; url: string; tag: string };

const catalogs = { de, en };
type WikiNotificationType = typeof wikiNotifications.$inferSelect.type;

export function pushTranslator(locale: Locale) {
  return createTranslator({ locale, messages: catalogs[locale], timeZone });
}

/** Calendar date (YYYY-MM-DD) and hour in the business time zone. */
export function businessClock(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function activityPayload(locale: Locale, item: {
  id: string; type: WikiNotificationType; actorName: string;
  taskTitle: string | null; pageTitle: string | null; subject: string | null; href: string | null;
}): PushPayload {
  const t = pushTranslator(locale);
  const title = item.taskTitle || item.pageTitle || item.subject || t("wiki.notifications");
  return {
    title,
    body: `${item.actorName} ${t(`wiki.notificationTypes.${item.type}`)} ${title}`,
    url: item.href ?? "/wiki/notifications",
    tag: `notification:${item.id}`,
  };
}

export function calendarPayload(locale: Locale, reminder: { id: string; title: string; startAt: string }): PushPayload {
  const t = pushTranslator(locale);
  const start = new Date(reminder.startAt);
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(start);
  return {
    title: reminder.title,
    body: t("calendar.inAppReminder", { time }),
    url: `/calendar?date=${businessClock(start).date}`,
    tag: `calendar:${reminder.id}:${reminder.startAt}`,
  };
}

/** Morning summary: today's items, then tomorrow's on a second line (or alone when nothing is due today). */
export function tasksDuePayload(locale: Locale, date: string, today: string[], tomorrow: string[]): PushPayload {
  const t = pushTranslator(locale);
  const list = (titles: string[]) => {
    const shown = titles.slice(0, 3).join(", ");
    return titles.length > 3 ? t("push.tasksDueMore", { titles: shown, count: titles.length - 3 }) : shown;
  };
  const lines = today.length
    ? [list(today), ...(tomorrow.length ? [t("push.tasksDueTomorrow", { titles: list(tomorrow) })] : [])]
    : [list(tomorrow)];
  return {
    title: today.length
      ? t("push.tasksDueTitle", { count: today.length })
      : t("push.tasksDueTomorrowTitle", { count: tomorrow.length }),
    body: lines.join("\n"),
    url: "/",
    tag: `tasks-due:${date}`,
  };
}

export function testPayload(locale: Locale): PushPayload {
  const t = pushTranslator(locale);
  return { title: t("push.testTitle"), body: t("push.testBody"), url: "/settings/profile", tag: "test" };
}
