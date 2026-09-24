"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated PDF thumbnails are served by private routes. */

// Left navigator panel of the PDF reader: page thumbnails, in-document search results
// and the document outline. Used by pdf-reader.tsx.
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { CaseSensitive, ChevronDown, ChevronLeft, ChevronRight, ListTree, Menu, PanelLeftClose, Search, WholeWord, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activePdfOutlineIndex, visiblePdfOutlineIndices, type PdfOutlineItem } from "../../lib/pdf-selection";
import type { NavigatorTab, SearchOccurrence } from "../../lib/pdf-reader-utils";
import { normalizePdfShortcut, type PdfShortcutAction, type PdfShortcutBindings } from "../../lib/pdf-shortcuts";
import type { ReaderPage } from "./pdf-reader-types";

export type PdfNavigatorPanelProps = {
  t: ReturnType<typeof useTranslations<"wiki">>;
  navigatorTab: NavigatorTab;
  setNavigatorTab: Dispatch<SetStateAction<NavigatorTab>>;
  setShowThumbnails: Dispatch<SetStateAction<boolean>>;
  shortcutTitle: (action: PdfShortcutAction, label: string) => string;
  shortcuts: PdfShortcutBindings;
  pages: ReaderPage[];
  pageNumber: number;
  documentId: string;
  updateUrl: (nextPage: number) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  searchPending: boolean;
  searchOccurrences: SearchOccurrence[];
  visibleSearchOccurrences: Array<{ occurrence: SearchOccurrence; originalIndex: number }>;
  hasSearchableText: boolean;
  activeSearchIndex: number;
  setActiveSearchIndex: Dispatch<SetStateAction<number>>;
  caseSensitiveSearch: boolean;
  setCaseSensitiveSearch: Dispatch<SetStateAction<boolean>>;
  wholeWordSearch: boolean;
  setWholeWordSearch: Dispatch<SetStateAction<boolean>>;
  navigateSearch: (direction: 1 | -1) => void;
  selectSearchOccurrence: (index: number) => void;
  searchResultRefs: RefObject<Map<number, HTMLButtonElement>>;
  outline: PdfOutlineItem[];
  outlineLoaded: boolean;
  outlinePosition: { page: number; y: number };
  collapsedOutline: Set<number>;
  setCollapsedOutline: Dispatch<SetStateAction<Set<number>>>;
};

