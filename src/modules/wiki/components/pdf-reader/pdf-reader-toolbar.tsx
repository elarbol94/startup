"use client";

// The PDF reader's top toolbar: back link, page field, zoom, region capture, task/deadline/
// bookmark buttons, the comments toggle and the overflow menu (view mode, rotate, navigator,
// download/print, shortcuts). Used by pdf-reader.tsx.
import type { Dispatch, RefObject, SetStateAction } from "react";
import Link from "next/link";
import type { useTranslations } from "next-intl";
import {
  ArrowLeft, Bookmark, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardPlus, Download,
  ExternalLink, FileSearch, Keyboard, ListTree, MessageCircle, Minus, MoreHorizontal, Plus, Printer, RotateCw,
  SquareDashedMousePointer,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FocusModeToggle } from "@/components/focus-mode";
import type { FitMode, NavigatorTab, PdfViewMode } from "../../lib/pdf-reader-utils";
import type { PdfShortcutAction, PdfShortcutBindings } from "../../lib/pdf-shortcuts";
import type { PendingAnnotation, ReaderAnnotation, ReaderPage } from "./pdf-reader-types";

export function PdfReaderToolbar({
  t, tTasks, tDeadlines, sourceTitle, fileName, pages, pageNumber, updateUrl, scale, setCustomScale, zoomLabelRef,
  fitMode, applyFitMode, shortcuts, showShortcut, shortcutTitle, regionMode, viewMode, setViewMode, setRegionMode,
  changeViewMode, requestPdfTask, requestPdfDeadline, requestAnnotation, commentsVisible, closeCommentPanel,
  showCommentList, commentThreads, setRotation, showThumbnails, setShowThumbnails, setNavigatorTab, runPdfShortcut,
  setShortcutsOpen,
}: {
  t: ReturnType<typeof useTranslations<"wiki">>;
  tTasks: ReturnType<typeof useTranslations<"tasks">>;
  tDeadlines: ReturnType<typeof useTranslations<"deadlines">>;
  sourceTitle: string;
  fileName: string;
  pages: ReaderPage[];
  pageNumber: number;
  updateUrl: (nextPage: number) => void;
  scale: number;
  setCustomScale: (nextScale: number) => void;
  zoomLabelRef: RefObject<HTMLButtonElement | null>;
  fitMode: FitMode;
  applyFitMode: (mode: FitMode) => Promise<void>;
  shortcuts: PdfShortcutBindings;
  showShortcut: (binding: string) => string;
  shortcutTitle: (action: PdfShortcutAction, label: string) => string;
  regionMode: boolean;
  viewMode: PdfViewMode;
  setViewMode: Dispatch<SetStateAction<PdfViewMode>>;
  setRegionMode: Dispatch<SetStateAction<boolean>>;
  changeViewMode: (nextMode: PdfViewMode) => void;
  requestPdfTask: () => void;
  requestPdfDeadline: () => void;
  requestAnnotation: (annotation: PendingAnnotation) => void;
  commentsVisible: boolean;
  closeCommentPanel: () => void;
  showCommentList: () => void;
  commentThreads: ReaderAnnotation[];
  setRotation: Dispatch<SetStateAction<number>>;
  showThumbnails: boolean;
  setShowThumbnails: Dispatch<SetStateAction<boolean>>;
  setNavigatorTab: Dispatch<SetStateAction<NavigatorTab>>;
  runPdfShortcut: (action: PdfShortcutAction) => void;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return <header data-testid="pdf-toolbar" className="flex h-12 shrink-0 flex-nowrap items-center gap-1 overflow-hidden border-b bg-background px-2 shadow-sm"><Link aria-label={t("backToWikiStart")} title={t("backToWikiStart")} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} href="/wiki"><ArrowLeft className="size-4" /></Link><div className="hidden min-w-0 max-w-48 flex-1 lg:block"><p className="truncate text-xs font-medium">{sourceTitle}</p><p className="truncate text-[10px] text-muted-foreground">{fileName}</p></div>
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
  </header>;
}
