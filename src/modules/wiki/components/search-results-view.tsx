"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, FileText, Highlighter, LibraryBig, Search } from "lucide-react";
import type { SearchHit } from "../research-actions";
import { SearchSnippet } from "./search-snippet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { WIKI_PAGE_CLASS } from "./wiki-page-class";

const KINDS = ["all", "page", "source", "pdfPage", "annotation"] as const;

const KIND_ICONS: Record<SearchHit["kind"], typeof FileText> = { page: FileText, source: LibraryBig, annotation: Highlighter, pdfPage: BookOpen };

function KindIcon({ kind }: { kind: SearchHit["kind"] }) {
  const Icon = KIND_ICONS[kind];
  return <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}

const chipClass = (active: boolean) => cn("text-text-secondary", active && "border-transparent bg-brand-soft text-brand-ink hover:bg-brand-soft hover:text-brand-ink");

export function SearchResultsView({ query, kind, tagId, tags, results }: {
  query: string;
  kind: string;
  tagId: string;
  tags: Array<{ id: string; name: string }>;
  results: SearchHit[];
}) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const [draft, setDraft] = useState(query);

  function go(nextQuery: string, nextKind: string, nextTag = tagId) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextKind !== "all") params.set("kind", nextKind);
    if (nextTag) params.set("tag", nextTag);
    router.push(`/wiki/search?${params.toString()}`);
  }

  const counts = new Map<string, number>();
  for (const hit of results) counts.set(hit.kind, (counts.get(hit.kind) ?? 0) + 1);
  const visible = kind === "all" ? results : results.filter((hit) => hit.kind === kind);

  return (
    <div className={cn(WIKI_PAGE_CLASS, "space-y-4")}>
      <PageHeader title={t("searchResultsTitle")} className="mb-5" />

      <form
        className="relative"
        onSubmit={(event) => { event.preventDefault(); go(draft, kind); }}
      >
        <Search className="pointer-events-none absolute top-3.5 left-3.5 size-[18px] text-muted-foreground" />
        <Input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={t("searchResultsTitle")}
          placeholder={t("launchpadSearchPlaceholder")}
          className="h-[46px] bg-card pl-10 text-[14.5px] md:text-[14.5px]"
        />
      </form>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((item) => {
          const count = item === "all" ? results.length : counts.get(item) ?? 0;
          return (
            <Button
              key={item}
              type="button"
              size="sm"
              variant="outline"
              className={chipClass(kind === item)}
              aria-pressed={kind === item}
              onClick={() => go(query, item)}
            >
              {item === "all" ? t("searchKindAll") : t(`searchKinds.${item}`)}
              <span className="ml-0.5 text-[11px] opacity-70 tabular-nums">{count}</span>
            </Button>
          );
        })}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("tags")}</span>
          {tags.map((tag) => (
            <Button
              key={tag.id}
              type="button"
              size="sm"
              variant="ghost"
              className={chipClass(tagId === tag.id)}
              aria-pressed={tagId === tag.id}
              onClick={() => go(query, kind, tagId === tag.id ? "" : tag.id)}
            >
              {tag.name}
            </Button>
          ))}
        </div>
      )}

      {!query ? (
        <div className="rounded-xl border bg-card shadow-card"><EmptyState icon={<Search />} title={t("searchResultsEmptyQuery")} /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-card"><EmptyState icon={<Search />} title={t("noResults")} /></div>
      ) : (
        <div className="divide-y divide-line-soft overflow-hidden rounded-xl border bg-card shadow-card">
          {visible.map((hit) => (
            <Link key={hit.key} href={hit.href} className="flex gap-3 px-[18px] py-[11px] text-[13.5px] transition-colors outline-none hover:bg-accent focus-visible:bg-accent">
              <KindIcon kind={hit.kind} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{hit.title}</span>
                  {"pageNumber" in hit && <span className="text-xs text-muted-foreground">{t("pageNumber", { page: hit.pageNumber })}</span>}
                  <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-semibold text-text-secondary">{t(`searchKinds.${hit.kind}`)}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground"><SearchSnippet value={hit.snippet} /></span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
