import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Handshake } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { defaultContactListFilter, isContactListFiltered, networkFilterHref } from "../contact-filters";
import type { listNetworkContacts } from "../queries";
import { ContactFilters } from "./contact-list/contact-filters";
import { ContactRow } from "./contact-list/contact-row";
import { ContactBulkBar } from "./contact-list/contact-bulk-bar";
import { networkCardClass, networkListClass } from "./network-card";
import { RowSelectCheckbox, RowSelectionProvider, SelectAllCheckbox } from "@/components/row-selection";

type Data = ReturnType<typeof listNetworkContacts>;

/** "My network": who we know and why they matter, searchable, filterable and sortable. */
export async function ContactList({ data, today }: { data: Data; today: string }) {
  const t = await getTranslations("network");
  const { filter } = data;
  const filtered = isContactListFiltered(filter);
  const clearHref = networkFilterHref(defaultContactListFilter, { sort: filter.sort });

  return (
    <div className="space-y-3">
      <ContactFilters
        filter={filter}
        organizations={data.organizations}
        municipalities={data.municipalities}
        clearHref={filtered ? clearHref : null}
      />

      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("fields.tags")}>
          {data.tags.map((tag) => {
            const active = tag.id === filter.tagId;
            return (
              <Link
                key={tag.id}
                href={networkFilterHref(filter, { tagId: active ? "" : tag.id })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-brand bg-brand-soft text-brand-ink" : "border-line-strong text-text-secondary hover:bg-accent hover:text-foreground",
                )}
              >
                {tag.name} <span className="text-muted-foreground tabular-nums">{tag.count}</span>
              </Link>
            );
          })}
        </div>
      )}

      {data.contacts.length === 0 ? (
        <div className={networkCardClass}>
          <EmptyState
            icon={<Handshake />}
            title={data.total === 0 ? t("list.empty") : t("list.noMatches")}
            actions={filtered && data.total > 0 ? (
              <Link href={clearHref} className="text-[13.5px] font-medium text-brand-ink underline-offset-4 hover:underline">{t("list.clearFilters")}</Link>
            ) : undefined}
          />
        </div>
      ) : (
        <RowSelectionProvider ids={data.contacts.map((contact) => contact.id)}>
          <ul className={cn(networkCardClass, networkListClass)} data-testid="network-contact-list">
            <li className="flex h-9 items-center gap-3 px-[18px] text-[11.5px] font-medium text-muted-foreground">
              <SelectAllCheckbox />
              <span>{t("bulk.selectHint")}</span>
            </li>
            {data.contacts.map((contact) => (
              <li key={contact.id} className="group flex items-center transition-colors hover:bg-accent">
                <span className="flex self-stretch items-center pl-[18px]"><RowSelectCheckbox id={contact.id} label={contact.name} /></span>
                <div className="min-w-0 flex-1"><ContactRow contact={contact} today={today} showUpcoming={filter.sort === "reconnect"} /></div>
              </li>
            ))}
          </ul>
          <ContactBulkBar contacts={data.contacts.map((contact) => ({ id: contact.id, name: contact.name, canManage: contact.canManage, tags: contact.tags.map((tag) => tag.name) }))} />
        </RowSelectionProvider>
      )}
      {filtered && data.contacts.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("list.filteredCount", { shown: data.contacts.length, total: data.total })}</p>
      )}
    </div>
  );
}
