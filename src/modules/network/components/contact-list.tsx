import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { defaultContactListFilter, isContactListFiltered, networkFilterHref } from "../contact-filters";
import type { listNetworkContacts } from "../queries";
import { ContactFilters } from "./contact-list/contact-filters";
import { ContactRow } from "./contact-list/contact-row";

type Data = ReturnType<typeof listNetworkContacts>;

/** "My network": who we know and why they matter, searchable, filterable and sortable. */
export async function ContactList({ data }: { data: Data }) {
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
            <div className="mt-2"><Link href={clearHref} className="text-foreground underline underline-offset-4">{t("list.clearFilters")}</Link></div>
          )}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card" data-testid="network-contact-list">
          {data.contacts.map((contact) => (
            <li key={contact.id}><ContactRow contact={contact} /></li>
          ))}
        </ul>
      )}
      {filtered && data.contacts.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("list.filteredCount", { shown: data.contacts.length, total: data.total })}</p>
      )}
    </div>
  );
}
