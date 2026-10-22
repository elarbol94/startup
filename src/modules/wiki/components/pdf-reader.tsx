"use client";
// PDF reader page. Its hooks, panels, dialogs and helpers live in ./pdf-reader/.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Bookmark, Loader2, MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useFocusMode } from "@/components/focus-mode";
import { rotatePdfRect } from "../lib/pdf-selection";
import type { PdfRect } from "../lib/pdf-evidence";
import { calculateFitScale, type FitMode, type NavigatorTab } from "../lib/pdf-reader-utils";
import { DEFAULT_PDF_SHORTCUT_BINDINGS, type PdfShortcutAction, type PdfShortcutBindings } from "../lib/pdf-shortcuts";
import { displayShortcut } from "../lib/shortcut-display";
import { useIsMacPlatform } from "@/components/ui/shortcut-tooltip";
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
import { PdfReaderToolbar } from "./pdf-reader/pdf-reader-toolbar";
import type { CommentPanelState, PendingAnnotation, ReaderAnnotation, ReaderPage } from "./pdf-reader/pdf-reader-types";
import { PdfSelectionActions } from "./pdf-reader/pdf-selection-actions";
import { PdfShortcutsDialog } from "./pdf-reader/pdf-shortcuts-dialog";
import { usePdfAnnotationCapture } from "./pdf-reader/use-pdf-annotation-capture";
import { usePdfAnnotationThreads } from "./pdf-reader/use-pdf-annotation-threads";
import { usePdfContextAnchors } from "./pdf-reader/use-pdf-context-anchors";
import { usePdfKeyboard } from "./pdf-reader/use-pdf-keyboard";
import { usePdfOutline } from "./pdf-reader/use-pdf-outline";
import { usePdfReaderPreferences } from "./pdf-reader/use-pdf-reader-preferences";
import { usePdfRendering } from "./pdf-reader/use-pdf-rendering";
import { usePdfScrollTracking } from "./pdf-reader/use-pdf-scroll-tracking";
import { usePdfSearch } from "./pdf-reader/use-pdf-search";
import { usePdfSearchHighlights } from "./pdf-reader/use-pdf-search-highlights";
import { usePdfTextSelection } from "./pdf-reader/use-pdf-text-selection";
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
  const mac = useIsMacPlatform();
  const showShortcut = (binding: string) => displayShortcut(binding, shortcutKeys, { mac });
  const pdfLoadFailedMessage = t("pdfLoadFailed");
  const { isFocused, handleFocusShortcut } = useFocusMode();
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
  const [continuousRenderPages, setContinuousRenderPages] = useState<number[]>([pageNumber]);
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
  const selectionBusy = useRef(false);
  const selectionDragging = useRef(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [hoveredDeadlineId, setHoveredDeadlineId] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [annotationNote, setAnnotationNote] = useState("");
  const [annotationAnchor, setAnnotationAnchor] = useState<{ left: number; top: number } | null>(null);
  const [regionMode, setRegionMode] = useState(false); const [region, setRegion] = useState<PdfRect | null>(null);
  const regionStart = useRef<{ x: number; y: number } | null>(null);
  const restoreContinuousPage = useRef<number | null>(null);

  usePdfContextAnchors({
    initialTaskId, contextTasks, initialDeadlineId, contextDeadlines, pageNumber, setPageNumber, rendering, router,
    sourceId, documentId, viewMode, tTasks, tDeadlines, readerRef, restoreContinuousPage, scrollToPage,
  });
  const {
    query, setQuery, activeSearchIndex, setActiveSearchIndex, caseSensitiveSearch, setCaseSensitiveSearch,
    wholeWordSearch, setWholeWordSearch, searchInputRef, searchResultRefs, searchPending, searchOccurrences,
    hasSearchableText, visibleSearchOccurrences, openPdfSearch, navigateSearch, selectSearchOccurrence,
  } = usePdfSearch({ pages, t, setLiveMessage, setShowThumbnails, setNavigatorTab, updateUrl });
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

  const {
    selection, setSelection, selectionSaving, setSelectionSaving, setSelectionAnchor, selectionAnchorPosition,
    clearSelection, captureSelection,
  } = usePdfTextSelection({
    t, viewMode, scale, rotation, pageNumber, pendingAnnotation, regionMode, selectionBusy, selectionDragging,
    viewportRef, pageShellRef, secondaryPageShellRef, continuousPageRefs,
  });

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
      case "focusMode": handleFocusShortcut(); break;
      case "shortcuts": setShortcutsOpen(true); break;
    }
  }

  const { handlePdfShortcut } = usePdfKeyboard({
    readerRef, shortcuts, runPdfShortcut, searchInputRef, query, setQuery, setNavigatorTab, setRegionMode, setRegion,
    clearSelection, setPageNumber, setCommentPanel, setActiveAnnotationId, router, sourceId, documentId, viewMode,
    continuousPageRefs, reducedMotion, pageNumber, pages, scale, setFitMode, setScale,
  });

  const scrolledAnnotation = useRef("");
  useEffect(() => {
    if (!initialAnnotationId || scrolledAnnotation.current === initialAnnotationId) return;
    const rect = viewportRef.current?.querySelector<HTMLElement>(`[data-annotation-rect="${CSS.escape(initialAnnotationId)}"]`);
    if (!rect || !rect.getBoundingClientRect().height) return;
    const frame = requestAnimationFrame(() => { scrolledAnnotation.current = initialAnnotationId; rect.scrollIntoView({ block: "center", behavior: "auto" }); });
    return () => cancelAnimationFrame(frame);
  }, [initialAnnotationId, textLayerVersion]);

  const {
    preparePassage, removableHighlights, changeSelectionHighlight, requestAnnotation, saveAnnotation, previewForRegion,
  } = usePdfAnnotationCapture({
    annotations, setAnnotations, rotation, documentId, pageNumber, sourceTitle, user, t, readerUrl, displayAnnotationRects,
    selection, setSelection, selectionBusy, setSelectionSaving, selectionAnchorPosition, setSelectionAnchor, clearSelection,
    setAnnotationNote, setAnnotationAnchor, setPendingAnnotation, setRegion, setRegionMode, pageShellRef, canvasRef,
  });

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
    <PdfReaderToolbar
      t={t} tTasks={tTasks} tDeadlines={tDeadlines} sourceTitle={sourceTitle} fileName={fileName} pages={pages}
      pageNumber={pageNumber} updateUrl={updateUrl} scale={scale} setCustomScale={setCustomScale} zoomLabelRef={zoomLabelRef}
      fitMode={fitMode} applyFitMode={applyFitMode} shortcuts={shortcuts} showShortcut={showShortcut} shortcutTitle={shortcutTitle}
      regionMode={regionMode} viewMode={viewMode} setViewMode={setViewMode} setRegionMode={setRegionMode}
      changeViewMode={changeViewMode} requestPdfTask={requestPdfTask} requestPdfDeadline={requestPdfDeadline}
      requestAnnotation={requestAnnotation} commentsVisible={commentsVisible} closeCommentPanel={closeCommentPanel}
      showCommentList={showCommentList} commentThreads={commentThreads} setRotation={setRotation}
      showThumbnails={showThumbnails} setShowThumbnails={setShowThumbnails} setNavigatorTab={setNavigatorTab}
      runPdfShortcut={runPdfShortcut} setShortcutsOpen={setShortcutsOpen}
    />
    <div className={`relative grid min-h-0 flex-1 ${styles.readerGrid} ${gridColumns}`} style={{ "--pdf-thumbnail-width": `${navigatorWidth}px`, "--pdf-comment-width": `${commentPanelWidth}px` } as React.CSSProperties}>
      {thumbnailsVisible && <><aside data-testid="pdf-thumbnails-panel" className="hidden min-h-0 overflow-hidden border-r bg-background md:block">{thumbnailTools}</aside><button type="button" aria-label={t("resizeThumbnails")} title={t("resizeThumbnails")} className="absolute inset-y-0 z-30 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none border-x border-transparent bg-background/50 transition-colors hover:border-indigo-300 hover:bg-indigo-500/15 focus-visible:border-indigo-500 focus-visible:bg-indigo-500/15 md:block" style={{ left: `${navigatorWidth}px` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); beginThumbnailResize(event); }} /></>}
      <section ref={viewportRef} data-testid="pdf-reader-viewport" className="relative overflow-auto [overflow-anchor:none] p-4" onPointerDown={(event) => { if (!(event.target as Element).closest("[data-testid=pdf-selection-actions]")) selectionDragging.current = true; }} onMouseUp={(event) => { if (!(event.target as Element).closest("[data-testid=pdf-selection-actions]")) captureSelection(); }}>{!pdf || (rendering && viewMode !== "continuous") ? <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center"><Loader2 className="size-7 animate-spin text-indigo-500" /></div> : null}{viewMode === "continuous" ? <div ref={zoomContentRef} className="space-y-4">{pages.map((page) => <div key={page.pageNumber} data-page-number={page.pageNumber} ref={(element) => { if (element) continuousPageRefs.current.set(page.pageNumber, element); else continuousPageRefs.current.delete(page.pageNumber); }} className={styles.pageShell}><canvas ref={(element) => { if (element) continuousCanvasRefs.current.set(page.pageNumber, element); else continuousCanvasRefs.current.delete(page.pageNumber); }} className="block" /><div data-pdf-search-overlay className={styles.searchOverlay} /><div ref={(element) => { if (element) continuousTextLayerRefs.current.set(page.pageNumber, element); else continuousTextLayerRefs.current.delete(page.pageNumber); }} data-pdf-text-layer className={styles.textLayer} /><div className="pointer-events-none absolute inset-0 z-[3]">{annotations.filter((annotation) => annotation.pageNumber === page.pageNumber).flatMap((annotation) => displayAnnotationRects(annotation).map((rect, index) => <div data-annotation-rect={annotation.id} key={annotation.id + "-" + index} className="absolute" style={{ ...userMarkColorStyle(annotation.createdByMarkColor, annotation.createdBy), left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: "var(--user-mark-highlight)", borderBottom: annotation.kind === "region" ? "2px solid var(--user-mark-solid)" : undefined }} />))}{annotations.filter((annotation) => annotation.pageNumber === page.pageNumber).map(annotationMarker)}{taskMarkersForPage(page.pageNumber)}</div></div>)}</div> : <div ref={zoomContentRef} className="flex items-start justify-center gap-4"><div ref={pageShellRef} data-page-number={pageNumber} className={styles.pageShell}><canvas ref={canvasRef} className="block" /><div data-pdf-search-overlay className={styles.searchOverlay} /><div ref={textLayerRef} data-pdf-text-layer className={styles.textLayer} />
        <div className="pointer-events-none absolute inset-0 z-[3]">{pageAnnotations.flatMap((annotation) => displayAnnotationRects(annotation).map((rect, index) => <div data-annotation-rect={annotation.id} key={annotation.id + "-" + index} className="absolute" style={{ ...userMarkColorStyle(annotation.createdByMarkColor, annotation.createdBy), left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: "var(--user-mark-highlight)", borderBottom: annotation.kind === "region" ? "2px solid var(--user-mark-solid)" : undefined }} />))}{pageAnnotations.map(annotationMarker)}{taskMarkersForPage(pageNumber)}{region && <div className="absolute border-2 bg-transparent" style={{ ...userMarkColorStyle(user.markColor, user.id), left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%`, borderColor: "var(--user-mark-solid)", backgroundColor: "var(--user-mark-highlight)" }} />}</div>
        {regionMode && <div data-testid="pdf-region-selector" className="absolute inset-0 z-[5] cursor-crosshair" onPointerDown={(event) => { regionStart.current = regionPoint(event); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!regionStart.current) return; const end = regionPoint(event); setRegion({ x: Math.min(regionStart.current.x, end.x), y: Math.min(regionStart.current.y, end.y), width: Math.abs(end.x - regionStart.current.x), height: Math.abs(end.y - regionStart.current.y) }); }} onPointerUp={(event) => { const start = regionStart.current; if (start) { const end = regionPoint(event); setRegion({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }); const bounds = event.currentTarget.getBoundingClientRect(); setSelectionAnchor({ pageNumber, x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height, side: "right" }); } if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); regionStart.current = null; }} />}
      </div>{viewMode === "double" && pageNumber < pages.length && <div ref={secondaryPageShellRef} data-page-number={pageNumber + 1} className={styles.pageShell}><canvas ref={secondaryCanvasRef} className="block" /><div data-pdf-search-overlay className={styles.searchOverlay} /><div ref={secondaryTextLayerRef} data-pdf-text-layer className={styles.textLayer} /><div className="pointer-events-none absolute inset-0 z-[3]">{annotations.filter((annotation) => annotation.pageNumber === pageNumber + 1).flatMap((annotation) => displayAnnotationRects(annotation).map((rect, index) => <div data-annotation-rect={annotation.id} key={annotation.id + "-secondary-" + index} className="absolute" style={{ ...userMarkColorStyle(annotation.createdByMarkColor, annotation.createdBy), left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: "var(--user-mark-highlight)", borderBottom: annotation.kind === "region" ? "2px solid var(--user-mark-solid)" : undefined }} />))}{annotations.filter((annotation) => annotation.pageNumber === pageNumber + 1).map(annotationMarker)}{taskMarkersForPage(pageNumber + 1)}</div></div>}</div>}<PdfSelectionActions
        t={t} selection={selection} region={region} selectionAnchorPosition={selectionAnchorPosition}
        selectionSaving={selectionSaving} removableHighlights={removableHighlights}
        changeSelectionHighlight={changeSelectionHighlight} requestAnnotation={requestAnnotation}
        preparePassage={preparePassage} clearSelection={clearSelection} saveAnnotation={saveAnnotation}
        previewForRegion={previewForRegion} pageNumber={pageNumber} setRegion={setRegion}
        setSelectionAnchor={setSelectionAnchor} selectionActionsStyle={selectionActionsStyle}
      /></section>
      {commentsVisible && <><button type="button" aria-label={t("resizeComments")} title={t("resizeComments")} className="absolute inset-y-0 right-[var(--pdf-comment-width)] z-30 hidden w-3 translate-x-1/2 cursor-col-resize touch-none border-x border-transparent bg-background/50 transition-colors hover:border-indigo-300 hover:bg-indigo-500/15 focus-visible:border-indigo-500 focus-visible:bg-indigo-500/15 md:block" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); beginCommentPanelResize(event); }} /><aside data-testid="pdf-comments-panel" className="hidden min-h-0 overflow-hidden border-l bg-background md:block">{renderCommentPanel()}</aside></>}
    </div>
    <Sheet open={compactViewport && commentsVisible} onOpenChange={(open) => { if (!open) closeCommentPanel(); }}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[min(76dvh,36rem)] rounded-t-2xl p-0"><div data-testid="pdf-annotation-mobile-sheet" className="min-h-0 flex-1">{renderCommentPanel()}</div></SheetContent>
    </Sheet>
    <PdfShortcutsDialog t={t} shortcutsOpen={shortcutsOpen} setShortcutsOpen={setShortcutsOpen} shortcuts={shortcuts} setShortcuts={setShortcuts} showShortcut={showShortcut} shortcutActionLabel={shortcutActionLabel} />
    <PdfAnnotationNoteDialog t={t} pendingAnnotation={pendingAnnotation} setPendingAnnotation={setPendingAnnotation} annotationAnchor={annotationAnchor} setAnnotationAnchor={setAnnotationAnchor} annotationNote={annotationNote} setAnnotationNote={setAnnotationNote} saveAnnotation={saveAnnotation} />
  </div>;
}
