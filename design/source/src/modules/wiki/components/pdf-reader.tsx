"use client";
// PDF reader page. Its hooks, panels, dialogs and helpers live in ./pdf-reader/.
import { useCallback, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowLeft, Bookmark, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardPlus, Download, ExternalLink, FileSearch, Highlighter, Keyboard, ListTree, Loader2, MessageCircle,
  Minus, MoreHorizontal, Plus, Printer, RotateCw, X, Link2, Eraser,
  SquareDashedMousePointer,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FocusModeToggle, useFocusMode } from "@/components/focus-mode";
import { createPdfAnnotation, deletePdfAnnotation } from "../pdf-actions";
import { readPdfSelection, rotatePdfRect, type PdfTextSelection } from "../lib/pdf-selection";
import { rememberSourcePassage } from "../lib/source-passage";
import type { PdfRect } from "../lib/pdf-evidence";
import {
  calculateFitScale, findSearchOccurrences,
  normalizePdfSearchText, type FitMode,
  type NavigatorTab,
} from "../lib/pdf-reader-utils";
import {
  DEFAULT_PDF_SHORTCUT_BINDINGS, normalizePdfShortcut, PDF_SHORTCUT_ACTIONS,
  type PdfShortcutAction, type PdfShortcutBindings,
} from "../lib/pdf-shortcuts";
import { displayShortcut } from "../lib/shortcut-display";
import styles from "./pdf-reader.module.css";
import {
  userMarkColorStyle,
  type UserMarkColor,
} from "@/lib/user-mark-colors";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import type { ContextDeadlineMarker, ContextTaskMarker } from "@/modules/tasks/types";
import { annotationRects, regionPoint } from "./pdf-reader/pdf-annotation-geometry";
import { PdfAnnotationNoteDialog } from "./pdf-reader/pdf-annotation-note-dialog";
import { PdfCommentPanel, type PdfCommentPanelProps } from "./pdf-reader/pdf-comment-panel";
import { pdfContextMarkersForPage, type PdfContextMarkerContext } from "./pdf-reader/pdf-context-markers";
import { createPdfContextRequests } from "./pdf-reader/pdf-context-requests";
import { deadlineAnchorPage, taskAnchorPage } from "./pdf-reader/pdf-marker-anchors";
import { PdfNavigatorPanel } from "./pdf-reader/pdf-navigator-panel";
import type { CommentPanelState, PendingAnnotation, ReaderAnnotation, ReaderPage, SelectionAnchor } from "./pdf-reader/pdf-reader-types";
import { PdfShortcutsDialog } from "./pdf-reader/pdf-shortcuts-dialog";
import { usePdfAnnotationThreads } from "./pdf-reader/use-pdf-annotation-threads";
import { usePdfOutline } from "./pdf-reader/use-pdf-outline";
import { usePdfReaderPreferences } from "./pdf-reader/use-pdf-reader-preferences";
import { usePdfRendering } from "./pdf-reader/use-pdf-rendering";
import { usePdfScrollTracking } from "./pdf-reader/use-pdf-scroll-tracking";
import { usePdfSearchHighlights } from "./pdf-reader/use-pdf-search-highlights";
import { usePdfFitScale, usePdfWheelZoom } from "./pdf-reader/use-pdf-zoom";
export function PdfReader({
  sourceId, sourceTitle, attachmentId, documentId, fileName, pages, initialAnnotations,
  initialPage, initialAnnotationId, initialTaskId, contextTasks, initialDeadlineId, contextDeadlines, user,
  wikiPages = [],
  hasExplicitPage = false,
}: {
  sourceId: string; sourceTitle: string; attachmentId: string; documentId: string; fileName: string;
  pages: ReaderPage[]; initialAnnotations: ReaderAnnotation[]; initialPage: number; initialAnnotationId?: string;
  initialTaskId?: string; contextTasks: ContextTaskMarker[];
  initialDeadlineId?: string; contextDeadlines: ContextDeadlineMarker[];
  hasExplicitPage?: boolean;
  wikiPages?: Array<{ id: string; title: string; slug: string }>;
  user: { id: string; name: string; role?: string | null; markColor: UserMarkColor };
}) {
  const t = useTranslations("wiki"); const tTasks = useTranslations("tasks"); const tDeadlines = useTranslations("deadlines"); const tMarkColor = useTranslations("settings.profile.colors"); const format = useFormatter(); const router = useRouter(); const { openTaskCreator } = useTaskCreator(); const { openDeadlineCreator } = useDeadlineCreator();
  const [renderedAt] = useState(() => new Date());
  // Shortcut metadata lives in the lib as ids; the words come from messages, the same
  // split the wiki shortcuts dialog uses.
  const shortcutActionLabel = (action: PdfShortcutAction) => t(`pdfShortcuts.actions.${action}`);
  const shortcutKeys = { ctrl: t("shortcuts.keys.ctrl"), delete: t("shortcuts.keys.delete") };
  const showShortcut = (binding: string) => displayShortcut(binding, shortcutKeys);
  const pdfLoadFailedMessage = t("pdfLoadFailed");
  const { isFocused, toggleFocused } = useFocusMode();
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [thumbnailWidth, setThumbnailWidth] = useState(132);
  const [navigatorTab, setNavigatorTab] = useState<NavigatorTab>("pages");
  const [commentPanel, setCommentPanel] = useState<CommentPanelState>(() => initialAnnotationId ? { mode: "thread", annotationId: initialAnnotationId } : isFocused ? { mode: "closed" } : { mode: "list" });
  const [commentPanelWidth, setCommentPanelWidth] = useState(304);
  const [commentSearch, setCommentSearch] = useState("");
  const [currentPageCommentsOnly, setCurrentPageCommentsOnly] = useState(false);
  const previousFocused = useRef(isFocused);
  const [pageNumber, setPageNumber] = useState(() => {
    const anchoredPage = deadlineAnchorPage(contextDeadlines, initialDeadlineId) ?? taskAnchorPage(contextTasks, initialTaskId);
    return Math.min(Math.max(anchoredPage ?? initialPage, 1), Math.max(1, pages.length));
  });
  const [scale, setScale] = useState(1.25); const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>("custom");
  const [shortcuts, setShortcuts] = useState<PdfShortcutBindings>(DEFAULT_PDF_SHORTCUT_BINDINGS);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [collapsedOutline, setCollapsedOutline] = useState<Set<number>>(() => new Set());
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [caseSensitiveSearch, setCaseSensitiveSearch] = useState(false);
  const [wholeWordSearch, setWholeWordSearch] = useState(false);
  const [continuousRenderPages, setContinuousRenderPages] = useState<number[]>([pageNumber]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [annotationKindFilter, setAnnotationKindFilter] = useState("all");
  const [annotationColorFilter, setAnnotationColorFilter] = useState("all");
  const [annotationAuthorFilter, setAnnotationAuthorFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"continuous" | "single" | "double">("continuous");
  const [rendering, setRendering] = useState(true);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  // Reserve enough centered gutter for the furthest visible marker: annotation
  // (34px), task (68px), or deadline (100px), plus two pixels per side.
  const fitPadding = contextDeadlines.length > 0
    ? 204
    : contextTasks.length > 0
      ? 140
      : annotations.some((annotation) => annotation.note || annotation.comments.length > 0)
        ? 72
        : 32;
  const [activeAnnotationId, setActiveAnnotationId] = useState(initialAnnotationId ?? "");
  const {
    sendToPageFor, setSendToPageFor, pageFilter, setPageFilter, editingAnnotation, setEditingAnnotation,
    annotationEditDraft, setAnnotationEditDraft, replyByAnnotation, setReplyByAnnotation, editingCommentId,
    setEditingCommentId, commentPending, commentDraftById, setCommentDraftById, submitReply, saveEditedReply,
    removeReply, beginEditingReply, sendAnnotationToPage, copyAnnotationCitation, beginEditingAnnotation,
    saveAnnotationEdits, removeAnnotation,
  } = usePdfAnnotationThreads({ setAnnotations, t, router, sourceTitle, showCommentList });
  const [selection, setSelection] = useState<(PdfTextSelection & { parts: PdfTextSelection[] }) | null>(null);
  const selectionBusy = useRef(false);
  const [selectionSaving, setSelectionSaving] = useState(false);
  const selectionDragging = useRef(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [hoveredDeadlineId, setHoveredDeadlineId] = useState<string | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [selectionAnchorPosition, setSelectionAnchorPosition] = useState<{ left: number; top: number; side: SelectionAnchor["side"] } | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [annotationNote, setAnnotationNote] = useState("");
  const [annotationAnchor, setAnnotationAnchor] = useState<{ left: number; top: number } | null>(null);
  const [regionMode, setRegionMode] = useState(false); const [region, setRegion] = useState<PdfRect | null>(null);
  const regionStart = useRef<{ x: number; y: number } | null>(null);
  const restoreContinuousPage = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!initialTaskId) return;
    const anchoredPage = taskAnchorPage(contextTasks, initialTaskId);
    if (anchoredPage && anchoredPage !== pageNumber) {
      router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${anchoredPage}&task=${encodeURIComponent(initialTaskId)}`, { scroll: false });
      const syncPage = window.setTimeout(() => {
        restoreContinuousPage.current = anchoredPage;
        setPageNumber(anchoredPage);
      }, 0);
      return () => window.clearTimeout(syncPage);
    }
    if (rendering) return;
    const targetPage = anchoredPage ?? pageNumber;
    router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${targetPage}&task=${encodeURIComponent(initialTaskId)}`, { scroll: false });
    if (viewMode === "continuous") scrollToPage(targetPage, "center");
    const timeout = window.setTimeout(() => {
      const marker = readerRef.current?.querySelector<HTMLElement>(
        `[data-task-marker="${CSS.escape(initialTaskId)}"]`,
      );
      if (marker) {
        marker.scrollIntoView({ behavior: "smooth", block: "center" });
        marker.focus({ preventScroll: true });
      } else {
        toast.info(tTasks("sourceFallback"));
      }
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [contextTasks, documentId, initialTaskId, pageNumber, rendering, router, sourceId, tTasks, viewMode]);

  useEffect(() => {
    if (!initialDeadlineId) return;
    const anchoredPage = deadlineAnchorPage(contextDeadlines, initialDeadlineId);
    if (anchoredPage && anchoredPage !== pageNumber) {
      router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${anchoredPage}&deadline=${encodeURIComponent(initialDeadlineId)}`, { scroll: false });
      const syncPage = window.setTimeout(() => {
        restoreContinuousPage.current = anchoredPage;
        setPageNumber(anchoredPage);
      }, 0);
      return () => window.clearTimeout(syncPage);
    }
    if (rendering) return;
    const targetPage = anchoredPage ?? pageNumber;
    router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${targetPage}&deadline=${encodeURIComponent(initialDeadlineId)}`, { scroll: false });
    if (viewMode === "continuous") scrollToPage(targetPage, "center");
    const timeout = window.setTimeout(() => {
      const marker = readerRef.current?.querySelector<HTMLElement>(
        `[data-deadline-marker="${CSS.escape(initialDeadlineId)}"]`,
      );
      if (marker) {
        marker.scrollIntoView({ behavior: "smooth", block: "center" });
        marker.focus({ preventScroll: true });
      } else {
        toast.info(tDeadlines("sourceFallback"));
      }
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [contextDeadlines, documentId, initialDeadlineId, pageNumber, rendering, router, sourceId, tDeadlines, viewMode]);
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
  const canvasRef = useRef<HTMLCanvasElement>(null); const textLayerRef = useRef<HTMLDivElement>(null);
  const pageShellRef = useRef<HTMLDivElement>(null); const secondaryPageShellRef = useRef<HTMLDivElement>(null); const secondaryCanvasRef = useRef<HTMLCanvasElement>(null); const secondaryTextLayerRef = useRef<HTMLDivElement>(null); const continuousCanvasRefs = useRef(new Map<number, HTMLCanvasElement>()); const continuousTextLayerRefs = useRef(new Map<number, HTMLDivElement>()); const continuousPageRefs = useRef(new Map<number, HTMLDivElement>()); const continuousActivePageRef = useRef(pageNumber); const viewportRef = useRef<HTMLDivElement>(null);
  const currentPage = pages.find((page) => page.pageNumber === pageNumber);

  const reducedMotion = useRef(false);

  useEffect(() => { continuousActivePageRef.current = pageNumber; }, [pageNumber]);

  const { compactViewport, thumbnailResizeRef, commentPanelResizeRef } = usePdfReaderPreferences({
    documentId, hasExplicitPage, isFocused, pages, pageNumber, viewMode, fitMode, scale, rotation, navigatorTab,
    showThumbnails, thumbnailWidth, commentPanelWidth, shortcuts, reducedMotion, setCommentPanelWidth, setThumbnailWidth,
    setShowThumbnails, setNavigatorTab, setViewMode, setFitMode, setScale, setRotation, setShortcuts, setPageNumber,
  });

  useEffect(() => {
    if (previousFocused.current === isFocused) return;
    previousFocused.current = isFocused;
    setShowThumbnails(!isFocused);
    setCommentPanel(isFocused ? { mode: "closed" } : { mode: "list" });
  }, [isFocused]);

  const { zoomContentRef, zoomLabelRef, handleViewportWheel } = usePdfWheelZoom({
    scale, setScale, setFitMode, viewportRef, pageShellRef,
  });

  useEffect(() => {
    if (!selectionAnchor) return;

    let frame = 0;
    const updatePosition = () => {
      frame = 0;
      const shell = viewMode === "continuous"
        ? continuousPageRefs.current.get(selectionAnchor.pageNumber)
        : selectionAnchor.pageNumber === pageNumber + 1 && viewMode === "double" ? secondaryPageShellRef.current : pageShellRef.current;
      if (!shell) return;
      const bounds = shell.getBoundingClientRect();
      setSelectionAnchorPosition({
        left: bounds.left + selectionAnchor.x * bounds.width,
        top: bounds.top + selectionAnchor.y * bounds.height,
        side: selectionAnchor.side,
      });
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updatePosition);
    };
    const viewport = viewportRef.current;
    scheduleUpdate();
    viewport?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [selectionAnchor, viewMode, scale, rotation, pageNumber]);

  const { pdf, error, textLayerVersion } = usePdfRendering({
    attachmentId, pdfLoadFailedMessage, pages, currentPage, pageNumber, viewMode, scale, rotation, continuousRenderPages,
    searchOccurrences, activeSearchIndex, selection, selectionDragging, setRendering, setSelection, setRegion, canvasRef,
    textLayerRef, pageShellRef, secondaryCanvasRef, secondaryTextLayerRef, secondaryPageShellRef, continuousCanvasRefs,
    continuousTextLayerRefs, continuousPageRefs, continuousActivePageRef,
  });

  const { outline, outlineLoaded } = usePdfOutline({ pdf, t });

  usePdfSearchHighlights({
    query, searchPending, searchOccurrences, activeSearchIndex, setActiveSearchIndex, caseSensitiveSearch, wholeWordSearch,
    pageNumber, viewMode, textLayerVersion, showThumbnails, navigatorTab, reducedMotion, searchInputRef, textLayerRef,
    secondaryTextLayerRef, continuousTextLayerRefs,
  });
  const { outlinePosition } = usePdfScrollTracking({
    initialPage, sourceId, documentId, router, pageNumber, setPageNumber, viewMode, scale, rotation, textLayerVersion,
    viewportRef, continuousPageRefs, restoreContinuousPage, setContinuousRenderPages,
  });

  function changeViewMode(nextMode: "continuous" | "single" | "double") {
    if (nextMode === "continuous" && viewMode !== "continuous") restoreContinuousPage.current = pageNumber;
    setViewMode(nextMode);
  }

  const pageAnnotations = annotations.filter((annotation) => annotation.pageNumber === pageNumber);

  function readerUrl(nextPage: number, annotationId?: string, taskId?: string) {
    return `/wiki/sources/${sourceId}/read/${documentId}?page=${nextPage}${annotationId ? `&annotation=${annotationId}` : ""}${taskId ? `&task=${encodeURIComponent(taskId)}` : ""}`;
  }

  function updateUrl(nextPage: number) {
    setPageNumber(nextPage);
    if (commentPanel.mode === "thread") setCommentPanel({ mode: "list" });
    setActiveAnnotationId("");
    router.replace(readerUrl(nextPage), { scroll: false });
    if (viewMode === "continuous") scrollToPage(nextPage);
  }

  const openPdfSearch = useCallback(() => {
    setShowThumbnails(true);
    setNavigatorTab("search");
    window.requestAnimationFrame(() => {
      setShowThumbnails(true);
      setNavigatorTab("search");
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    });
  }, []);

  function shortcutTitle(action: PdfShortcutAction, label: string) {
    return `${label} · ${showShortcut(shortcuts[action])}`;
  }

  const { requestPdfTask, requestPdfDeadline } = createPdfContextRequests({
    selection, region, pageNumber, documentId, sourceId, sourceTitle, t, openTaskCreator, openDeadlineCreator,
    setSelection, setRegion, setSelectionAnchor, router,
  });

  function runPdfShortcut(action: PdfShortcutAction) {
    switch (action) {
      case "previousPage": updateUrl(Math.max(1, pageNumber - 1)); break;
      case "nextPage": updateUrl(Math.min(pages.length, pageNumber + 1)); break;
      case "zoomOut": setCustomScale(scale - 0.15); break;
      case "zoomIn": setCustomScale(scale + 0.15); break;
      case "fitWidth": void applyFitMode("width"); break;
      case "fitPage": void applyFitMode("page"); break;
      case "actualSize": void applyFitMode("actual"); break;
      case "continuousView": changeViewMode("continuous"); break;
      case "singlePageView": changeViewMode("single"); break;
      case "doublePageView": changeViewMode("double"); break;
      case "search": openPdfSearch(); break;
      case "previousMatch": navigateSearch(-1); break;
      case "nextMatch": navigateSearch(1); break;
      case "caseSensitive": setCaseSensitiveSearch((value) => !value); setActiveSearchIndex(-1); break;
      case "wholeWord": setWholeWordSearch((value) => !value); setActiveSearchIndex(-1); break;
      case "navigatorPages": setShowThumbnails(true); setNavigatorTab("pages"); break;
      case "navigatorSearch": openPdfSearch(); break;
      case "outline": setShowThumbnails(true); setNavigatorTab("outline"); break;
      case "captureRegion": if (viewMode === "continuous") setViewMode("single"); setRegionMode((value) => !value); break;
      case "bookmarkPage": requestAnnotation({ kind: "bookmark", geometry: [], selectedText: "", pageNumber }); break;
      case "comments": if (commentsVisible) closeCommentPanel(); else showCommentList(); break;
      case "previousAnnotation": if (selectedAnnotation) moveAnnotation(-1); break;
      case "nextAnnotation": if (selectedAnnotation) moveAnnotation(1); break;
      case "backToComments": showCommentList(); break;
      case "copyCitation": if (selectedAnnotation) void copyAnnotationCitation(selectedAnnotation); break;
      case "editAnnotation": if (selectedAnnotation) beginEditingAnnotation(selectedAnnotation); break;
      case "deleteAnnotation": if (selectedAnnotation) void removeAnnotation(selectedAnnotation); break;
      case "createTask": requestPdfTask(); break;
      case "createDeadline": requestPdfDeadline(); break;
      case "rotate": setRotation((value) => (value + 90) % 360); break;
      case "toggleNavigator": setShowThumbnails((value) => !value); break;
      case "openOriginal": window.open(`/api/files/${attachmentId}`, "_blank", "noopener,noreferrer"); break;
      case "download": window.location.assign(`/api/files/${attachmentId}?download=1`); break;
      case "printPdf": window.open(`/api/files/${attachmentId}#toolbar=1`, "_blank", "noopener,noreferrer"); break;
      case "focusMode": toggleFocused(); break;
      case "shortcuts": setShortcutsOpen(true); break;
    }
  }

  function handlePdfShortcut(event: KeyboardEvent | React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    const activeElement = document.activeElement as HTMLElement | null;
    const documentHasReaderFocus = target === document.body || target === document.documentElement;
    const eventTarget = readerRef.current?.contains(target)
      ? target
      : readerRef.current?.contains(activeElement)
        ? activeElement
        : documentHasReaderFocus
          ? readerRef.current
          : null;
    if (!readerRef.current?.contains(eventTarget) || event.defaultPrevented || ("nativeEvent" in event ? event.nativeEvent.isComposing : event.isComposing)) return false;
    const shortcut = normalizePdfShortcut(event);
    if (!shortcut) return false;
    const action = PDF_SHORTCUT_ACTIONS.find((candidate) => shortcuts[candidate] === shortcut);
    if (!action) return false;
    if (eventTarget?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu], [data-shortcut-recorder]") && action !== "search") return false;
    event.preventDefault();
    event.stopPropagation();
    runPdfShortcut(action);
    return true;
  }

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
      if (handlePdfShortcut(event)) return;
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (typing) {
        if (event.key === "Escape" && event.target === searchInputRef.current) {
          event.preventDefault();
          if (query) setQuery(""); else setNavigatorTab("pages");
        }
        return;
      }
      if (event.key === "Escape") {
        setRegionMode(false); setRegion(null); clearSelection();
      }
      if (event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const goToPage = (nextPage: number) => {
        setPageNumber(nextPage);
        setCommentPanel((panel) => panel.mode === "thread" ? { mode: "list" } : panel);
        setActiveAnnotationId("");
        router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${nextPage}`, { scroll: false });
        if (viewMode === "continuous") window.setTimeout(() => continuousPageRefs.current.get(nextPage)?.scrollIntoView({ behavior: reducedMotion.current ? "auto" : "smooth", block: "start" }), 0);
      };
      if (event.key === "ArrowLeft" || event.key === "PageUp") goToPage(Math.max(1, pageNumber - 1));
      if (event.key === "ArrowRight" || event.key === "PageDown") goToPage(Math.min(pages.length, pageNumber + 1));
      if (event.key === "+" || event.key === "=") { setFitMode("custom"); setScale(Math.min(3, scale + 0.15)); }
      if (event.key === "-") { setFitMode("custom"); setScale(Math.max(0.5, scale - 0.15)); }
  });

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => handleWindowKeyDown(event);
    window.addEventListener("keydown", keyboard, true);
    return () => window.removeEventListener("keydown", keyboard, true);
  }, []);

  const scrolledAnnotation = useRef("");
  useEffect(() => {
    if (!initialAnnotationId || scrolledAnnotation.current === initialAnnotationId) return;
    const rect = viewportRef.current?.querySelector<HTMLElement>(`[data-annotation-rect="${CSS.escape(initialAnnotationId)}"]`);
    if (!rect || !rect.getBoundingClientRect().height) return;
    const frame = requestAnimationFrame(() => { scrolledAnnotation.current = initialAnnotationId; rect.scrollIntoView({ block: "center", behavior: "auto" }); });
    return () => cancelAnimationFrame(frame);
  }, [initialAnnotationId, textLayerVersion]);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setSelection(null); setSelectionAnchor(null); setSelectionAnchorPosition(null);
  }

  function captureSelection() {
    if (selectionBusy.current || pendingAnnotation || regionMode) return;
    const browserSelection = window.getSelection();
    const viewport = viewportRef.current;
    if (!browserSelection || !viewport) return;
    const parts = readPdfSelection(browserSelection, viewport);
    if (!parts.length) { setSelection(null); setSelectionAnchor(null); return; }
    if (parts.some((part) => part.text.length > 20_000 || part.rects.length > 200)) {
      setSelection(null); setSelectionAnchor(null); toast.error(t("selectionTooLong")); return;
    }
    const range = browserSelection.getRangeAt(0);
    const backwards = browserSelection.anchorNode === range.endContainer && browserSelection.anchorOffset === range.endOffset;
    const endpoint = backwards ? parts[0] : parts.at(-1)!;
    const rect = backwards ? endpoint.rects[0] : endpoint.rects.at(-1)!;
    setSelection({ ...parts[0], parts });
    setSelectionAnchor({ pageNumber: endpoint.pageNumber, x: backwards ? rect.x : rect.x + rect.width, y: rect.y + rect.height, side: backwards ? "left" : "right" });
  }

  const captureLatestSelection = useEffectEvent(captureSelection);
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => { if (!selectionDragging.current) captureLatestSelection(); }, 60);
    };
    const release = () => { selectionDragging.current = false; schedule(); };
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    return () => { clearTimeout(timer); document.removeEventListener("selectionchange", schedule); document.removeEventListener("pointerup", release); document.removeEventListener("pointercancel", release); };
  }, []);

  async function preparePassage(selected: PdfTextSelection) {
    if (selectionBusy.current) return;
    selectionBusy.current = true; setSelectionSaving(true);
    try {
      const existing = annotations.find((item) => item.kind === "text" && item.pageNumber === selected.pageNumber && item.selectedText === selected.text && JSON.stringify(annotationRects(item)) === JSON.stringify(selected.rects.map((rect) => rotatePdfRect(rect, -rotation))));
      const id = existing?.id ?? await saveAnnotation("text", selected.rects, selected.text, undefined, selected.pageNumber);
      rememberSourcePassage({ href: readerUrl(selected.pageNumber, id), title: sourceTitle, quote: selected.text });
      clearSelection();
      toast.success(t("sourcePassageReady"), { duration: 10000 });
    } catch { toast.error(t("sourcePassageFailed")); }
    finally { selectionBusy.current = false; setSelectionSaving(false); }
  }

  const removableHighlights = selection?.parts.flatMap((part) => findOverlappingHighlights(part.pageNumber, part.rects)) ?? [];

  async function changeSelectionHighlight(remove = false) {
    if (!selection || selectionBusy.current) return;
    selectionBusy.current = true; setSelectionSaving(true);
    try {
      if (remove) {
        for (const item of removableHighlights) {
          await deletePdfAnnotation(item.id);
          setAnnotations((items) => items.filter((candidate) => candidate.id !== item.id));
        }
      } else {
        for (const part of selection.parts) await saveAnnotation("text", part.rects, part.text, undefined, part.pageNumber);
      }
      clearSelection();
    } catch { toast.error(t("highlightFailed")); }
    finally { selectionBusy.current = false; setSelectionSaving(false); }
  }

  function requestAnnotation(annotation: PendingAnnotation) {
    setAnnotationNote("");
    if (annotation.kind === "text" && selectionAnchorPosition) setAnnotationAnchor(selectionAnchorPosition);
    else if (annotation.kind === "region" && pageShellRef.current) {
      const bounds = pageShellRef.current.getBoundingClientRect();
      const rect = annotation.geometry[0];
      setAnnotationAnchor({ left: bounds.left + (rect.x + rect.width) * bounds.width, top: bounds.top + (rect.y + rect.height) * bounds.height });
    } else setAnnotationAnchor(null);
    setPendingAnnotation(annotation);
  }

  async function saveAnnotation(kind: "text" | "region" | "bookmark", geometry: PdfRect[], selectedText = "", previewDataUrl?: string, annotationPageNumber = pageNumber, note = "") {
    geometry = geometry.map((rect) => rotatePdfRect(rect, -rotation));
    const result = await createPdfAnnotation({ documentId, pageNumber: annotationPageNumber, kind, geometry, selectedText, note, previewDataUrl });
    const created: ReaderAnnotation = { id: result.id, pageNumber: annotationPageNumber, kind, selectedText, note, label: "", geometryJson: JSON.stringify(geometry), hasPreview: Boolean(previewDataUrl), createdBy: user.id, createdByName: user.name, createdByMarkColor: user.markColor, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), comments: [] };
    setAnnotations((items) => [...items, created]);
    toast(t("annotationCreated"), {
      action: {
        label: t("undo"),
        onClick: () => { void deletePdfAnnotation(created.id); setAnnotations((items) => items.filter((item) => item.id !== created.id)); },
      },
    });
    window.getSelection()?.removeAllRanges(); setSelection(null); setSelectionAnchor(null); setAnnotationAnchor(null); setRegion(null); setRegionMode(false);
    return result.id;
  }

  function previewForRegion(rect: PdfRect) {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    const crop = document.createElement("canvas"); crop.width = Math.max(1, Math.round(rect.width * canvas.width)); crop.height = Math.max(1, Math.round(rect.height * canvas.height));
    crop.getContext("2d")?.drawImage(canvas, rect.x * canvas.width, rect.y * canvas.height, rect.width * canvas.width, rect.height * canvas.height, 0, 0, crop.width, crop.height);
    return crop.toDataURL("image/png");
  }

  function openAnnotation(annotation: ReaderAnnotation, navigateToPage = false, target?: HTMLElement) {
    setActiveAnnotationId(annotation.id);
    setCommentPanel({ mode: "thread", annotationId: annotation.id });
    const nextPage = navigateToPage ? annotation.pageNumber : pageNumber;
    if (navigateToPage) {
      setPageNumber(annotation.pageNumber);
      if (viewMode === "continuous") scrollToPage(annotation.pageNumber, "center");
    }
    router.replace(readerUrl(nextPage, annotation.id), { scroll: false });
    if (!target) window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-annotation-marker="${CSS.escape(annotation.id)}"]`)?.scrollIntoView({ block: "center", behavior: reducedMotion.current ? "auto" : "smooth" }));
  }

  function showCommentList() {
    setCommentPanel({ mode: "list" });
    setActiveAnnotationId("");
    router.replace(readerUrl(pageNumber), { scroll: false });
  }

  function closeCommentPanel() {
    setCommentPanel({ mode: "closed" });
    setActiveAnnotationId("");
    router.replace(readerUrl(pageNumber), { scroll: false });
  }

  function displayAnnotationRects(annotation: ReaderAnnotation) {
    const rects = annotationRects(annotation).map((rect) => rotatePdfRect(rect, rotation)).sort((left, right) => left.y - right.y || left.x - right.x);
    return rects.map((rect, index) => {
      let top = rect.y;
      let bottom = rect.y + rect.height;
      const previous = rects[index - 1]; const next = rects[index + 1];
      if (previous && previous.y < rect.y && previous.y + previous.height > top) top = (previous.y + previous.height + top) / 2;
      if (next && rect.y < next.y && bottom > next.y) bottom = (bottom + next.y) / 2;
      return { ...rect, y: top, height: Math.max(0, bottom - top) };
    }).filter((rect) => rect.width > 0 && rect.height > 0);
  }

  function annotationMarker(annotation: ReaderAnnotation) {
    if (!annotation.note && annotation.comments.length === 0) return null;
    const rects = displayAnnotationRects(annotation);
    if (!rects.length && annotation.kind !== "bookmark") return null;
    const top = rects.length ? (Math.min(...rects.map((rect) => rect.y)) + Math.max(...rects.map((rect) => rect.y + rect.height))) / 2 : 0.035;
    const active = activeAnnotationId === annotation.id;
    return <button type="button" key={`${annotation.id}-marker`} data-annotation-marker={annotation.id} data-testid="pdf-annotation-marker" onClick={(event) => openAnnotation(annotation, false, event.currentTarget)} aria-label={`${t(`annotationKinds.${annotation.kind}`)} · ${annotation.createdByName}`} aria-pressed={active} className="pointer-events-auto absolute grid size-6 cursor-pointer place-items-center rounded-full border shadow-sm backdrop-blur-sm transition-[transform,box-shadow,background-color] motion-reduce:transition-none hover:scale-105 hover:shadow motion-reduce:hover:scale-100" style={{ ...userMarkColorStyle(annotation.createdByMarkColor, annotation.createdBy), left: "calc(100% + 10px)", top: `${top * 100}%`, transform: "translateY(-50%)", borderColor: "var(--user-mark-solid)", backgroundColor: active ? "var(--user-mark-solid)" : "var(--background)", color: active ? "white" : "var(--user-mark-solid)", boxShadow: active ? "0 0 0 3px var(--user-mark-highlight)" : undefined }}>{annotation.kind === "bookmark" ? <Bookmark className="size-3.5" /> : <MessageCircle className="size-3.5" />}</button>;
  }

  function findOverlappingHighlights(targetPageNumber: number, geometry: PdfRect[]) {
    return annotations.filter((annotation) => annotation.createdBy === user.id && !annotation.note && annotation.comments.length === 0 && annotation.pageNumber === targetPageNumber && annotation.kind === "text" && displayAnnotationRects(annotation).some((existingRect) => geometry.some((rect) =>
      Math.min(existingRect.x + existingRect.width, rect.x + rect.width) > Math.max(existingRect.x, rect.x) &&
      Math.min(existingRect.y + existingRect.height, rect.y + rect.height) > Math.max(existingRect.y, rect.y),
    )));
  }

  async function applyFitMode(mode: FitMode) {
    setFitMode(mode);
    if (mode === "custom") return;
    if (!pdf || !viewportRef.current) return;
    const pdfPage = await pdf.getPage(pageNumber);
    const base = pdfPage.getViewport({ scale: 1, rotation });
    const nextScale = calculateFitScale({
      mode, pageWidth: base.width, pageHeight: base.height,
      viewportWidth: viewportRef.current.clientWidth, viewportHeight: viewportRef.current.clientHeight,
      padding: fitPadding,
    });
    if (nextScale !== null) setScale(nextScale);
  }

  function setCustomScale(nextScale: number) {
    setFitMode("custom");
    setScale(Math.min(3, Math.max(0.5, nextScale)));
  }

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

  function scrollToPage(targetPage: number, block: ScrollLogicalPosition = "start") {
    window.setTimeout(() => continuousPageRefs.current.get(targetPage)?.scrollIntoView({
      behavior: reducedMotion.current ? "auto" : "smooth", block,
    }), 0);
  }

  usePdfFitScale({ viewportRef, handleViewportWheel, fitMode, fitPadding, pageNumber, pdf, rotation, setScale });

  function selectionActionsStyle(anchor: { left: number; top: number; side: "left" | "right" }) {
    const width = 152; const height = 42; const gap = 8;
    const preferredLeft = anchor.side === "right" ? anchor.left + gap : anchor.left - width - gap;
    const viewport = viewportRef.current?.getBoundingClientRect();
    const minimumLeft = Math.max(16, viewport?.left ?? 16);
    const maximumRight = Math.min(window.innerWidth - 16, viewport?.right ?? window.innerWidth - 16);
    const left = Math.max(minimumLeft, Math.min(maximumRight - width, preferredLeft));
    const placeAbove = anchor.top - gap - height >= 16;
    const top = placeAbove ? anchor.top - gap : anchor.top + gap;
    return { left, top, transform: placeAbove ? "translateY(-100%)" : "translateY(0)" };
  }

  // ponytail: one stored width for all three tabs; the text tabs just get a wider floor.
  const navigatorWidth = navigatorTab === "pages" ? thumbnailWidth : Math.max(thumbnailWidth, 248);

  function beginThumbnailResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    thumbnailResizeRef.current = { startX: event.clientX, startWidth: navigatorWidth };
  }

  function beginCommentPanelResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    commentPanelResizeRef.current = { startX: event.clientX, startWidth: commentPanelWidth };
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

  const contextMarkerContext: PdfContextMarkerContext = {
    contextTasks, contextDeadlines, hoveredTaskId, setHoveredTaskId, hoveredDeadlineId, setHoveredDeadlineId, initialTaskId,
    initialDeadlineId, renderedAt, documentId, format, tTasks, tDeadlines, openDeadlineCreator, router,
  };

  function taskMarkersForPage(targetPage: number) {
    return pdfContextMarkersForPage(targetPage, contextMarkerContext);
  }

  const thumbnailTools = <PdfNavigatorPanel
    t={t} navigatorTab={navigatorTab} setNavigatorTab={setNavigatorTab} setShowThumbnails={setShowThumbnails}
    shortcutTitle={shortcutTitle} shortcuts={shortcuts} pages={pages} pageNumber={pageNumber} documentId={documentId}
    updateUrl={updateUrl} searchInputRef={searchInputRef} query={query} setQuery={setQuery} searchPending={searchPending}
    searchOccurrences={searchOccurrences} visibleSearchOccurrences={visibleSearchOccurrences}
    hasSearchableText={hasSearchableText} activeSearchIndex={activeSearchIndex} setActiveSearchIndex={setActiveSearchIndex}
    caseSensitiveSearch={caseSensitiveSearch} setCaseSensitiveSearch={setCaseSensitiveSearch}
    wholeWordSearch={wholeWordSearch} setWholeWordSearch={setWholeWordSearch} navigateSearch={navigateSearch}
    selectSearchOccurrence={selectSearchOccurrence} searchResultRefs={searchResultRefs} outline={outline}
    outlineLoaded={outlineLoaded} outlinePosition={outlinePosition} collapsedOutline={collapsedOutline}
    setCollapsedOutline={setCollapsedOutline}
  />;

  const commentThreads = annotations;
  const normalizedCommentSearch = commentSearch.trim().toLocaleLowerCase();
  const filteredCommentThreads = commentThreads.filter((annotation) => {
    if (currentPageCommentsOnly && annotation.pageNumber !== pageNumber) return false;
    if (annotationKindFilter !== "all" && annotation.kind !== annotationKindFilter) return false;
    if (annotationColorFilter !== "all" && annotation.createdByMarkColor !== annotationColorFilter) return false;
    if (annotationAuthorFilter !== "all" && annotation.createdBy !== annotationAuthorFilter) return false;
    return !normalizedCommentSearch || [annotation.label, annotation.selectedText, annotation.note, annotation.createdByName, ...annotation.comments.flatMap((comment) => [comment.body, comment.createdByName])]
      .some((value) => value.toLocaleLowerCase().includes(normalizedCommentSearch));
  });
  const selectedAnnotation = commentPanel.mode === "thread" ? annotations.find((annotation) => annotation.id === commentPanel.annotationId) : undefined;
  const annotationAuthors = [...new Map(annotations.map((annotation) => [annotation.createdBy, annotation.createdByName])).entries()];

  function moveAnnotation(direction: 1 | -1) {
    if (!selectedAnnotation || !filteredCommentThreads.length) return;
    const index = filteredCommentThreads.findIndex((annotation) => annotation.id === selectedAnnotation.id);
    const next = filteredCommentThreads[(Math.max(0, index) + direction + filteredCommentThreads.length) % filteredCommentThreads.length];
    if (next) openAnnotation(next, true);
  }

  const commentPanelProps: PdfCommentPanelProps = {
    t, tMarkColor, format, user, sourceTitle, wikiPages, commentPanel, selectedAnnotation, activeAnnotationId, commentThreads,
    filteredCommentThreads, annotationAuthors, commentSearch, setCommentSearch, annotationKindFilter, setAnnotationKindFilter,
    annotationColorFilter, setAnnotationColorFilter, annotationAuthorFilter, setAnnotationAuthorFilter, currentPageCommentsOnly,
    setCurrentPageCommentsOnly, editingAnnotation, setEditingAnnotation, annotationEditDraft, setAnnotationEditDraft,
    editingCommentId, setEditingCommentId, commentPending, commentDraftById, setCommentDraftById, replyByAnnotation,
    setReplyByAnnotation, sendToPageFor, setSendToPageFor, pageFilter, setPageFilter, showCommentList, closeCommentPanel,
    moveAnnotation, openAnnotation, readerUrl, saveAnnotationEdits, beginEditingAnnotation, removeAnnotation,
    copyAnnotationCitation, sendAnnotationToPage, submitReply, saveEditedReply, removeReply, beginEditingReply,
  };

  function renderCommentPanel() {
    return <PdfCommentPanel {...commentPanelProps} />;
  }

  // Focus mode hides side panels initially; it must not prevent users from
  // reopening navigation, search, or the outline while they are focused.
  const thumbnailsVisible = showThumbnails;
  const commentsVisible = commentPanel.mode !== "closed";
  const gridColumns = thumbnailsVisible && commentsVisible
      ? styles.gridWithThumbnailsAndAnnotations
      : thumbnailsVisible
        ? styles.gridWithThumbnails
        : commentsVisible
          ? styles.gridWithAnnotations
          : styles.gridOnlyReader;


  if (error) return <div className="grid min-h-screen place-items-center p-8 text-center"><div><p className="text-destructive">{error}</p><Link className={buttonVariants({ className: "mt-3" })} href="/wiki">{t("backToWikiStart")}</Link></div></div>;

  return <div ref={readerRef} className="flex h-dvh min-h-0 flex-col bg-transparent" onKeyDownCapture={handlePdfShortcut}>
    <div className="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</div>
    <header data-testid="pdf-toolbar" className="flex h-12 shrink-0 flex-nowrap items-center gap-1 overflow-hidden border-b bg-background px-2 shadow-sm"><Link aria-label={t("backToWikiStart")} title={t("backToWikiStart")} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} href="/wiki"><ArrowLeft className="size-4" /></Link><div className="hidden min-w-0 max-w-48 flex-1 lg:block"><p className="truncate text-xs font-medium">{sourceTitle}</p><p className="truncate text-[10px] text-muted-foreground">{fileName}</p></div>
      <div className="flex shrink-0 items-center rounded-lg border bg-muted/20"><Button aria-label={t("previousPage")} title={shortcutTitle("previousPage", t("previousPage"))} variant="ghost" size="icon-sm" disabled={pageNumber <= 1} onClick={() => updateUrl(pageNumber - 1)}><ChevronLeft className="size-4" /></Button><Input aria-label={t("page")} className="h-7 w-11 border-0 bg-transparent px-1 text-center text-xs shadow-none" inputMode="numeric" value={pageNumber} onChange={(event) => { const page = Number(event.target.value); if (Number.isInteger(page) && page >= 1 && page <= pages.length) updateUrl(page); }} /><span className="pr-1 text-[10px] text-muted-foreground">/ {pages.length}</span><Button aria-label={t("nextPage")} title={shortcutTitle("nextPage", t("nextPage"))} variant="ghost" size="icon-sm" disabled={pageNumber >= pages.length} onClick={() => updateUrl(pageNumber + 1)}><ChevronRight className="size-4" /></Button></div>
      <Button aria-label={t("zoomOut")} title={shortcutTitle("zoomOut", t("zoomOut"))} variant="ghost" size="icon-sm" onClick={() => setCustomScale(scale - 0.15)}><Minus className="size-4" /></Button>
      <DropdownMenu><DropdownMenuTrigger render={<Button ref={zoomLabelRef} variant="ghost" size="sm" className="min-w-14 px-1 text-xs tabular-nums" aria-label={t("zoomOptions")} />}>{Math.round(scale * 100)}%<ChevronDown className="size-3" /></DropdownMenuTrigger><DropdownMenuContent align="center" className="w-48"><div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">{t("zoomOptions")}</div><DropdownMenuItem onClick={() => void applyFitMode("width")}>{fitMode === "width" && <Check />}{t("fitWidth")}<DropdownMenuShortcut>{showShortcut(shortcuts.fitWidth)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem onClick={() => void applyFitMode("page")}>{fitMode === "page" && <Check />}{t("fitPage")}<DropdownMenuShortcut>{showShortcut(shortcuts.fitPage)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem onClick={() => void applyFitMode("actual")}>{fitMode === "actual" && <Check />}{t("actualSize")}<DropdownMenuShortcut>{showShortcut(shortcuts.actualSize)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuSeparator />{[75, 100, 125, 150, 200].map((percentage) => <DropdownMenuItem key={percentage} onClick={() => setCustomScale(percentage / 100)}>{Math.round(scale * 100) === percentage && fitMode === "custom" && <Check />}{percentage}%</DropdownMenuItem>)}<DropdownMenuSeparator /><div className="px-1.5 py-1"><label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="pdf-custom-zoom">{t("customZoom")}</label><Input id="pdf-custom-zoom" aria-label={t("customZoom")} className="h-7" type="number" min={50} max={300} defaultValue={Math.round(scale * 100)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") setCustomScale(Number(event.currentTarget.value) / 100); }} /></div></DropdownMenuContent></DropdownMenu>
      <Button data-testid="pdf-zoom-in" aria-label={t("zoomIn")} title={shortcutTitle("zoomIn", t("zoomIn"))} variant="ghost" size="icon-sm" onClick={() => setCustomScale(scale + 0.15)}><Plus className="size-4" /></Button>
      <Button aria-label={t("captureRegion")} title={shortcutTitle("captureRegion", t("captureRegion"))} variant={regionMode ? "secondary" : "ghost"} size="sm" className="shrink-0 px-2" onClick={() => { if (viewMode === "continuous") setViewMode("single"); setRegionMode((value) => !value); }}><SquareDashedMousePointer className="size-4" /><span className="hidden xl:inline">{t("captureRegion")}</span></Button>
      <Button aria-label={tTasks("createTask")} title={shortcutTitle("createTask", tTasks("createTask"))} variant="ghost" size="icon-sm" onClick={requestPdfTask}><ClipboardPlus className="size-4" /></Button>
      <Button aria-label={tDeadlines("createDeadline")} title={shortcutTitle("createDeadline", tDeadlines("createDeadline"))} variant="ghost" size="icon-sm" onClick={requestPdfDeadline}><CalendarClock className="size-4" /></Button>
      <Button aria-label={t("bookmarkPage")} title={shortcutTitle("bookmarkPage", t("bookmarkPage"))} variant="ghost" size="icon-sm" onClick={() => requestAnnotation({ kind: "bookmark", geometry: [], selectedText: "", pageNumber })}><Bookmark className="size-4" /></Button>
      <Button className="relative" variant={commentsVisible ? "secondary" : "ghost"} size="icon-sm" aria-label={commentsVisible ? t("hideAnnotations") : t("showAnnotations")} aria-pressed={commentsVisible} title={shortcutTitle("comments", commentsVisible ? t("hideAnnotations") : t("showAnnotations"))} onClick={() => commentsVisible ? closeCommentPanel() : showCommentList()}><MessageCircle className="size-4" />{commentThreads.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-indigo-600 px-1 text-[9px] leading-4 text-white tabular-nums">{commentThreads.length}</span>}</Button>
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("morePdfActions")} title={t("morePdfActions")} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">{t("viewMode")}</div><DropdownMenuItem onClick={() => changeViewMode("continuous")}>{viewMode === "continuous" && <Check />}{t("continuousView")}<DropdownMenuShortcut>{showShortcut(shortcuts.continuousView)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem onClick={() => changeViewMode("single")}>{viewMode === "single" && <Check />}{t("singlePageView")}<DropdownMenuShortcut>{showShortcut(shortcuts.singlePageView)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem onClick={() => changeViewMode("double")}>{viewMode === "double" && <Check />}{t("doublePageView")}<DropdownMenuShortcut>{showShortcut(shortcuts.doublePageView)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setRotation((value) => (value + 90) % 360)}><RotateCw />{t("rotate")}<DropdownMenuShortcut>{showShortcut(shortcuts.rotate)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem onClick={() => setShowThumbnails((value) => !value)}><FileSearch />{showThumbnails ? t("hideNavigator") : t("showNavigator")}<DropdownMenuShortcut>{showShortcut(shortcuts.toggleNavigator)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem onClick={() => { setShowThumbnails(true); setNavigatorTab("outline"); }}><ListTree />{t("outline")}<DropdownMenuShortcut>{showShortcut(shortcuts.outline)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => runPdfShortcut("download")}><Download />{t("download")}<DropdownMenuShortcut>{showShortcut(shortcuts.download)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem onClick={() => runPdfShortcut("openOriginal")}><ExternalLink />{t("openOriginal")}<DropdownMenuShortcut>{showShortcut(shortcuts.openOriginal)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem onClick={() => runPdfShortcut("printPdf")}><Printer />{t("printPdf")}<DropdownMenuShortcut>{showShortcut(shortcuts.printPdf)}</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setShortcutsOpen(true)}><Keyboard />{t("keyboardShortcuts")}<DropdownMenuShortcut>{showShortcut(shortcuts.shortcuts)}</DropdownMenuShortcut></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <FocusModeToggle compact />
    </header>
    <div className={`relative grid min-h-0 flex-1 ${styles.readerGrid} ${gridColumns}`} style={{ "--pdf-thumbnail-width": `${navigatorWidth}px`, "--pdf-comment-width": `${commentPanelWidth}px` } as React.CSSProperties}>
      {thumbnailsVisible && <><aside data-testid="pdf-thumbnails-panel" className="hidden min-h-0 overflow-hidden border-r bg-background md:block">{thumbnailTools}</aside><button type="button" aria-label={t("resizeThumbnails")} title={t("resizeThumbnails")} className="absolute inset-y-0 z-30 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none border-x border-transparent bg-background/50 transition-colors hover:border-indigo-300 hover:bg-indigo-500/15 focus-visible:border-indigo-500 focus-visible:bg-indigo-500/15 md:block" style={{ left: `${navigatorWidth}px` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); beginThumbnailResize(event); }} /></>}
      <section ref={viewportRef} data-testid="pdf-reader-viewport" className="relative overflow-auto [overflow-anchor:none] p-4" onPointerDown={(event) => { if (!(event.target as Element).closest("[data-testid=pdf-selection-actions]")) selectionDragging.current = true; }} onMouseUp={(event) => { if (!(event.target as Element).closest("[data-testid=pdf-selection-actions]")) captureSelection(); }}>{!pdf || (rendering && viewMode !== "continuous") ? <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center"><Loader2 className="size-7 animate-spin text-indigo-500" /></div> : null}{viewMode === "continuous" ? <div ref={zoomContentRef} className="space-y-4">{pages.map((page) => <div key={page.pageNumber} data-page-number={page.pageNumber} ref={(element) => { if (element) continuousPageRefs.current.set(page.pageNumber, element); else continuousPageRefs.current.delete(page.pageNumber); }} className={styles.pageShell}><canvas ref={(element) => { if (element) continuousCanvasRefs.current.set(page.pageNumber, element); else continuousCanvasRefs.current.delete(page.pageNumber); }} className="block" /><div data-pdf-search-overlay className={styles.searchOverlay} /><div ref={(element) => { if (element) continuousTextLayerRefs.current.set(page.pageNumber, element); else continuousTextLayerRefs.current.delete(page.pageNumber); }} data-pdf-text-layer className={styles.textLayer} /><div className="pointer-events-none absolute inset-0 z-[3]">{annotations.filter((annotation) => annotation.pageNumber === page.pageNumber).flatMap((annotation) => displayAnnotationRects(annotation).map((rect, index) => <div data-annotation-rect={annotation.id} key={annotation.id + "-" + index} className="absolute" style={{ ...userMarkColorStyle(annotation.createdByMarkColor, annotation.createdBy), left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: "var(--user-mark-highlight)", borderBottom: annotation.kind === "region" ? "2px solid var(--user-mark-solid)" : undefined }} />))}{annotations.filter((annotation) => annotation.pageNumber === page.pageNumber).map(annotationMarker)}{taskMarkersForPage(page.pageNumber)}</div></div>)}</div> : <div ref={zoomContentRef} className="flex items-start justify-center gap-4"><div ref={pageShellRef} data-page-number={pageNumber} className={styles.pageShell}><canvas ref={canvasRef} className="block" /><div data-pdf-search-overlay className={styles.searchOverlay} /><div ref={textLayerRef} data-pdf-text-layer className={styles.textLayer} />
        <div className="pointer-events-none absolute inset-0 z-[3]">{pageAnnotations.flatMap((annotation) => displayAnnotationRects(annotation).map((rect, index) => <div data-annotation-rect={annotation.id} key={annotation.id + "-" + index} className="absolute" style={{ ...userMarkColorStyle(annotation.createdByMarkColor, annotation.createdBy), left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: "var(--user-mark-highlight)", borderBottom: annotation.kind === "region" ? "2px solid var(--user-mark-solid)" : undefined }} />))}{pageAnnotations.map(annotationMarker)}{taskMarkersForPage(pageNumber)}{region && <div className="absolute border-2 bg-transparent" style={{ ...userMarkColorStyle(user.markColor, user.id), left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%`, borderColor: "var(--user-mark-solid)", backgroundColor: "var(--user-mark-highlight)" }} />}</div>
        {regionMode && <div data-testid="pdf-region-selector" className="absolute inset-0 z-[5] cursor-crosshair" onPointerDown={(event) => { regionStart.current = regionPoint(event); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!regionStart.current) return; const end = regionPoint(event); setRegion({ x: Math.min(regionStart.current.x, end.x), y: Math.min(regionStart.current.y, end.y), width: Math.abs(end.x - regionStart.current.x), height: Math.abs(end.y - regionStart.current.y) }); }} onPointerUp={(event) => { const start = regionStart.current; if (start) { const end = regionPoint(event); setRegion({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }); const bounds = event.currentTarget.getBoundingClientRect(); setSelectionAnchor({ pageNumber, x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height, side: "right" }); } if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); regionStart.current = null; }} />}
      </div>{viewMode === "double" && pageNumber < pages.length && <div ref={secondaryPageShellRef} data-page-number={pageNumber + 1} className={styles.pageShell}><canvas ref={secondaryCanvasRef} className="block" /><div data-pdf-search-overlay className={styles.searchOverlay} /><div ref={secondaryTextLayerRef} data-pdf-text-layer className={styles.textLayer} /><div className="pointer-events-none absolute inset-0 z-[3]">{annotations.filter((annotation) => annotation.pageNumber === pageNumber + 1).flatMap((annotation) => displayAnnotationRects(annotation).map((rect, index) => <div data-annotation-rect={annotation.id} key={annotation.id + "-secondary-" + index} className="absolute" style={{ ...userMarkColorStyle(annotation.createdByMarkColor, annotation.createdBy), left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: "var(--user-mark-highlight)", borderBottom: annotation.kind === "region" ? "2px solid var(--user-mark-solid)" : undefined }} />))}{annotations.filter((annotation) => annotation.pageNumber === pageNumber + 1).map(annotationMarker)}{taskMarkersForPage(pageNumber + 1)}</div></div>}</div>}{selection && selectionAnchorPosition && <div data-testid="pdf-selection-actions" role="toolbar" className="fixed z-40 flex gap-1 rounded-lg border bg-background p-1 shadow-xl" style={selectionActionsStyle(selectionAnchorPosition)} onMouseDown={(event) => event.preventDefault()} onMouseUp={(event) => event.stopPropagation()}>
          <Button size="icon-sm" disabled={selectionSaving} aria-label={t(removableHighlights.length ? "removeHighlight" : "highlight")} title={t(removableHighlights.length ? "removeHighlight" : "highlight")} onClick={() => void changeSelectionHighlight(Boolean(removableHighlights.length))}>{removableHighlights.length ? <Eraser className="size-4" /> : <Highlighter className="size-4" />}</Button>
          <Button size="icon-sm" variant="outline" disabled={selectionSaving || selection.parts.length > 1} aria-label={t("note")} title={t(selection.parts.length > 1 ? "singlePagePassage" : "note")} onClick={() => requestAnnotation({ kind: "text", geometry: selection.rects, selectedText: selection.text, pageNumber: selection.pageNumber })}><MessageCircle className="size-4" /></Button>
          <Button size="icon-sm" variant="outline" disabled={selectionSaving || selection.parts.length > 1} aria-label={t("prepareSourcePassage")} title={t(selection.parts.length > 1 ? "singlePagePassage" : "prepareSourcePassage")} onClick={() => void preparePassage(selection)}><Link2 className="size-4" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("cancel")} title={t("cancel")} onClick={clearSelection}><X className="size-4" /></Button>
        </div>}{region && selectionAnchorPosition && <div data-testid="pdf-selection-actions" className="fixed z-40 flex gap-1 rounded-lg border bg-background p-1 shadow-xl" style={selectionActionsStyle(selectionAnchorPosition)} onMouseDown={(event) => event.preventDefault()} onMouseUp={(event) => event.stopPropagation()}><Button size="icon-sm" aria-label={t("highlight")} title={t("highlight")} onClick={() => void saveAnnotation("region", [region], "", previewForRegion(region), pageNumber, "")}><Highlighter className="size-4" /></Button><Button size="icon-sm" variant="outline" aria-label={t("note")} title={t("note")} onClick={() => requestAnnotation({ kind: "region", geometry: [region], selectedText: "", previewDataUrl: previewForRegion(region), pageNumber })}><MessageCircle className="size-4" /></Button><Button size="sm" variant="ghost" onClick={() => { setRegion(null); setSelectionAnchor(null); }}>{t("cancel")}</Button></div>}</section>
      {commentsVisible && <><button type="button" aria-label={t("resizeComments")} title={t("resizeComments")} className="absolute inset-y-0 right-[var(--pdf-comment-width)] z-30 hidden w-3 translate-x-1/2 cursor-col-resize touch-none border-x border-transparent bg-background/50 transition-colors hover:border-indigo-300 hover:bg-indigo-500/15 focus-visible:border-indigo-500 focus-visible:bg-indigo-500/15 md:block" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); beginCommentPanelResize(event); }} /><aside data-testid="pdf-comments-panel" className="hidden min-h-0 overflow-hidden border-l bg-background md:block">{renderCommentPanel()}</aside></>}
    </div>
    <Sheet open={compactViewport && commentsVisible} onOpenChange={(open) => { if (!open) closeCommentPanel(); }}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[min(76dvh,36rem)] rounded-t-2xl p-0"><div data-testid="pdf-annotation-mobile-sheet" className="min-h-0 flex-1">{renderCommentPanel()}</div></SheetContent>
    </Sheet>
    <PdfShortcutsDialog t={t} shortcutsOpen={shortcutsOpen} setShortcutsOpen={setShortcutsOpen} shortcuts={shortcuts} setShortcuts={setShortcuts} showShortcut={showShortcut} shortcutActionLabel={shortcutActionLabel} />
    <PdfAnnotationNoteDialog t={t} pendingAnnotation={pendingAnnotation} setPendingAnnotation={setPendingAnnotation} annotationAnchor={annotationAnchor} setAnnotationAnchor={setAnnotationAnchor} annotationNote={annotationNote} setAnnotationNote={setAnnotationNote} saveAnnotation={saveAnnotation} />
  </div>;
}
