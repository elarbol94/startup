import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Lock, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NetworkContactListItem } from "../../queries";
import { NetworkPill } from "../network-card";
import { dateOnly } from "../network-ui";

/**
 * One person in "My network": who they are, what they could do for us, when we last talked.
 * A due keep-in-touch reminder is always shown; the next date only when sorting by it.
 */
/** "Anna Maria Bauer" → "AB" for the 26 px avatar. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toLocaleUpperCase();
}

export async function ContactRow({ contact, today, showUpcoming }: { contact: NetworkContactListItem; today: string; showUpcoming: boolean }) {
  const t = await getTranslations("network");
  const format = await getFormatter();
  const formatDate = (date: string) => format.dateTime(dateOnly(date), { dateStyle: "medium", timeZone: "UTC" });
  const dueOn = contact.reconnectDueOn;
  const due = dueOn !== null && dueOn <= today;
  const reconnectLabel = dueOn === null ? null
    : !dueOn ? t("reconnect.neverContacted")
      : dueOn === today ? t("reconnect.dueToday")
        : due ? t("reconnect.dueSince", { date: formatDate(dueOn) })
          : showUpcoming ? t("reconnect.nextOn", { date: formatDate(dueOn) }) : null;
  return (
    <Link href={`/network/${contact.id}`} className="grid gap-1.5 px-[18px] py-[11px] text-[13.5px] outline-none focus-visible:bg-accent sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="grid size-[26px] shrink-0 place-items-center rounded-full bg-line-strong text-[10px] font-semibold text-foreground">{initials(contact.name)}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{contact.name}</span>
            {contact.visibility === "private" ? (
              <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("visibility.private")} />
            ) : (
              <UsersRound className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("visibility.team")} />
            )}
          </div>
          {(contact.role || contact.organization || contact.municipalityName) && (
            <div className="truncate text-xs text-muted-foreground">{[contact.role, contact.organization, contact.municipalityName].filter(Boolean).join(" · ")}</div>
          )}
        </div>
      </div>
      <div className="min-w-0 space-y-0.5">
        {contact.activeLeads.slice(0, 2).map((lead) => (
          <div key={lead.id} className="line-clamp-2 sm:line-clamp-1">
            <span className="text-muted-foreground">{t(`kinds.${lead.kind}` as "kinds.info")}:</span> {lead.summary}
          </div>
        ))}
        {contact.activeLeads.length > 2 && (
          <div className="text-xs text-muted-foreground">{t("list.moreLeads", { count: contact.activeLeads.length - 2 })}</div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        {reconnectLabel && (
          <span className={cn("text-xs whitespace-nowrap", due ? "font-medium text-late" : "text-muted-foreground")} data-testid="network-reconnect-label">
            {reconnectLabel}
          </span>
        )}
        {contact.notYetSpoken && <NetworkPill tone="line" data-testid="network-not-spoken-badge">{t("notYetSpoken.badge")}</NetworkPill>}
        {contact.tags.map((tag) => <NetworkPill key={tag.id}>{tag.name}</NetworkPill>)}
        {contact.lastContactOn && (
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {t("list.lastContact", { date: formatDate(contact.lastContactOn) })}
          </span>
        )}
      </div>
    </Link>
  );
}
