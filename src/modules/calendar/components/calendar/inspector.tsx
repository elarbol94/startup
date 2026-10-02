"use client";

// Detail panel for the selected calendar item.
// Used by calendar-client.tsx (side panel and mobile bottom sheet).
// Escape-to-close is handled globally by the calendar client, not here.
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BriefcaseBusiness,
  Clock3,
  Copy,
  ExternalLink,
  MapPin,
  Pencil,
  Repeat2,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import type { CalendarItem } from "../../types";
import { ProjectChip } from "@/modules/projects/components/project-chip";
import { SourceIcon } from "./source-icon";
import { CalendarShortcutKeys } from "./calendar-shortcuts-help";
import { AttendeeList } from "./inspector/attendee-list";
import { detectJoinUrl, formatItemTimeRange, linkifyText } from "./inspector/inspector-utils";
import { RsvpControl } from "./inspector/rsvp-control";

function LinkifiedText({ text }: { text: string }) {
  return linkifyText(text).map((segment, index) =>
    segment.type === "link" ? (
      <a
        key={index}
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-primary underline underline-offset-2 hover:no-underline"
      >
        {segment.value}
      </a>
    ) : (
      <span key={index}>{segment.value}</span>
    ),
  );
}

export function Inspector({
  item,
  locale,
  timezone,
  t,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  item: CalendarItem;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onClose: () => void;
  onEdit: () => void;
  /** Rendered only when provided (events and focus blocks with visible details). */
  onDuplicate?: () => void;
  /** Rendered only when provided and the item is an editable event or focus block. */
  onDelete?: () => void;
}) {
  const isEvent = item.kind === "event" || item.kind === "focus";
  const canEdit = isEvent && item.editable;
  const joinUrl = detectJoinUrl(item.location);
  const timeRange = formatItemTimeRange(item, locale, timezone);
  const showRsvp = item.kind === "event" && item.myResponse !== null && !item.detailsHidden;

  return (
    <div className="sticky top-4 overflow-hidden rounded-2xl border bg-card">
      <div className="h-1.5" style={{ backgroundColor: item.color }} aria-hidden />
      <div className="p-4">
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
            <h2 className="mt-1 break-words text-base font-semibold leading-snug">{item.title}</h2>
          </div>
          <ShortcutTooltip label={t("close")} keys={<CalendarShortcutKeys shortcuts={["Escape"]} />} hint={t("hintCloseDetails")}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={t("close")}
              aria-keyshortcuts="Escape"
            >
              <X />
            </Button>
          </ShortcutTooltip>
        </div>
        <div className="mt-4 space-y-3 text-xs">
          <p className="flex items-start gap-2">
            <Clock3 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>
              {timeRange}
              {item.allDay && <span className="text-muted-foreground"> · {t("allDay")}</span>}
            </span>
          </p>
          {item.location && (
            <div className="flex items-start gap-2">
              {joinUrl ? (
                <Video className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <BriefcaseBusiness className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="break-words">{item.location}</p>
                {joinUrl && (
                  <Button
                    size="xs"
                    render={<a href={joinUrl} target="_blank" rel="noopener noreferrer" />}
                  >
                    <Video />
                    {t("inspectorJoin")}
                  </Button>
                )}
              </div>
            </div>
          )}
          {item.address && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="break-words">{item.address}</span>
            </p>
          )}
          {item.recurring && (
            <p className="flex items-center gap-2">
              <Repeat2 className="size-3.5 text-muted-foreground" />
              {t("recurring")}
            </p>
          )}
          {item.projects && item.projects.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label={t("projects")}>
              {item.projects.map((project) => (
                <ProjectChip key={project.id} project={project} size="xs" />
              ))}
            </div>
          )}
          <AttendeeList item={item} />
          {showRsvp && item.myResponse && (
            <RsvpControl eventId={item.sourceId} response={item.myResponse} recurring={item.recurring} />
          )}
          {item.description && (
            <p className="whitespace-pre-wrap break-words border-t pt-3 leading-relaxed text-muted-foreground">
              <LinkifiedText text={item.description} />
            </p>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={t("inspectorActions")}>
          {canEdit && (
            <ShortcutTooltip label={t("edit")} hint={t("hintEdit")}>
              <Button size="sm" onClick={onEdit}>
                <Pencil />
                {t("edit")}
              </Button>
            </ShortcutTooltip>
          )}
          {onDuplicate && isEvent && !item.detailsHidden && (
            <ShortcutTooltip label={t("inspectorDuplicate")} hint={t("hintDuplicate")}>
              <Button variant="outline" size="sm" onClick={onDuplicate}>
                <Copy />
                {t("inspectorDuplicate")}
              </Button>
            </ShortcutTooltip>
          )}
          {item.href && (
            <ShortcutTooltip label={t("openSource")} hint={t("hintOpenSource")}>
              <Button variant="outline" size="sm" render={<Link href={item.href} />}>
                <ExternalLink />
                {t("openSource")}
              </Button>
            </ShortcutTooltip>
          )}
          {onDelete && canEdit && (
            <ShortcutTooltip label={t("delete")} hint={t("hintDelete")}>
              <Button variant="destructive" size="sm" onClick={onDelete} className="ml-auto">
                <Trash2 />
                {t("delete")}
              </Button>
            </ShortcutTooltip>
          )}
        </div>
      </div>
    </div>
  );
}
