"use client";

// Loads and persists PDF reader preferences (view, zoom, panels, shortcuts, last page),
// tracks the compact viewport and handles navigator/comment panel resizing. Used by pdf-reader.tsx.
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  parsePdfReaderPreferences, PDF_READER_PREFERENCES_KEY, resolveInitialPage, type FitMode, type NavigatorTab,
  type PdfReaderPreferences, type PdfViewMode,
} from "../../lib/pdf-reader-utils";
import type { PdfShortcutBindings } from "../../lib/pdf-shortcuts";
import type { ReaderPage } from "./pdf-reader-types";

const COMMENT_PANEL_WIDTH_KEY = "wiki:pdf-comment-panel-width";
const LAST_PAGE_KEY_PREFIX = "wiki:pdf-last-page:";

export function usePdfReaderPreferences({
  documentId, hasExplicitPage, isFocused, pages, pageNumber, viewMode, fitMode, scale, rotation, navigatorTab,
  showThumbnails, thumbnailWidth, commentPanelWidth, shortcuts, reducedMotion, setCommentPanelWidth, setThumbnailWidth,
  setShowThumbnails, setNavigatorTab, setViewMode, setFitMode, setScale, setRotation, setShortcuts, setPageNumber,
}: {
  documentId: string;
  hasExplicitPage: boolean;
  isFocused: boolean;
  pages: ReaderPage[];
  pageNumber: number;
  viewMode: PdfViewMode;
  fitMode: FitMode;
  scale: number;
  rotation: number;
  navigatorTab: NavigatorTab;
  showThumbnails: boolean;
  thumbnailWidth: number;
  commentPanelWidth: number;
  shortcuts: PdfShortcutBindings;
  reducedMotion: RefObject<boolean>;
  setCommentPanelWidth: Dispatch<SetStateAction<number>>;
  setThumbnailWidth: Dispatch<SetStateAction<number>>;
  setShowThumbnails: Dispatch<SetStateAction<boolean>>;
  setNavigatorTab: Dispatch<SetStateAction<NavigatorTab>>;
  setViewMode: Dispatch<SetStateAction<PdfViewMode>>;
  setFitMode: Dispatch<SetStateAction<FitMode>>;
  setScale: Dispatch<SetStateAction<number>>;
  setRotation: Dispatch<SetStateAction<number>>;
  setShortcuts: Dispatch<SetStateAction<PdfShortcutBindings>>;
  setPageNumber: Dispatch<SetStateAction<number>>;
}) {
  const [compactViewport, setCompactViewport] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const thumbnailResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const commentPanelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const commentPanelWidthRef = useRef(304);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const updateCompactViewport = () => setCompactViewport(media.matches);
    const frame = window.requestAnimationFrame(() => {
      const preferences = parsePdfReaderPreferences(window.localStorage.getItem(PDF_READER_PREFERENCES_KEY) ?? window.localStorage.getItem("wiki:pdf-reader-preferences:v2") ?? window.localStorage.getItem("wiki:pdf-reader-preferences:v1"));
      const legacyCommentWidth = Number(window.localStorage.getItem(COMMENT_PANEL_WIDTH_KEY));
      const nextCommentWidth = Number.isFinite(legacyCommentWidth)
        ? Math.min(420, Math.max(260, legacyCommentWidth))
        : preferences.commentPanelWidth;
      commentPanelWidthRef.current = nextCommentWidth;
      setCommentPanelWidth(nextCommentWidth);
      setThumbnailWidth(preferences.navigatorWidth);
      // Focus mode starts with an uncluttered canvas, but the navigator can be
      // explicitly opened again from the toolbar (including its outline tab).
      setShowThumbnails(isFocused ? false : preferences.navigatorVisible);
      setNavigatorTab(preferences.navigatorTab);
      setViewMode(preferences.viewMode);
      setFitMode(preferences.fitMode);
      setScale(preferences.scale);
      setRotation(preferences.rotation);
      setShortcuts(preferences.shortcuts);
      reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!hasExplicitPage) {
        const storedPage = Number(window.localStorage.getItem(LAST_PAGE_KEY_PREFIX + documentId));
        setPageNumber(resolveInitialPage({ storedPage, pageCount: pages.length }));
      }
      setPreferencesLoaded(true);
      updateCompactViewport();
    });
    media.addEventListener("change", updateCompactViewport);
    return () => { window.cancelAnimationFrame(frame); media.removeEventListener("change", updateCompactViewport); };
  }, [documentId, hasExplicitPage, isFocused, pages.length, reducedMotion, setCommentPanelWidth, setFitMode, setNavigatorTab, setPageNumber, setRotation, setScale, setShortcuts, setShowThumbnails, setThumbnailWidth, setViewMode]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const preferences: PdfReaderPreferences = {
       version: 3, viewMode, fitMode, scale, rotation,
      navigatorTab, navigatorVisible: showThumbnails, navigatorWidth: thumbnailWidth,
      commentPanelWidth,
      shortcuts,
    };
    window.localStorage.setItem(PDF_READER_PREFERENCES_KEY, JSON.stringify(preferences));
  }, [commentPanelWidth, fitMode, navigatorTab, preferencesLoaded, rotation, scale, shortcuts, showThumbnails, thumbnailWidth, viewMode]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.localStorage.setItem(LAST_PAGE_KEY_PREFIX + documentId, String(pageNumber));
  }, [documentId, pageNumber, preferencesLoaded]);

  useEffect(() => {
    const resize = (event: PointerEvent) => {
      const thumbnailStart = thumbnailResizeRef.current;
      if (thumbnailStart) setThumbnailWidth(Math.min(240, Math.max(104, thumbnailStart.startWidth + event.clientX - thumbnailStart.startX)));
      const commentStart = commentPanelResizeRef.current;
      if (commentStart) {
        const nextWidth = Math.min(420, Math.max(260, commentStart.startWidth + commentStart.startX - event.clientX));
        commentPanelWidthRef.current = nextWidth;
        setCommentPanelWidth(nextWidth);
      }
    };
    const stop = () => {
      thumbnailResizeRef.current = null;
      if (commentPanelResizeRef.current) window.localStorage.setItem(COMMENT_PANEL_WIDTH_KEY, String(commentPanelWidthRef.current));
      commentPanelResizeRef.current = null;
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", resize); window.removeEventListener("pointerup", stop); };
  }, [setCommentPanelWidth, setThumbnailWidth]);

  return { compactViewport, thumbnailResizeRef, commentPanelResizeRef };
}