export function PdfNavigatorPanel({
  t, navigatorTab, setNavigatorTab, setShowThumbnails, shortcutTitle, shortcuts, pages, pageNumber, documentId, updateUrl,
  searchInputRef, query, setQuery, searchPending, searchOccurrences, visibleSearchOccurrences, hasSearchableText,
  activeSearchIndex, setActiveSearchIndex, caseSensitiveSearch, setCaseSensitiveSearch, wholeWordSearch, setWholeWordSearch,
  navigateSearch, selectSearchOccurrence, searchResultRefs, outline, outlineLoaded, outlinePosition, collapsedOutline,
  setCollapsedOutline,
}: PdfNavigatorPanelProps) {
  const activeOutlineIndex = activePdfOutlineIndex(outline, outlinePosition.page, outlinePosition.y);
  const visibleOutline = visiblePdfOutlineIndices(outline, collapsedOutline);
  const visibleActiveOutline = visibleOutline.includes(activeOutlineIndex) ? activeOutlineIndex : visibleOutline.filter((index) => index < activeOutlineIndex && outline[index].depth < outline[activeOutlineIndex]?.depth).at(-1);

  return <div className="flex h-full min-h-0 flex-col">
    <Button type="button" variant="ghost" size="icon-sm" className="self-end" aria-label={t("hideNavigator")} title={t("hideNavigator")} onClick={() => setShowThumbnails(false)}><PanelLeftClose className="size-4" /></Button>
    <div className="grid grid-cols-3 gap-1 border-b p-2" role="tablist" aria-label={t("documentNavigator")}>
      {([
        ["pages", Menu, t("pages"), "navigatorPages"],
        ["search", Search, t("search"), "navigatorSearch"],
        ["outline", ListTree, t("outline"), "outline"],
      ] as const).map(([tab, Icon, label, action]) => <button key={tab} type="button" role="tab" aria-selected={navigatorTab === tab} title={shortcutTitle(action, label)} className={`grid h-8 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${navigatorTab === tab ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-muted-foreground hover:bg-muted"}`} onClick={() => setNavigatorTab(tab)}><Icon className="size-4" /><span className="sr-only">{label}</span></button>)}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {navigatorTab === "pages" && <div className="space-y-2">{pages.map((page) => <button type="button" aria-label={t("pageNumber", { page: page.pageNumber })} aria-current={page.pageNumber === pageNumber ? "page" : undefined} key={page.pageNumber} className={`w-full rounded border p-1 ${page.pageNumber === pageNumber ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "bg-muted/20"}`} onClick={() => updateUrl(page.pageNumber)}><img src={"/api/wiki/pdf-documents/" + documentId + "/pages/" + page.pageNumber + "/thumbnail"} alt="" className="mx-auto h-auto max-h-36 w-full object-contain" loading="lazy" /><span className="mt-1 block text-[10px]">{page.pageNumber}</span></button>)}</div>}
      {navigatorTab === "search" && <div>
        <div className="relative"><Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" /><Input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { const shortcut = event.key === "Tab" ? `${event.shiftKey ? "Shift+" : ""}Tab` : normalizePdfShortcut(event); const action = shortcut && (["previousMatch", "nextMatch"] as const).find((candidate) => shortcuts[candidate] === shortcut); if (action && searchOccurrences.length) { event.preventDefault(); navigateSearch(action === "previousMatch" ? -1 : 1); return; } if (event.key === "Enter" && searchOccurrences.length) { event.preventDefault(); navigateSearch(event.shiftKey ? -1 : 1); } }} className="h-8 pl-7 pr-7 text-xs" placeholder={t("searchInPdf")} />{query && <button type="button" aria-label={t("clearSearch")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" onClick={() => setQuery("")}><X className="size-4" /></button>}</div>
        <div className="my-2 flex items-center justify-between gap-1">
          <span aria-live="polite" className="text-[10px] text-muted-foreground">{searchPending ? t("searchingPdf") : query && searchOccurrences.length ? t("searchPosition", { current: Math.max(1, activeSearchIndex + 1), total: searchOccurrences.length }) : query ? t("searchMatches", { count: 0 }) : t("searchHint")}</span>
          <span className="flex">
            <Button type="button" variant={caseSensitiveSearch ? "secondary" : "ghost"} size="icon-xs" aria-label={t("caseSensitive")} title={shortcutTitle("caseSensitive", t("caseSensitive"))} aria-pressed={caseSensitiveSearch} onClick={() => { setCaseSensitiveSearch((value) => !value); setActiveSearchIndex(-1); }}><CaseSensitive /></Button>
            <Button type="button" variant={wholeWordSearch ? "secondary" : "ghost"} size="icon-xs" aria-label={t("wholeWord")} title={shortcutTitle("wholeWord", t("wholeWord"))} aria-pressed={wholeWordSearch} onClick={() => { setWholeWordSearch((value) => !value); setActiveSearchIndex(-1); }}><WholeWord /></Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={!searchOccurrences.length} aria-label={t("previousMatch")} title={shortcutTitle("previousMatch", t("previousMatch"))} onClick={() => navigateSearch(-1)}><ChevronLeft /></Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={!searchOccurrences.length} aria-label={t("nextMatch")} title={shortcutTitle("nextMatch", t("nextMatch"))} onClick={() => navigateSearch(1)}><ChevronRight /></Button>
          </span>
        </div>
        {!hasSearchableText && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("pdfHasNoSearchableText")}</p>}
        {hasSearchableText && query && !searchPending && !searchOccurrences.length && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("noPdfSearchResults")}</p>}
        <div className="space-y-1">{visibleSearchOccurrences.map(({ occurrence, originalIndex }) => <button ref={(element) => { if (element) searchResultRefs.current.set(originalIndex, element); else searchResultRefs.current.delete(originalIndex); }} key={occurrence.id} type="button" className={`block w-full rounded border p-2 text-left text-xs ${originalIndex === activeSearchIndex ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-accent"}`} onClick={() => selectSearchOccurrence(originalIndex)}><strong>{t("pageNumber", { page: occurrence.pageNumber })}</strong><span className="mt-1 line-clamp-3 block break-words text-muted-foreground">{occurrence.contextBefore}<mark className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-700/60">{occurrence.matchedText}</mark>{occurrence.contextAfter}</span></button>)}</div>
      </div>}
      {navigatorTab === "outline" && <div className="space-y-0.5">{!outlineLoaded && <p className="p-3 text-xs text-muted-foreground">{t("loading")}</p>}{outlineLoaded && !outline.length && <p className="p-3 text-xs text-muted-foreground">{t("noOutline")}</p>}{visibleOutline.map((index) => {
        const item = outline[index];
        const children = outline[index + 1]?.depth > item.depth;
        return <div key={index} className="flex items-start" style={{ paddingLeft: `${Math.min(item.depth, 5) * 12}px` }}>
          {children ? <button type="button" className="mt-1 grid size-6 shrink-0 place-items-center rounded hover:bg-accent" aria-expanded={!collapsedOutline.has(index)} aria-label={t(collapsedOutline.has(index) ? "expandOutlineSection" : "collapseOutlineSection", { title: item.title })} onClick={() => setCollapsedOutline((previous) => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; })}>{collapsedOutline.has(index) ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}</button> : <span className="w-6 shrink-0" />}
          <button type="button" data-testid="pdf-outline-item" disabled={!item.pageNumber} aria-current={visibleActiveOutline === index ? "location" : undefined} className={`min-w-0 flex-1 rounded px-1 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-60 ${visibleActiveOutline === index ? "bg-accent font-bold" : "font-normal"}`} onClick={() => item.pageNumber && updateUrl(item.pageNumber)}><span className="line-clamp-2 block break-words">{item.title}</span>{item.pageNumber && <span className="text-[10px] text-muted-foreground">{t("pageNumber", { page: item.pageNumber })}</span>}</button>
        </div>;
      })}</div>}
    </div>
  </div>;
}
