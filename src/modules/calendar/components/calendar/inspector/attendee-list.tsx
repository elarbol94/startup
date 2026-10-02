"use client";

// Organizer and participants of an event with each person's RSVP state as a small badge.
// Falls back to the shared CalendarItemPeople when no response data is available.
import { useTranslations } from "next-intl";
import { Check, CircleHelp, Clock3, X } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { cn } from "@/lib/utils";
import type { CalendarItem, CalendarResponse } from "../../../types";
import { CalendarItemPeople } from "../calendar-item-people";

const RESPONSE_STYLE = {
  accepted: { Icon: Check, className: "bg-emerald-600 text-white", label: "inspectorResponseAccepted" },
  tentative: { Icon: CircleHelp, className: "bg-amber-500 text-white", label: "inspectorResponseTentative" },
  declined: { Icon: X, className: "bg-rose-600 text-white", label: "inspectorResponseDeclined" },
  needs_action: { Icon: Clock3, className: "bg-muted text-muted-foreground", label: "inspectorResponseNeedsAction" },
} as const satisfies Record<CalendarResponse, { Icon: unknown; className: string; label: string }>;

function Person({ userId, response }: { userId: string; response: CalendarResponse | undefined }) {
  const t = useTranslations("calendar");
  const style = response ? RESPONSE_STYLE[response] : null;
  return (
    <li className={cn("flex min-w-0 items-center gap-1.5", response === "declined" && "opacity-60")}>
      <UserIdentity userId={userId} compact className={cn(response === "declined" && "line-through")} />
      {style && (
        <span
          className={cn("grid size-3.5 shrink-0 place-items-center rounded-full", style.className)}
          title={t(style.label)}
        >
          <style.Icon className="size-2.5" strokeWidth={3} aria-hidden />
          <span className="sr-only">{t(style.label)}</span>
        </span>
      )}
    </li>
  );
}

export function AttendeeList({ item }: { item: CalendarItem }) {
  const tPeople = useTranslations("userIdentity");
  const responses = item.attendeeResponses;
  const isEvent = item.kind === "event" || item.kind === "focus";
  if (item.detailsHidden) return null;
  if (!isEvent || !responses || Object.keys(responses).length === 0) return <CalendarItemPeople item={item} />;
  const participantIds = [...new Set(item.attendeeIds)].filter((id) => id !== item.assigneeId);
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      {item.assigneeId && (
        <div className="space-y-1">
          <p>{tPeople("organizer")}</p>
          <ul>
            <Person userId={item.assigneeId} response={responses[item.assigneeId]} />
          </ul>
        </div>
      )}
      {participantIds.length > 0 && (
        <div className="space-y-1">
          <p>{tPeople("participants")}</p>
          <ul className="space-y-1">
            {participantIds.map((id) => <Person key={id} userId={id} response={responses[id]} />)}
          </ul>
        </div>
      )}
    </div>
  );
}
