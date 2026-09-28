"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FormEvent, ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { contactClosenessLevels, contactRelationships } from "../../constants";
import {
  contactScopes,
  contactSorts,
  contactSpokenStates,
  networkFilterHref,
  parseContactListParams,
  type ContactListFilter,
  type NetworkFacet,
} from "../../contact-filters";
import { selectClassName } from "../network-ui";

type Props = {
  filter: ContactListFilter;
  organizations: NetworkFacet[];
  municipalities: NetworkFacet[];
  /** Link that clears every filter but keeps the sort; null when nothing is filtered. */
  clearHref: string | null;
};

function FilterSelect({ name, label, value, children }: { name: string; label: string; value: string; children: ReactNode }) {
  return (
    <select name={name} aria-label={label} title={label} defaultValue={value} className={cn(selectClassName, "w-auto max-w-full sm:max-w-56")}>
      {children}
    </select>
  );
}

/**
 * Search, filters and sort for the contact list. A plain GET form, so it works
 * without JavaScript; with it, changes apply at once and the URL stays clean
 * (defaults and empty values are left out).
 */
export function ContactFilters({ filter, organizations, municipalities, clearHref }: Props) {
  const t = useTranslations("network");
  const router = useRouter();

  function apply(form: HTMLFormElement) {
    const values = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value)]));
    router.push(networkFilterHref(parseContactListParams(values)));
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(event.currentTarget);
  }

  return (
    // `key` resets the uncontrolled fields when the applied filter changes (e.g. via a tag link).
    <form key={networkFilterHref(filter)} action="/network" className="space-y-2" role="search" onSubmit={onSubmit} onChange={(event) => {
      if (event.target instanceof HTMLSelectElement && event.target.form) apply(event.target.form);
    }}>
      {filter.tagId && <input type="hidden" name="tag" value={filter.tagId} />}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" type="search" defaultValue={filter.query} placeholder={t("list.searchPlaceholder")} aria-label={t("list.search")} className="pl-8" />
        </div>
        <Button type="submit" variant="outline">{t("list.search")}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filters.label")} data-testid="network-filters">
        <FilterSelect name="scope" label={t("filters.scope")} value={filter.scope}>
          {contactScopes.map((scope) => <option key={scope} value={scope}>{t(`filters.scopes.${scope}`)}</option>)}
        </FilterSelect>
        <FilterSelect name="relationship" label={t("filters.relationship")} value={filter.relationship}>
          <option value="">{t("filters.anyRelationship")}</option>
          {contactRelationships.map((value) => <option key={value} value={value}>{t(`relationships.${value}`)}</option>)}
        </FilterSelect>
        <FilterSelect name="closeness" label={t("filters.closeness")} value={filter.closeness}>
          <option value="">{t("filters.anyCloseness")}</option>
          {contactClosenessLevels.map((value) => <option key={value} value={value}>{t(`closeness.${value}`)}</option>)}
        </FilterSelect>
        {organizations.length > 0 && (
          <FilterSelect name="organization" label={t("filters.organization")} value={filter.organizationId}>
            <option value="">{t("filters.anyOrganization")}</option>
            {organizations.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.count})</option>)}
          </FilterSelect>
        )}
        {municipalities.length > 0 && (
          <FilterSelect name="municipality" label={t("filters.municipality")} value={filter.municipalityCode}>
            <option value="">{t("filters.anyMunicipality")}</option>
            {municipalities.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.count})</option>)}
          </FilterSelect>
        )}
        <FilterSelect name="spoken" label={t("filters.spoken")} value={filter.spoken}>
          <option value="">{t("filters.anySpoken")}</option>
          {contactSpokenStates.map((value) => <option key={value} value={value}>{t(`filters.spokenStates.${value}`)}</option>)}
        </FilterSelect>
        <FilterSelect name="sort" label={t("filters.sort")} value={filter.sort}>
          {contactSorts.map((sort) => <option key={sort} value={sort}>{t(`filters.sorts.${sort}`)}</option>)}
        </FilterSelect>
        {clearHref && (
          <Link href={clearHref} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
            {t("list.clearFilters")}
          </Link>
        )}
      </div>
    </form>
  );
}
