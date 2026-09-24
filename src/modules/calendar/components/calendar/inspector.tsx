"use client";

// Detail panel for the selected calendar item.
// Used by calendar-client.tsx (side panel and mobile bottom sheet).
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BriefcaseBusiness,
  Clock3,
  ExternalLink,
  MapPin,
  Repeat2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays } from "../../date-utils";
import { formatAustrianDate } from "../../localized-date-time";
import type { CalendarItem } from "../../types";
import { CalendarItemPeople } from "./calendar-item-people";
import { SourceIcon } from "./source-icon";

export function Inspector({
  item,
  locale,
  timezone,
  t,
  onClose,
  onEdit,
}: {
  item: CalendarItem;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="sticky top-4 rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
          style={{ backgroundColor: item.color }}
        >
          <SourceIcon kind={item.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("details")}
          </p>
          <h2 className="mt-1 text-base font-semibold leading-snug">{item.title}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")}>
          <X />
        </Button>
      </div>
      <div className="mt-4 space-y-3 text-xs">
        <p className="flex items-start gap-2">
          <Clock3 className="mt-0.5 size-3.5 text-muted-foreground" />
          <span>
            {item.allDay
              ? `${formatAustrianDate(item.startDate!)} – ${formatAustrianDate(addDays(item.endDate!, -1))}`
              : new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
                hourCycle: "h23",
                timeZone: timezone,
              }).format(new Date(item.startAt!))}
          </span>
        </p>
        {item.location && (
          <p className="flex items-start gap-2">
            <BriefcaseBusiness className="mt-0.5 size-3.5 text-muted-foreground" />
            <span>{item.location}</span>
          </p>
        )}
        {item.address && (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 text-muted-foreground" />
            <span>{item.address}</span>
          </p>
        )}
        {item.recurring && (
          <p className="flex items-center gap-2">
            <Repeat2 className="size-3.5 text-muted-foreground" />
            {t("recurring")}
          </p>
        )}
        <CalendarItemPeople item={item} />
        {item.description && (
          <p className="whitespace-pre-wrap border-t pt-3 leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>
      <div className="mt-5 flex gap-2">
        {(item.kind === "event" || item.kind === "focus") && item.editable && (
          <Button size="sm" onClick={onEdit}>
            {t("edit")}
          </Button>
        )}
        {item.href && (
          <Button variant="outline" size="sm" render={<Link href={item.href} />}>
            <ExternalLink />
            {t("openSource")}
          </Button>
        )}
      </div>
    </div>
  );
}
