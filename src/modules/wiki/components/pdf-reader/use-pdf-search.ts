"use client";

// In-document search of the PDF reader: the query and its options, the matches, and moving
// between them (opening the navigator's search tab). Used by pdf-reader.tsx.
import { useCallback, useDeferredValue, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { findSearchOccurrences, normalizePdfSearchText, type NavigatorTab } from "../../lib/pdf-reader-utils";
import type { ReaderPage } from "./pdf-reader-types";

export function usePdfSearch({
  pages, t, setLiveMessage, setShowThumbnails, setNavigatorTab, updateUrl,
}: {
  pages: ReaderPage[];
  t: ReturnType<typeof useTranslations<"wiki">>;
  setLiveMessage: Dispatch<SetStateAction<string>>;
  setShowThumbnails: Dispatch<SetStateAction<boolean>>;
  setNavigatorTab: Dispatch<SetStateAction<NavigatorTab>>;
  updateUrl: (nextPage: number) => void;
}) {
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [caseSensitiveSearch, setCaseSensitiveSearch] = useState(false);
  const [wholeWordSearch, setWholeWordSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchPending = deferredQuery !== query;
  const searchOccurrences = useMemo(() => searchPending ? [] : findSearchOccurrences(pages, {
    query: deferredQuery,
    caseSensitive: caseSensitiveSearch,
    wholeWord: wholeWordSearch,
  }), [caseSensitiveSearch, deferredQuery, pages, searchPending, wholeWordSearch]);
  const hasSearchableText = useMemo(() => pages.some((page) => normalizePdfSearchText(page.text).text.length > 0), [pages]);
  const searchResultRefs = useRef(new Map<number, HTMLButtonElement>());
  const visibleSearchOccurrences = useMemo(() => {
    if (!searchOccurrences.length || activeSearchIndex <= 0 || activeSearchIndex >= searchOccurrences.length) {
      return searchOccurrences.map((occurrence, originalIndex) => ({ occurrence, originalIndex }));
    }
    return [...searchOccurrences.slice(activeSearchIndex), ...searchOccurrences.slice(0, activeSearchIndex)]
      .map((occurrence, offset) => ({ occurrence, originalIndex: (activeSearchIndex + offset) % searchOccurrences.length }));
  }, [activeSearchIndex, searchOccurrences]);

  const openPdfSearch = useCallback(() => {
    setShowThumbnails(true);
    setNavigatorTab("search");
    window.requestAnimationFrame(() => {
      setShowThumbnails(true);
      setNavigatorTab("search");
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    });
  }, [setNavigatorTab, setShowThumbnails]);

  function navigateSearch(direction: 1 | -1) {
    if (!searchOccurrences.length) return;
    const next = activeSearchIndex < 0
      ? 0
      : (activeSearchIndex + direction + searchOccurrences.length) % searchOccurrences.length;
    const occurrence = searchOccurrences[next];
    setActiveSearchIndex(next);
    setLiveMessage(t("searchResultStatus", { current: next + 1, total: searchOccurrences.length, page: occurrence.pageNumber }));
    setShowThumbnails(true);
    setNavigatorTab("search");
    updateUrl(occurrence.pageNumber);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function selectSearchOccurrence(index: number) {
    const occurrence = searchOccurrences[index];
    if (!occurrence) return;
    setActiveSearchIndex(index);
    setLiveMessage(t("searchResultStatus", { current: index + 1, total: searchOccurrences.length, page: occurrence.pageNumber }));
    setShowThumbnails(true);
    setNavigatorTab("search");
    updateUrl(occurrence.pageNumber);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  return {
    query, setQuery, activeSearchIndex, setActiveSearchIndex, caseSensitiveSearch, setCaseSensitiveSearch,
    wholeWordSearch, setWholeWordSearch, searchInputRef, searchResultRefs, searchPending, searchOccurrences,
    hasSearchableText, visibleSearchOccurrences, openPdfSearch, navigateSearch, selectSearchOccurrence,
  };
}
