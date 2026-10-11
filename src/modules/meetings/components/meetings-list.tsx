"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Search, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import type { MeetingListItem, MeetingSearchHit } from "../queries";
import { NewMeetingDialog, type MeetingFormOptions } from "./new-meeting-dialog";
import { matchesFilter, meetingListFilters, type MeetingListFilter } from "./meetings-list/list-filters";
import { MeetingRow } from "./meetings-list/meeting-row";
import { MeetingPill } from "./meeting-pill";

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
        <section className="overflow-hidden rounded-xl border bg-card shadow-card" aria-label={t("search.results")}>
          <header className="flex items-center gap-2.5 border-b border-line-soft px-[18px] py-3.5">
            <h2 className="text-sm font-semibold">{t("search.results")}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{hits.length}</span>
          </header>
          {hits.length === 0 ? <p className="px-[18px] py-[11px] text-[13.5px] text-muted-foreground">{t("search.empty")}</p> : (
            <ul className="divide-y divide-line-soft">
              {hits.map((hit) => (
                <li key={`${hit.meetingId}-${hit.source}`}>
                  <Link href={`/meetings/${hit.meetingId}`} className="block px-[18px] py-[11px] text-[13.5px] outline-none hover:bg-accent focus-visible:bg-accent">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="truncate">{hit.title}</span>
                      <MeetingPill tone="line">{t(`search.source.${hit.source}`)}</MeetingPill>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{hit.snippet}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {meetings.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-card">
          <EmptyState
            icon={<Video />}
            title={t("empty.title")}
            description={t("empty.description")}
            actions={<Button size="sm" onClick={() => setCreating(true)}><Plus />{t("new.button")}</Button>}
          />
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border bg-card shadow-card" aria-label={t("title")}>
          <header className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-[18px] py-3">
            <div className="flex flex-wrap gap-0.5 rounded-[10px] border bg-muted p-[3px]" role="group" aria-label={t("overview.filterLabel")}>
              {meetingListFilters.map((option) => {
                const count = meetings.filter((meeting) => matchesFilter(meeting, option)).length;
                const active = filter === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(option)}
                    className={cn(
                      "inline-flex h-[26px] items-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-md:h-9",
                      active && "bg-card text-foreground shadow-sm dark:bg-secondary dark:shadow-none",
                    )}
                  >
                    {t(`overview.filters.${option}`)}
                    <span className="text-muted-foreground tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          </header>
          {visible.length === 0 ? <p className="px-[18px] py-[11px] text-[13.5px] text-muted-foreground">{t("overview.filterEmpty")}</p> : (
            <ul className="divide-y divide-line-soft">
              {visible.map((meeting) => <li key={meeting.id}><MeetingRow meeting={meeting} /></li>)}
            </ul>
          )}
        </section>
      )}
      <NewMeetingDialog open={creating} onOpenChange={setCreating} options={options} viewerId={viewerId} />
    </div>
  );
}
