"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Search, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import type { MeetingListItem, MeetingSearchHit } from "../queries";
import { NewMeetingDialog, type MeetingFormOptions } from "./new-meeting-dialog";
import { matchesFilter, meetingListFilters, type MeetingListFilter } from "./meetings-list/list-filters";
import { MeetingRow } from "./meetings-list/meeting-row";

export function MeetingsList({ meetings, hits, query, options, viewerId }: {
  meetings: MeetingListItem[];
  hits: MeetingSearchHit[];
  query: string;
  options: MeetingFormOptions;
  viewerId: string;
}) {
  const t = useTranslations("meetings");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<MeetingListFilter>("all");
  const visible = meetings.filter((meeting) => matchesFilter(meeting, filter));
  const searchInput = useRef<HTMLInputElement>(null);
  useKeyboardShortcuts([
    { shortcut: SECTION_PAGE_SHORTCUTS.meetings.newMeeting, handler: () => setCreating(true) },
    { shortcut: SECTION_PAGE_SHORTCUTS.meetings.search, handler: () => { searchInput.current?.focus(); searchInput.current?.select(); } },
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <form className="relative w-full sm:max-w-sm" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <ShortcutTooltip label={t("search.label")} shortcut={SECTION_PAGE_SHORTCUTS.meetings.search}>
            <Input ref={searchInput} name="q" defaultValue={query} placeholder={t("search.placeholder")} aria-label={t("search.label")} className="pl-8" />
          </ShortcutTooltip>
        </form>
        <ShortcutTooltip label={t("new.button")} shortcut={SECTION_PAGE_SHORTCUTS.meetings.newMeeting}>
          <Button onClick={() => setCreating(true)}><Plus />{t("new.button")}</Button>
        </ShortcutTooltip>
      </div>

      {query && (
        <section className="space-y-2" aria-label={t("search.results")}>
          <h2 className="text-sm font-medium text-muted-foreground">{t("search.results")}</h2>
          {hits.length === 0 ? <p className="text-sm text-muted-foreground">{t("search.empty")}</p> : (
            <ul className="divide-y rounded-xl border">
              {hits.map((hit) => (
                <li key={`${hit.meetingId}-${hit.source}`}>
                  <Link href={`/meetings/${hit.meetingId}`} className="block px-4 py-3 hover:bg-muted/50">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {hit.title}
                      <Badge variant="outline">{t(`search.source.${hit.source}`)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{hit.snippet}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
          <Video className="size-6 text-muted-foreground" />
          <p className="font-medium">{t("empty.title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("empty.description")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("overview.filterLabel")}>
            {meetingListFilters.map((option) => {
              const count = meetings.filter((meeting) => matchesFilter(meeting, option)).length;
              return (
                <Button key={option} size="sm" variant={filter === option ? "secondary" : "ghost"} aria-pressed={filter === option} onClick={() => setFilter(option)}>
                  {t(`overview.filters.${option}`)}
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </Button>
              );
            })}
          </div>
          {visible.length === 0 ? <p className="text-sm text-muted-foreground">{t("overview.filterEmpty")}</p> : (
            <ul className="divide-y rounded-xl border">
              {visible.map((meeting) => <li key={meeting.id}><MeetingRow meeting={meeting} /></li>)}
            </ul>
          )}
        </>
      )}
      <NewMeetingDialog open={creating} onOpenChange={setCreating} options={options} viewerId={viewerId} />
    </div>
  );
}
