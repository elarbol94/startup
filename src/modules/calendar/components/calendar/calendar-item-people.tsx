"use client";

// Organizer/assignee and participant avatars for a calendar item.
// Used by the month, agenda and team views and the inspector.
import { useTranslations } from "next-intl";
import { UserIdentity, UserIdentities } from "@/components/user-identity";
import type { CalendarItem } from "../../types";

/** Calendar queries redact all person IDs for busy-only entries. Respect that here too. */
export function CalendarItemPeople({ item, compact = false }: { item: CalendarItem; compact?: boolean }) {
  const t = useTranslations("userIdentity");
  if (item.detailsHidden) return null;
  const event = item.kind === "event" || item.kind === "focus";
  const primaryIds = event || item.kind === "project" || item.kind === "deadline"
    ? item.assigneeId ? [item.assigneeId] : []
    : item.attendeeIds;
  const participantIds = event ? item.attendeeIds.filter(id => id !== item.assigneeId) : [];
  const relation = event ? "organizer" : item.kind === "project" ? "managedBy" : "assignedTo";
  if (compact) return <span className="inline-flex shrink-0 items-center gap-0.5">
    {primaryIds.map(id => <span key={id} title={t(relation)}><UserIdentity userId={id} compact avatarOnly /></span>)}
    {participantIds.map(id => <span key={id} title={t("participants")}><UserIdentity userId={id} compact avatarOnly /></span>)}
  </span>;
  return <span className="inline-flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
    {primaryIds.length > 0 && <span className="inline-flex flex-wrap items-center gap-1">{t(relation)} <UserIdentities userIds={primaryIds} compact /></span>}
    {participantIds.length > 0 && <span className="inline-flex flex-wrap items-center gap-1">{t("participants")} <UserIdentities userIds={participantIds} compact /></span>}
  </span>;
}
