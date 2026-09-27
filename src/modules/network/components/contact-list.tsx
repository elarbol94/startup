import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Lock, Search, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { listNetworkContacts } from "../queries";
import { dateOnly } from "./network-ui";

type Data = ReturnType<typeof listNetworkContacts>;

function filterHref(query: string, tagId: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tagId) params.set("tag", tagId);
  const search = params.toString();
  return search ? `/network?${search}` : "/network";
}

/** "My network": who we know and why they matter, searchable and filterable by tag. */
export async function ContactList({ data, query, tagId }: { data: Data; query: string; tagId: string }) {
  const t = await getTranslations("network");
  const format = await getFormatter();
  const filtered = Boolean(query || tagId);

  return (
    <div className="space-y-3">
      <form action="/network" className="flex gap-2" role="search">
        {tagId && <input type="hidden" name="tag" value={tagId} />}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" type="search" defaultValue={query} placeholder={t("list.searchPlaceholder")} aria-label={t("list.search")} className="pl-8" />
        </div>
        <Button type="submit" variant="outline">{t("list.search")}</Button>
      </form>

      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("fields.tags")}>
          {data.tags.map((tag) => {
            const active = tag.id === tagId;
            return (
              <Link
                key={tag.id}
                href={filterHref(query, active ? "" : tag.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tag.name} <span className="opacity-70">{tag.count}</span>
              </Link>
            );
          })}
        </div>
      )}

      {data.contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {data.total === 0 ? t("list.empty") : t("list.noMatches")}
          {filtered && data.total > 0 && (
            <div className="mt-2"><Link href="/network" className="text-foreground underline underline-offset-4">{t("list.clearFilters")}</Link></div>
          )}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card" data-testid="network-contact-list">
          {data.contacts.map((contact) => (
            <li key={contact.id}>
              <Link href={`/network/${contact.id}`} className="grid gap-1.5 px-4 py-3 transition-colors hover:bg-muted/50 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{contact.name}</span>
                    {contact.visibility === "private" ? (
                      <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("visibility.private")} />
                    ) : (
                      <UsersRound className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("visibility.team")} />
                    )}
                  </div>
                  {(contact.role || contact.organization) && (
                    <div className="truncate text-xs text-muted-foreground">{[contact.role, contact.organization].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                <div className="min-w-0 space-y-0.5 text-sm">
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
                  {contact.tags.map((tag) => <Badge key={tag.id} variant="secondary">{tag.name}</Badge>)}
                  {contact.lastContactOn && (
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      {t("list.lastContact", { date: format.dateTime(dateOnly(contact.lastContactOn), { dateStyle: "medium", timeZone: "UTC" }) })}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {filtered && data.contacts.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("list.filteredCount", { shown: data.contacts.length, total: data.total })}</p>
      )}
    </div>
  );
}
