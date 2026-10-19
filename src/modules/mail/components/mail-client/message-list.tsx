"use client";

import type { Ref } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Inbox, Paperclip, Reply, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { MAIL_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import type { MailListItem, MailListPage } from "../../types";
import { formatListDate } from "./format";
import type { Loadable } from "./use-mailbox";

type Props = {
  title: string;
  state: Loadable<MailListPage>;
  selectedUid: number | null;
  /** In Sent/Drafts the recipient is more useful than the sender. */
  showRecipients: boolean;
  query: string;
  unreadOnly: boolean;
  onQueryChange: (query: string) => void;
  onUnreadOnlyChange: (value: boolean) => void;
  onPageChange: (page: number) => void;
  onOpen: (item: MailListItem) => void;
  searchRef: Ref<HTMLInputElement>;
};

export function MessageList({ title, state, selectedUid, showRecipients, query, unreadOnly, onQueryChange, onUnreadOnlyChange, onPageChange, onOpen, searchRef }: Props) {
  const t = useTranslations("mail");
  const tErrors = useTranslations("mail.errors");
  const locale = useLocale();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line-soft px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <div className="flex gap-0.5 rounded-[9px] border bg-muted p-[2px] text-[12px]" role="group" aria-label={t("list.filterLabel")}>
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={unreadOnly === value}
                onClick={() => onUnreadOnlyChange(value)}
                className={cn("h-6 rounded-[7px] px-2 font-medium text-muted-foreground", unreadOnly === value && "bg-card text-foreground shadow-sm dark:bg-secondary")}
              >
                {value ? t("list.unread") : t("list.all")}
              </button>
            ))}
          </div>
        </div>
        <form
          role="search"
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            onQueryChange(String(new FormData(event.currentTarget).get("q") ?? ""));
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <ShortcutTooltip label={t("list.search")} shortcut={MAIL_PAGE_SHORTCUTS.search}>
            <Input
              ref={searchRef}
              name="q"
              key={query}
              defaultValue={query}
              placeholder={t("list.searchPlaceholder")}
              aria-label={t("list.search")}
              className="pl-8"
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  onQueryChange("");
                }
              }}
            />
          </ShortcutTooltip>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.status === "loading" || state.status === "idle" ? (
          <ul className="divide-y divide-line-soft" aria-busy="true">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index} className="space-y-1.5 px-3 py-2.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3.5 w-4/5" /></li>
            ))}
          </ul>
        ) : state.status === "error" ? (
          <EmptyState compact icon={<Inbox />} title={tErrors(state.error)} description={state.detail} />
        ) : state.value.items.length === 0 ? (
          <EmptyState compact icon={<Inbox />} title={query ? t("list.noResults") : t("list.empty")} />
        ) : (
          <ul className="divide-y divide-line-soft" aria-label={title}>
            {state.value.items.map((item) => {
              const people = showRecipients ? item.to : item.from;
              const person = people[0];
              const selected = item.uid === selectedUid;
              return (
                <li key={item.uid}>
                  <button
                    type="button"
                    data-mail-uid={item.uid}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onOpen(item)}
                    className={cn(
                      "relative block w-full px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:bg-accent",
                      selected && "bg-accent",
                      !item.seen && "before:absolute before:top-3.5 before:left-1 before:size-1.5 before:rounded-full before:bg-primary",
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", !item.seen ? "font-semibold" : "text-foreground/90")}>
                        {showRecipients ? `${t("list.toPrefix")} ` : ""}
                        {person ? person.name || person.address : t("list.unknownSender")}
                        {people.length > 1 ? <span className="text-muted-foreground"> +{people.length - 1}</span> : null}
                      </span>
                      <time className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums" dateTime={item.date}>{formatListDate(item.date, locale)}</time>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {item.answered ? <Reply className="size-3 shrink-0 text-muted-foreground" aria-label={t("list.answered")} /> : null}
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", !item.seen ? "font-medium" : "text-muted-foreground")}>{item.subject || t("list.noSubject")}</span>
                      {item.hasAttachments ? <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label={t("list.hasAttachments")} /> : null}
                      {item.flagged ? <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" aria-label={t("list.flagged")} /> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {state.status === "ready" && state.value.total > state.value.pageSize ? (
        <div className="flex items-center justify-between border-t border-line-soft px-3 py-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t("list.range", {
              from: state.value.page * state.value.pageSize + 1,
              to: Math.min(state.value.total, (state.value.page + 1) * state.value.pageSize),
              total: state.value.total,
            })}
          </span>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon-xs" disabled={state.value.page === 0} onClick={() => onPageChange(state.value.page - 1)} aria-label={t("list.newer")}><ChevronLeft /></Button>
            <Button variant="ghost" size="icon-xs" disabled={(state.value.page + 1) * state.value.pageSize >= state.value.total} onClick={() => onPageChange(state.value.page + 1)} aria-label={t("list.older")}><ChevronRight /></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
