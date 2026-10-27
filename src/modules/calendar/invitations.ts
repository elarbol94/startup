import { db } from "@/db";
import { wikiNotifications } from "@/db/schema";
import type { calendarEvents } from "./schema";
import { calendarItemShareHref } from "./share-href";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InvitedEvent = Pick<typeof calendarEvents.$inferSelect, "id" | "title" | "allDay" | "startDate" | "startAt" | "timezone">;

/** Run inside the event mutation: tells attendees added since the last save (inbox, and push). */
export function notifyNewAttendees(tx: Transaction, input: {
  event: InvitedEvent; actorId: string; attendeeIds: string[]; previousIds: string[];
}) {
  const { event } = input;
  const added = input.attendeeIds.filter((id) => id !== input.actorId && !input.previousIds.includes(id));
  if (!added.length) return;
  // The first occurrence's key, as expandEventOccurrences builds it.
  const occurrenceKey = event.allDay ? event.startDate ?? event.id : event.startAt?.toISOString() ?? event.id;
  const link = calendarItemShareHref({
    id: `${event.id}:${occurrenceKey}`, kind: "event", href: null,
    startDate: event.startDate, startAt: event.startAt?.toISOString() ?? null,
  }, event.timezone);
  tx.insert(wikiNotifications).values(added.map((userId) => ({
    userId, actorId: input.actorId, type: "invitation" as const, subject: event.title, link,
  }))).run();
}
