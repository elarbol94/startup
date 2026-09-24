"use client";
import { SourcePassageButton } from "./source-passage-button";

import { handleEditorLinkClick } from "../lib/editor-links";
import { clientUUID } from "@/lib/client-uuid";

import { CommentHighlights } from "./comment-highlight-extension";

import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import Collaboration from "@tiptap/extension-collaboration";
import { CollaborationContext, CollaborationStatus, useCollaboration, useCollaborationContext } from "../collaboration/ui";
import { documentJSON, patchMap, LOCAL } from "../collaboration/codec";
import { collaborationCursors } from "../collaboration/cursors";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { Bold, BookMarked, CalendarClock, Check, ClipboardCheck, CloudOff, Code, FileText, Heading3, Highlighter, ImagePlus, Italic, Keyboard, Layers3, Link2, List, ListOrdered, ListTree, ListTodo, MessageSquareText, Minus, MoreHorizontal, Paperclip, Pilcrow, Quote, Redo2, RotateCcw, ScissorsLineDashed, Search, Settings2, Strikethrough, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import { useDocumentWorkspace } from "./document-workspace";
import { WorkspacePanel } from "./workspace-panel";
import { addComment } from "../research-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut } from "@/components/ui/dropdown-menu";
import { CommentRail, type CommentRailHandle } from "./comment-rail";
import { CommentAnchorOverlay } from "./comment-anchor-overlay";
import { DocumentPresentationLinks } from "./document-presentation-links";
import { useEditorNavigation } from "./use-editor-navigation";
import { HeadingIdentity } from "./heading-identity";

import { CollapsibleHeading, HeadingListItem } from "./collapsible-heading";
import { MarkdownDocumentExtensions, MarkdownShortcutMarks } from "./markdown-shortcut-extension";
import { flushSync } from "react-dom";
import { EditorCommandSearch, type EditorSearchCommand } from "./editor-command-search";
import { createDoubleShiftDetector, recentEditorCommands, rememberEditorCommand } from "../lib/command-search";
import { WikiShortcutsDialog } from "./wiki-shortcuts-dialog";
import { EditorLinkPopover, EditorOutlineSheet, EditorSearchPanel, type OutlineItem } from "./editor-tools";
import type { CommentAnchor } from "../lib/comment-anchors";
import { EditorSearchExtension } from "../lib/editor-search";
import { createSpellcheckExtension, type ProofingLanguage } from "../lib/spellcheck";
import { WikiProofingMenu, WikiProofingSuggestions, type OpenProofingIssue } from "./wiki-proofing";
import { sanitizePastedHtml } from "../lib/paste-html";
import { calculateWritingStats, type WritingStats } from "../lib/editor-writing";
import { readEditorStorage, removeEditorStorage, writeEditorStorage } from "../lib/editor-draft";
import { exportSavedDocument } from "../lib/editor-export";
import { MermaidDiagram, MERMAID_PLACEHOLDER } from "./mermaid-extension";
import { SuggestionDelete, SuggestionInsert, SuggestionMode } from "./suggestion-extension";
import { acceptSuggestions, countSuggestions, rejectSuggestions } from "../lib/suggestions";
import { DocumentExtensions, setDocumentNumberingConfig } from "./document-extension";
import { DocumentLayoutPanel } from "./document-layout-panel";
import { WikiTypographyDialog } from "./wiki-typography-dialog";
import { collectDocumentPreflightIssues, localizeDocumentSettings, normalizeDocumentSettings, parseDocumentSettings, serializeDocumentSettings, type DocumentPreflightIssue, type DocumentSettingsV1 } from "../lib/document-settings";
import { hasFigureList, isFigure, stripFigureNumber } from "../lib/figure";
import { CommentableImage, FigureIdentity, figureRepairs } from "./figure-extension";
import { FigureUploads } from "./figure-upload";
import { FigureList, FigureListEntry, FigureListSync } from "./figure-list";
import { FigureLibraryContext, useFigureLibrary } from "./figure-library";
import { FigureTextDrop } from "./figure-drop";
import { FigurePanel } from "./figure-panel";
import { FigurePicker } from "./figure-picker";
import { FigureReferencePicker } from "./figure-reference-picker";
import { normalizeWikiTypography } from "../lib/wiki-typography";
import { normalizeWikiShortcut, WIKI_SHORTCUT_ACTIONS, type WikiShortcutAction } from "../lib/wiki-shortcuts";
import { displayShortcut } from "../lib/shortcut-display";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import { formatBibliography } from "../lib/citations";
import { SvgGraphicsPanel } from "./svg-graphics-panel";
import type { CitationTarget, FigureCaption, SourceRef, TableCaption, WikiEditorProps } from "./wiki-editor/wiki-editor-types";
import { Citation, CommentMark, DeadlineReference, Highlight, PdfEvidence, TaskReference } from "./wiki-editor/wiki-editor-extensions";
import { addThreadMark, backfillCommentNodeIds, isInlineImageFile, normalizeCitationLabels, normalizeInlineImageFile } from "./wiki-editor/wiki-editor-document-ops";
import { LEGACY_TIPTAP_SHORTCUTS, WIKI_SHORTCUTS_KEY, loadEditorPreferences, loadWikiShortcutBindings } from "./wiki-editor/wiki-editor-preferences";
import { DOCUMENT_ZOOM_KEY, loadDocumentZoom } from "./wiki-editor/document-zoom";
import { documentCanvasLayout } from "./wiki-editor/document-canvas-layout";
import { ToolbarButton, ToolbarGroup, ToolbarMenu } from "./wiki-editor/wiki-editor-toolbar-controls";
import { ImageRegionSelector } from "./wiki-editor/image-region-selector";
import { CitationPicker, EvidencePicker, PageLinkPicker } from "./wiki-editor/wiki-editor-pickers";
import { WikiEditorBubbleMenus } from "./wiki-editor/wiki-editor-bubble-menus";
import { DocumentBackMatter, DocumentFrontMatter } from "./wiki-editor/wiki-document-pages";
import { buildSlashCommands, buildWikiEditorCommands, runWikiEditorAction } from "./wiki-editor/wiki-editor-commands";
import { createFigureHandlers } from "./wiki-editor/wiki-editor-figure-handlers";
import { createWikiProofingHandlers } from "./wiki-editor/wiki-editor-proofing";
import { useWikiProofingChecks } from "./wiki-editor/use-wiki-proofing-checks";
import { useDocumentPagination } from "./wiki-editor/use-document-pagination";
import { useDocumentZoomGestures } from "./wiki-editor/use-document-zoom-gestures";
import { useContextReferenceSync } from "./wiki-editor/use-context-reference-sync";
import { useEvidenceInsertion } from "./wiki-editor/use-evidence-insertion";
import { useReferenceFocus } from "./wiki-editor/use-reference-focus";
import { useHighlightAuthorColors } from "./wiki-editor/use-highlight-author-colors";
import { useWikiEditorHandle } from "./wiki-editor/use-wiki-editor-handle";

export type { WikiEditorHandle } from "./wiki-editor/wiki-editor-types";

// Typing bursts arrive faster than a frame. Both the page measurement and the
// content snapshot wait out the burst instead of running per keystroke.
const CONTENT_SYNC_DELAY = 200;

export function WikiEditor(props: WikiEditorProps) {
  const collaboration = useCollaboration("page", props.pageId);
  const layout = collaboration.doc.getMap("layout").toJSON();
  return <CollaborationContext.Provider value={collaboration}>
    <CollaborationStatus provider={collaboration} />
    {collaboration.ready && <CollaborativeWikiEditor {...props} initialContent={JSON.stringify(documentJSON(collaboration.doc))} initialDocumentMode={layout.documentMode} initialDocumentSettings={JSON.stringify(layout.settings)} />}
  </CollaborationContext.Provider>;
}

function CollaborativeWikiEditor({
  details,
  pageId,
  pageTitle,
  pageSlug,
  pageVersion,
  pageContentVersion,
  initialContent,
  initialProofingLanguage,
  initialProofingPrefs,
  initialDocumentMode,
  initialDocumentSettings,
  documentTemplates,
  allPages,
  sources,
  users,
  citationLocale,
  citationStyle,
  insertEvidenceId,
  comments,
  contextTasks,
  contextDeadlines,
  proposalData,
  focusTaskId,
  focusDeadlineId,
  currentUserId,
  pageActions,
  actionsRef,
  initialTypography,
  editableTypography,
  typographyTemplates,
  isPrimaryAuthor,
}: WikiEditorProps) {
  const collaboration = useCollaborationContext()!;
  const t = useTranslations("wiki"); const tTasks = useTranslations("tasks"); const tDeadlines = useTranslations("deadlines"); const format = useFormatter(); const router = useRouter(); const searchParams = useSearchParams(); const externalSearchQuery = searchParams.get("search")?.trim() ?? ""; const { openTaskCreator } = useTaskCreator(); const { openDeadlineCreator } = useDeadlineCreator(); const [saveState, setSaveState] = useState<"idle" | "unsaved" | "saving" | "saved" | "offline" | "error" | "conflict">("idle");
  const { panel, setPanel, setSaveState: reportSaveState } = useDocumentWorkspace();
  useEffect(() => { reportSaveState(saveState); }, [saveState, reportSaveState]);
  function togglePanel(name: "comments" | "outline" | "layout", value: SetStateAction<boolean>) {
    setPanel((current) => (typeof value === "function" ? value(current === name) : value) ? name : current === name ? null : current);
  }
  const outlineOpen = panel === "outline";
  const commentsVisible = panel === "comments";
  const setOutlineOpen = (value: SetStateAction<boolean>) => togglePanel("outline", value);
  const setCommentsVisible = (value: SetStateAction<boolean>) => togglePanel("comments", value);
  const setDocumentLayoutVisible = (value: SetStateAction<boolean>) => togglePanel("layout", value);
  const localizedInitialDocumentSettings = localizeDocumentSettings(
    parseDocumentSettings(initialDocumentSettings),
    citationLocale,
  );
  const [conflictRevision] = useState<string | null>(null); const [activeThreadId, setActiveThreadId] = useState<string | null>(null); const [commentFocusRequest, setCommentFocusRequest] = useState(0); const [inlineImagePickerOpen, setInlineImagePickerOpen] = useState(false); const [commentOpen, setCommentOpen] = useState(false); const [commentBody, setCommentBody] = useState(""); const [pendingAnchor, setPendingAnchor] = useState<CommentAnchor | null>(null); const [regionTarget, setRegionTarget] = useState<{ nodeId: string; label: string } | null>(null); const [imageError, setImageError] = useState(""); const [imageUploading, setImageUploading] = useState(false); const [assigneeId, setAssigneeId] = useState("none");
  const figureLibrary = useFigureLibrary(pageId, t("figures.staleExport"));
  const [figureReferenceOpen, setFigureReferenceOpen] = useState(false);
  const [figureTargetId, setFigureTargetId] = useState("");
  const [figureSourceMode, setFigureSourceMode] = useState(false);
  const [preferredSvgId, setPreferredSvgId] = useState("");
  const uploadControllers = useRef(new Set<AbortController>());
  useEffect(() => () => { uploadControllers.current.forEach((controller) => controller.abort()); }, []);
  const commentThreads = comments;
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const commentSubmittingRef = useRef(false);
  const [typographyFocus, setTypographyFocus] = useState<"bodySizePt" | "lineHeight" | undefined>();
  const [marginFocusRequest, setMarginFocusRequest] = useState(0);
  const [commandSearchOpen, setCommandSearchOpen] = useState(false);
  const [commandSearchCommands, setCommandSearchCommands] = useState<EditorSearchCommand[]>([]);
  const [pageLinkOpen, setPageLinkOpen] = useState(false); const [citationOpen, setCitationOpen] = useState(false); const [evidenceOpen, setEvidenceOpen] = useState(false); const [shortcutsOpen, setShortcutsOpen] = useState(false); const [linkEditorRequest, setLinkEditorRequest] = useState(0);
  const [graphicsOpen, setGraphicsOpen] = useState(false);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const searchOpen = manualSearchOpen || Boolean(externalSearchQuery);
  function changeSearchOpen(open: boolean) {
    setManualSearchOpen(open);
    if (!open && externalSearchQuery) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("search");
      router.replace(`${window.location.pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  }
  const [outline, setOutline] = useState<OutlineItem[]>([]); const [activeHeadingPosition, setActiveHeadingPosition] = useState<number | null>(null);
  const [writingStats, setWritingStats] = useState<WritingStats>({ words: 0, characters: 0, selectedWords: 0, readingMinutes: 0 });
  // TipTap v3 no longer re-renders per transaction, so the toolbar needs an
  // explicit nudge to show the marks under the caret. It stays on the keystroke
  // path because it is cheap; the document-wide derived state does not.
  const [, refreshToolbarState] = useReducer((value: number) => value + 1, 0);
  const [documentMode, setDocumentMode] = useState(initialDocumentMode);
  const [documentSettings, setDocumentSettings] = useState<DocumentSettingsV1>(() => localizedInitialDocumentSettings);
  const [documentIssues, setDocumentIssues] = useState<DocumentPreflightIssue[]>([]);
  const [documentPageCount, setDocumentPageCount] = useState(1);
  const [documentZoom, setDocumentZoom] = useState(loadDocumentZoom);
  const appliedZoom = useRef(documentZoom);
  const zoomAnchor = useRef<{ clientX: number; clientY: number; contentX: number; contentY: number } | null>(null);
  const captureZoomAnchorRef = useRef<(clientX: number, clientY: number) => void>(() => {});
  const [figureCaptions, setFigureCaptions] = useState<FigureCaption[]>([]);
  const [tableCaptions, setTableCaptions] = useState<TableCaption[]>([]);
  const [citedSourceIds, setCitedSourceIds] = useState<string[]>([]);
  const [citationTargets, setCitationTargets] = useState<CitationTarget[]>([]);
  const [typography, setTypography] = useState(() => normalizeWikiTypography(initialTypography));
  const [personalTypography, setPersonalTypography] = useState(() => normalizeWikiTypography(editableTypography));
  const [personalTypographyTemplates, setPersonalTypographyTemplates] = useState(typographyTemplates);
  const [typographyOpen, setTypographyOpen] = useState(false);

  const [spellcheckIssue, setSpellcheckIssue] = useState<OpenProofingIssue | null>(null);
  const [proofingLanguage, setProofingLanguage] = useState<ProofingLanguage>(initialProofingLanguage);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionCounts, setSuggestionCounts] = useState({ inserted: 0, deleted: 0 });
  const [proofingStatus, setProofingStatus] = useState<"ready" | "checking" | "error">("checking");
  const [proofingSaving, setProofingSaving] = useState(false);
  const proofingRetry = useRef<() => void>(() => {});
  const [proofingCount, setProofingCount] = useState(0);
  const [proofingDictionarySaving, setProofingDictionarySaving] = useState(false);
  const [proofingDictionary, setProofingDictionary] = useState<string[]>([]);
  const [proofingDictionaryLoaded, setProofingDictionaryLoaded] = useState(false);
  const [proofingPicky, setProofingPicky] = useState(initialProofingPrefs.picky);
  const ignoredProofingIssues = useRef(new Set<string>(initialProofingPrefs.ignoredIssueKeys));
  const disabledProofingRuleIds = useRef(new Set<string>(initialProofingPrefs.disabledRuleIds));
  const [wikiShortcuts, setWikiShortcuts] = useState(loadWikiShortcutBindings);
  const [initialPreferences] = useState(loadEditorPreferences);
  const [statusVisible, setStatusVisible] = useState(initialPreferences.statusVisible); const [minimalToolbar, setMinimalToolbar] = useState(initialPreferences.minimalToolbar); const [typewriterMode, setTypewriterMode] = useState(initialPreferences.typewriterMode); const typewriterModeRef = useRef(initialPreferences.typewriterMode);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const maxSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const contentSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const contentSyncEditor = useRef<Editor | null>(null); const liveEditor = useRef<Editor | null>(null); const contentSyncDirty = useRef(false); const flushContentSyncRef = useRef<() => void>(() => {}); const contentVersion = useRef(pageContentVersion); const lastServerContent = useRef(initialContent); const documentModeRef = useRef(initialDocumentMode); const documentSettingsRef = useRef(localizedInitialDocumentSettings); const pendingSave = useRef<string | null>(null); const persistContentRef = useRef<(json: string) => Promise<void>>(async () => {}); const conflictBlocked = useRef(false); const editorSessionId = useRef(clientUUID()); const selection = useRef<{ from: number; to: number } | null>(null); const toolbarSelection = useRef<{ from: number; to: number } | null>(null); const imageInputRef = useRef<HTMLInputElement>(null); const editorRootRef = useRef<HTMLDivElement>(null); const commentRailRef = useRef<CommentRailHandle>(null);
  const [leaseState, setLeaseState] = useState<"checking" | "editable" | "locked">("checking");
  const leaseStateRef = useRef<"checking" | "editable" | "locked">("checking");
  const [recoveryAvailable, setRecoveryAvailable] = useState(true);
  const discardingDraft = useRef(false);
  const flushSaveRef = useRef<() => Promise<boolean>>(async () => false);
  const navigating = useRef(false);
  const navigationText = useTranslations("documentPresentationLinks");
  const leaveEditor = useCallback((href: string, newTab: boolean, proceed?: () => void) => {
    if (navigating.current) return;
    const tab = newTab ? window.open("about:blank", "_blank") : null;
    if (newTab && !tab) { toast.error(t("presentations.popupBlocked")); return; }
    navigating.current = true;
    void flushSaveRef.current().then(saved => {
      if (!saved) { tab?.close(); toast.error(navigationText("saveFailed")); return; }
      if (tab) tab.location.href = href;
      else if (proceed) proceed();
      else router.push(href);
    }).catch(() => { tab?.close(); toast.error(navigationText("saveFailed")); })
      .finally(() => { navigating.current = false; });
  }, [router, t, navigationText]);
  useEditorNavigation(leaveEditor, ".ProseMirror");
  const storageKey = `wiki-draft:${currentUserId}:${pageId}`; const preferencesKey = `wiki-editor-preferences`;

  function currentSnapshot() {
    return {
      contentJson: liveEditor.current && !liveEditor.current.isDestroyed ? JSON.stringify(liveEditor.current.getJSON()) : pendingSave.current ?? lastServerContent.current,
      documentMode: documentModeRef.current,
      documentSettingsJson: serializeDocumentSettings(documentSettingsRef.current),
    };
  }

  const writeDraft = useCallback((value: string) => {
    setRecoveryAvailable(writeEditorStorage(storageKey, value));
  }, [storageKey]);

  function updateDerivedState(currentEditor: Editor) {
    setSuggestionCounts(countSuggestions(currentEditor.getJSON() as never));
    const items: OutlineItem[] = [];
    const captions: FigureCaption[] = [];
    const tables: TableCaption[] = [];
    const citations = new Set<string>();
    const targets = new Map<string, CitationTarget>();
    currentEditor.state.doc.descendants((node, position) => {
      if (node.type.name === "heading") items.push({ level: Number(node.attrs.level), text: node.textContent, position, id: String(node.attrs.id ?? `heading-${position}`) });
      if (isFigure(node.type.name) && node.attrs.numbered !== false && node.attrs.includeInFigureIndex !== false) {
        captions.push({ nodeId: String(node.attrs.nodeId ?? `figure-${position}`), caption: stripFigureNumber(String(node.attrs.caption || "")) });
      }
      if (node.type.name === "markdownTable" && node.attrs.includeInTableIndex !== false && String(node.attrs.caption ?? "").trim()) {
        tables.push({ tableId: String(node.attrs.tableId ?? ("table-" + position)), caption: stripFigureNumber(String(node.attrs.caption || "")) });
      }
      if (node.type.name === "citation" && Array.isArray(node.attrs.items)) {
        for (const item of node.attrs.items as Array<{ sourceId?: unknown; documentId?: unknown; annotationId?: unknown; locator?: unknown }>) {
          if (typeof item.sourceId === "string") {
            citations.add(item.sourceId);
            if (!targets.has(item.sourceId)) {
              targets.set(item.sourceId, {
                sourceId: item.sourceId,
                ...(typeof item.documentId === "string" && item.documentId ? { documentId: item.documentId } : {}),
                ...(typeof item.annotationId === "string" && item.annotationId ? { annotationId: item.annotationId } : {}),
                ...(typeof item.locator === "string" && item.locator ? { locator: item.locator } : {}),
              });
            }
          }
        }
      }
    });
    setOutline(items);
    setFigureCaptions(captions);
    setTableCaptions(tables);
    setCitedSourceIds([...citations]);
    setCitationTargets([...targets.values()]);
    const cursor = currentEditor.state.selection.from;
    setActiveHeadingPosition([...items].reverse().find((item) => item.position < cursor)?.position ?? null);
    setWritingStats(calculateWritingStats(currentEditor.state.doc, currentEditor.state.selection));
    setDocumentIssues(collectDocumentPreflightIssues(currentEditor.getJSON(), documentSettingsRef.current));
  }

  // Walking the document, serializing it and re-rendering the editor shell on
  // every keystroke is what made writing feel heavy. The work now runs at most
  // once per CONTENT_SYNC_DELAY, and the timer is never pushed back, so a long
  // typing burst still snapshots regularly.
  function flushContentSync() {
    if (contentSyncTimer.current) {
      clearTimeout(contentSyncTimer.current);
      contentSyncTimer.current = null;
    }
    const currentEditor = contentSyncEditor.current;
    if (!currentEditor) return;
    contentSyncEditor.current = null;
    updateDerivedState(currentEditor);
    if (!contentSyncDirty.current) return;
    contentSyncDirty.current = false;
    const json = JSON.stringify(currentEditor.getJSON());
    pendingSave.current = json;
    writeDraft(JSON.stringify({
      contentJson: json,
      documentMode: documentModeRef.current,
      documentSettingsJson: serializeDocumentSettings(documentSettingsRef.current),
      baseContentVersion: contentVersion.current,
      editorSessionId: editorSessionId.current,
      savedAt: Date.now(),
    }));
    pendingSave.current = json;
    if (conflictBlocked.current) { setSaveState("conflict"); return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persistLatestContent, 2_000);
    if (!maxSaveTimer.current) {
      maxSaveTimer.current = setTimeout(() => {
        maxSaveTimer.current = null;
        persistLatestContent();
      }, 10_000);
    }
  }
  flushContentSyncRef.current = flushContentSync;

  // A save takes its snapshot when the timer fires, never when it was armed:
  // a request carrying text from a moment ago would drop the local journal of
  // the newer keystrokes once the server confirmed it.
  function persistLatestContent() {
    if (!pendingSave.current) return;
    const json = liveEditor.current ? JSON.stringify(liveEditor.current.getJSON()) : pendingSave.current;
    if (json) void persistContent(json);
  }

  // Remember where the pointer sits on the page so the next zoom step can put
  // that exact spot back under it. Coordinates outside the visible page (toolbar
  // and keyboard zoom, events without pointer position) fall back to the nearest
  // visible point instead of dragging the page to a corner.
  function captureZoomAnchor(clientX: number, clientY: number) {
    const surface = editorRootRef.current?.querySelector<HTMLElement>(".wiki-editor-surface");
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const left = Math.max(rect.left, 0);
    const top = Math.max(rect.top, 0);
    const anchorX = Math.min(Math.max(clientX, left), Math.max(left, Math.min(rect.right, window.innerWidth)));
    const anchorY = Math.min(Math.max(clientY, top), Math.max(top, Math.min(rect.bottom, window.innerHeight)));
    const scale = appliedZoom.current / 100;
    zoomAnchor.current = {
      clientX: anchorX,
      clientY: anchorY,
      contentX: (anchorX - rect.left) / scale,
      contentY: (anchorY - rect.top) / scale,
    };
  }
  captureZoomAnchorRef.current = captureZoomAnchor;

  function scheduleContentSync(currentEditor: Editor, changed: boolean) {
    liveEditor.current = currentEditor;
    contentSyncEditor.current = currentEditor;
    if (changed) contentSyncDirty.current = true;
    if (contentSyncTimer.current) return;
    contentSyncTimer.current = setTimeout(() => flushContentSyncRef.current(), CONTENT_SYNC_DELAY);
  }

  async function persistContent(json: string) {
    pendingSave.current = json;
    const saved = await collaboration.flush();
    if (saved) {
      pendingSave.current = null;
      removeEditorStorage(storageKey);
      lastServerContent.current = JSON.stringify(documentJSON(collaboration.doc));
      setSaveState("saved");
    } else setSaveState("error");
  }
  persistContentRef.current = (json: string) => persistContent(json);
  async function flushSave() {
    flushContentSyncRef.current();
    const saved = await collaboration.flush();
    if (saved) pendingSave.current = null;
    return saved;
  }
  flushSaveRef.current = flushSave;
  async function takeOverEditing() { await collaboration.flush(); }

  function requestWikiTask(targetEditor: Editor) {
    const { from, to } = targetEditor.state.selection;
    const quote = targetEditor.state.doc.textBetween(from, to, " ").trim();
    openTaskCreator({
      initialTitle: quote,
      origin: {
        type: "wikiPage",
        entityId: pageId,
        route: `/wiki/pages/${encodeURIComponent(pageSlug)}`,
        label: pageTitle,
        anchor: { quote, from, to },
      },
      showProjectSchedule: true,
      onCreated: () => router.refresh(),
    });
  }

  function requestWikiDeadline(targetEditor: Editor) {
    const { from, to } = targetEditor.state.selection;
    const quote = targetEditor.state.doc.textBetween(from, to, " ").trim();
    openDeadlineCreator({
      initialTitle: quote,
      origin: {
        type: "wikiPage",
        entityId: pageId,
        route: `/wiki/pages/${encodeURIComponent(pageSlug)}`,
        label: pageTitle,
        anchor: { quote, from, to },
      },
      onCreated: (deadlineId) => {
        targetEditor.chain().focus().insertContent({
          type: "deadlineReference",
          attrs: {
            deadlineId,
            title: quote || tDeadlines("title"),
            status: "open",
            assigneeName: "",
            deadlineAt: "",
          },
        }).run();
        router.refresh();
      },
    });
  }

  const slashCommands = buildSlashCommands({
    t, pageActions, setPageLinkOpen, setLinkEditorRequest, setCitationOpen, setEvidenceOpen, setCommentsVisible,
    setCommentFocusRequest, setFigureReferenceOpen, requestWikiTask, requestWikiDeadline, openInlineImagePicker, rememberToolbarSelection,
  });

  const editor = useEditor({ immediatelyRender: false, editable: false, enableInputRules: false, enablePasteRules: false, extensions: [Collaboration.configure({ document: collaboration.doc, field: "body" }), collaborationCursors(collaboration), StarterKit.configure({ undoRedo: false, dropcursor: { color: "#3b82f6", width: 3 }, bold: false, code: false, heading: false, listItem: false, italic: false, link: { openOnClick: false }, strike: false }), CollapsibleHeading.configure({ levels: [1, 2, 3] }), HeadingListItem, HeadingIdentity, ...MarkdownShortcutMarks, ...MarkdownDocumentExtensions, ...DocumentExtensions, FigureIdentity, FigureTextDrop, FigureUploads, FigureList, FigureListEntry, FigureListSync, TaskList, TaskItem.configure({ nested: true }), Citation, PdfEvidence, TaskReference, DeadlineReference, CommentableImage, MermaidDiagram, CommentMark, CommentHighlights, SuggestionInsert, SuggestionDelete, SuggestionMode, Highlight, Placeholder.configure({ placeholder: ({ node }) => node.type.name === "heading" ? t("editor.placeholder.heading") : "" }), EditorSearchExtension, createSpellcheckExtension((issue, target) => {
      const source = liveEditor.current?.state.doc.textBetween(issue.from, issue.to) ?? "";
      setSpellcheckIssue({ issue, target, source });
    })],
    editorProps: {
      handleDOMEvents: { click: handleEditorLinkClick },
      attributes: { class: "prose prose-neutral dark:prose-invert max-w-none min-h-[28rem] focus:outline-none", spellcheck: "false" },
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files ?? [])].filter(isInlineImageFile).map(normalizeInlineImageFile);
        if (files.length) {
          event.preventDefault();
          void insertFigureFiles(files, view.state.selection.from);
          return true;
        }
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        const html = clipboard.getData("text/html");
        if (html) {
          // Sanitize first, then hand off to the schema's own DOMParser: it already
          // keeps only the nodes/marks each extension's parseHTML() rule recognizes
          // and silently drops everything else, so no hand-rolled HTML->Tiptap
          // converter is needed here.
          const { html: sanitized, hadImages } = sanitizePastedHtml(html);
          // An inert document: unlike innerHTML on a live-document element, it never
          // loads images or runs handlers that slipped past the regex sanitizer.
          const container = new window.DOMParser().parseFromString(sanitized, "text/html").body;
          const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container, { preserveWhitespace: true });
          event.preventDefault();
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          if (hadImages) toast.info(t("editor.paste.imagesDropped"));
          return true;
        }
        return false;
      },
      handleDrop(view, event) {
        const files = [...(event.dataTransfer?.files ?? [])].filter(isInlineImageFile).map(normalizeInlineImageFile);
        if (!files.length) return false;
        event.preventDefault();
        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void insertFigureFiles(files, coordinates?.pos ?? view.state.selection.from);
        return true;
      },
    },
    onCreate({ editor }) {
      liveEditor.current = editor;
      backfillCommentNodeIds(editor);
      const repairs = figureRepairs(editor.state.doc);
      if (repairs.length) { const transaction = editor.state.tr; repairs.forEach(({ position, attrs }) => transaction.setNodeMarkup(position, undefined, attrs)); editor.view.dispatch(transaction); }
      if (!normalizeCitationLabels(editor, sources, citationStyle, citationLocale)) updateDerivedState(editor);
    },
    onUpdate({ editor }) {
      if (normalizeCitationLabels(editor, sources, citationStyle, citationLocale)) return;
      if (conflictBlocked.current) setSaveState("conflict");
      else setSaveState("unsaved");
      refreshToolbarState();
      scheduleContentSync(editor, true);
    },
    onTransaction({ transaction }) {
      if (transaction.docChanged && toolbarSelection.current) {
        toolbarSelection.current = { from: transaction.mapping.map(toolbarSelection.current.from, -1), to: transaction.mapping.map(toolbarSelection.current.to, 1) };
      }
    },
    onSelectionUpdate({ editor }) {
      const selection = editor.state.selection;
      if (selection instanceof NodeSelection && ["commentableImage", "pdfEvidence"].includes(selection.node.type.name)) setPanel("image");
      else setPanel((current) => current === "image" ? null : current);
      refreshToolbarState();
      scheduleContentSync(editor, false);
      if (typewriterModeRef.current) editor.view.domAtPos(editor.state.selection.from).node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
  });

  useHighlightAuthorColors({ editor, editorRootRef, users, currentUserId });

  useEffect(() => {
    const update = () => {
      const editable = collaboration.ready && !["denied", "error"].includes(collaboration.status);
      leaseStateRef.current = editable ? "editable" : "locked";
      setLeaseState(leaseStateRef.current);
      setSaveState(collaboration.status === "saved" ? "saved" : collaboration.status === "saving" ? "saving" : collaboration.status === "reconnecting" ? "offline" : "error");
    };
    update();
    return collaboration.subscribe(update);
  }, [collaboration]);
  useEffect(() => {
    const layout = collaboration.doc.getMap("layout");
    const update = () => {
      const value = layout.toJSON();
      documentModeRef.current = value.documentMode;
      documentSettingsRef.current = normalizeDocumentSettings(value.settings);
      setDocumentMode(value.documentMode);
      setDocumentSettings(documentSettingsRef.current);
    };
    layout.observeDeep(update);
    return () => layout.unobserveDeep(update);
  }, [collaboration]);
  useEffect(() => { editor?.setEditable(leaseState === "editable"); }, [editor, leaseState]);
  useEffect(() => {
    if (!editor) return;
    const repair = (event: Event) => {
      const position = (event as CustomEvent<{ position: number }>).detail.position;
      if (!editor.isEditable || typeof position !== "number") return;
      toolbarSelection.current = { from: position, to: position + 1 }; setFigureReferenceOpen(true);
    };
    editor.view.dom.addEventListener("wiki-reference-repair", repair);
    return () => editor.view.dom.removeEventListener("wiki-reference-repair", repair);
  }, [editor]);
  useEffect(() => {
    if (!editor?.isEditable || !documentSettings.figures.enabled || hasFigureList(editor.getJSON())) return;
    // Move the legacy generated appendix into the ordinary document flow once.
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "figureList", attrs: { title: documentSettings.figures.heading, pageBreakBefore: documentSettings.figures.pageBreakBefore } });
  }, [editor, leaseState, documentSettings.figures.enabled, documentSettings.figures.heading, documentSettings.figures.pageBreakBefore]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (maxSaveTimer.current) clearTimeout(maxSaveTimer.current);
    if (contentSyncTimer.current) clearTimeout(contentSyncTimer.current);
  }, [editor]);
  useWikiProofingChecks({
    editor, pageId, proofingLanguage, proofingPicky, proofingDictionary, proofingDictionaryLoaded,
    setProofingDictionary, setProofingDictionaryLoaded, setProofingCount, setSpellcheckIssue, setProofingStatus,
    ignoredProofingIssues, disabledProofingRuleIds, proofingRetry,
  });
  useDocumentPagination({ editor, documentMode, documentSettings, documentZoom, typography, editorRootRef, setDocumentPageCount });
  useEffect(() => { void pageVersion; }, [pageVersion]);
  useEffect(() => { if (commentFocusRequest > 0) commentRailRef.current?.focusGeneralComment(); }, [commentFocusRequest]);
  useEffect(() => {
    typewriterModeRef.current = typewriterMode;
    writeEditorStorage(preferencesKey, JSON.stringify({ statusVisible, minimalToolbar, typewriterMode }));
  }, [minimalToolbar, preferencesKey, statusVisible, typewriterMode]);
  useEffect(() => { writeEditorStorage(DOCUMENT_ZOOM_KEY, String(documentZoom)); }, [documentZoom]);
  const figureExportScope = figureLibrary.exportScope;
  useEffect(() => {
    if (!editor) return;
    const update = () => { const ids = new Set<string>(); editor.state.doc.descendants((node) => { if (node.attrs.assetId) ids.add(String(node.attrs.assetId)); }); figureExportScope.current = ids; };
    update(); editor.on("transaction", update);
    return () => { editor.off("transaction", update); };
  }, [editor, figureExportScope]);
  // Figure/table numbers and cross-reference labels shown live in the canvas use the
  // document's own citation language, matching the word the PDF/DOCX export picks —
  // and figure numbering is independent of whether a figure list is present.
  useEffect(() => {
    if (!editor) return;
    const german = citationLocale.toLocaleLowerCase().startsWith("de");
    setDocumentNumberingConfig(editor, {
      figureLabel: german ? "Abbildung" : "Figure",
      tableLabel: german ? "Tabelle" : "Table",
      numberFigures: true,
      numberTables: documentSettings.tables.enabled,
      missingReferenceLabel: t("figures.missingReference"),
      pageNumberStart: documentSettings.footer.pageNumberStart,
    });
  }, [citationLocale, documentSettings.figures.enabled, documentSettings.tables.enabled, documentSettings.footer.pageNumberStart, editor, t]);
  useDocumentZoomGestures({ editor, editorRootRef, documentZoom, setDocumentZoom, appliedZoom, zoomAnchor, captureZoomAnchorRef });
  useEffect(() => { writeEditorStorage(WIKI_SHORTCUTS_KEY, JSON.stringify(wikiShortcuts)); }, [wikiShortcuts]);
  useEffect(() => {
    const online = () => { if (pendingSave.current) void persistContentRef.current(pendingSave.current); };
    const offline = () => { if (pendingSave.current) setSaveState("offline"); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);
  function executeEditorAction(action: WikiShortcutAction) {
    runWikiEditorAction(action, {
      editor, t, currentUserId, documentMode, pageActions, changeSearchOpen, setOutlineOpen, prepareComment, setCommentsVisible,
      changeDocumentMode, setTypographyOpen, setShortcutsOpen, openInlineImagePicker, setPageLinkOpen, setLinkEditorRequest,
      setCitationOpen, setEvidenceOpen, prepareImageComment,
    });
  }
  const handleWikiShortcut = useEffectEvent((event: KeyboardEvent) => {
      if (!editor || event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      const activeElement = document.activeElement as HTMLElement | null;
      if (!editorRootRef.current?.contains(target) && !editorRootRef.current?.contains(activeElement)) return;
      if (target?.closest("input, textarea, select, [role=dialog], [role=menu], [data-shortcut-recorder]")) return;
      const binding = normalizeWikiShortcut(event);
      if (!binding) return;
      const action = WIKI_SHORTCUT_ACTIONS.find((candidate) => wikiShortcuts[candidate] === binding);
      if (!action && !LEGACY_TIPTAP_SHORTCUTS.has(binding)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!action) return;
      executeEditorAction(action);
  });

  useContextReferenceSync({ editor, contextTasks, contextDeadlines, format });

  useEffect(() => {
    if (!editor) return;
    // The mode is read through a closure in the plugin, so updating the option is
    // enough — no extension teardown or editor rebuild.
    editor.extensionManager.extensions
      .filter((extension) => extension.name === "wikiSuggestionMode")
      .forEach((extension) => { extension.options.enabled = suggesting; extension.options.author = currentUserId; });
  }, [currentUserId, editor, suggesting]);

  useEvidenceInsertion({ editor, insertEvidenceId, citationLocale, router, t });

  useReferenceFocus({ editor, focusTaskId, focusDeadlineId, contextTasks, tTasks, tDeadlines, editorRootRef });
  useEffect(() => {
    if (!editor) return;
    const shortcut = (event: KeyboardEvent) => handleWikiShortcut(event);
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [editor]);
  const openCommandSearch = useEffectEvent(() => {
    if (!editor || commandSearchOpen) return;
    rememberToolbarSelection();
    setCommandSearchCommands(buildEditorCommands());
    setCommandSearchOpen(true);
  });
  useEffect(() => {
    if (!editor) return;
    const detector = createDoubleShiftDetector();
    const handle = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.defaultPrevented || !(target instanceof HTMLElement) || !editorRootRef.current?.contains(target) || target.closest("input, textarea, select, [role=dialog], [role=menu], [data-shortcut-recorder]") || document.querySelector('[aria-modal="true"]')) { detector.reset(); return; }
      if (detector.handle(event, performance.now())) { event.preventDefault(); openCommandSearch(); }
    };
    window.addEventListener("keydown", handle, true);
    window.addEventListener("keyup", handle, true);
    const interruptions = ["blur", "pointerdown", "focusin", "compositionstart", "visibilitychange"] as const;
    for (const type of interruptions) window.addEventListener(type, detector.reset, true);
    return () => {
      window.removeEventListener("keydown", handle, true);
      window.removeEventListener("keyup", handle, true);
      for (const type of interruptions) window.removeEventListener(type, detector.reset, true);
    };
  }, [editor]);
  const handleSvgAssetReady = useCallback((attachmentId: string, contentUrl: string) => {
    if (!editor) return;
    const transaction = editor.state.tr;
    let changed = false;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== "commentableImage" || node.attrs.attachmentId !== attachmentId || node.attrs.src === contentUrl) return;
      transaction.setNodeMarkup(position, undefined, { ...node.attrs, src: contentUrl });
      changed = true;
    });
    if (changed) editor.view.dispatch(transaction);
  }, [editor]);
  useWikiEditorHandle({ actionsRef, editor, flushSaveRef });
  if (!editor) return <div className="min-h-[28rem]" />;
  const activeEditor = editor;
  function rememberToolbarSelection() {
    const { from, to } = activeEditor.state.selection;
    toolbarSelection.current = { from, to };
  }
  function toolbarChain() {
    const saved = toolbarSelection.current;
    const chain = activeEditor.chain();
    if (saved) {
      const end = activeEditor.state.doc.content.size;
      chain.setTextSelection({
        from: Math.min(saved.from, end),
        to: Math.min(saved.to, end),
      });
    }
    return chain.focus();
  }
  function scheduleDocumentSave() {
    const json = JSON.stringify(activeEditor.getJSON());
    pendingSave.current = json;
    writeDraft(JSON.stringify({
      contentJson: json,
      documentMode: documentModeRef.current,
      documentSettingsJson: serializeDocumentSettings(documentSettingsRef.current),
      baseContentVersion: contentVersion.current,
      editorSessionId: editorSessionId.current,
      savedAt: Date.now(),
    }));
    setSaveState(conflictBlocked.current ? "conflict" : "unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!conflictBlocked.current) saveTimer.current = setTimeout(persistLatestContent, 2_000);
    if (!maxSaveTimer.current) maxSaveTimer.current = setTimeout(() => {
      maxSaveTimer.current = null;
      persistLatestContent();
    }, 10_000);
  }
  function openInlineImagePicker() {
    rememberToolbarSelection(); setFigureTargetId(""); setFigureSourceMode(false); setInlineImagePickerOpen(true);
  }
  function changeDocumentSettings(settings: DocumentSettingsV1) {
    if (!activeEditor.isEditable) return;
    collaboration.doc.transact(() => patchMap(collaboration.doc.getMap("layout"), { settings: documentSettingsRef.current }, { settings }), LOCAL);
    documentSettingsRef.current = settings;
    setDocumentSettings(settings);
    setDocumentIssues(collectDocumentPreflightIssues(activeEditor.getJSON(), settings));
    scheduleDocumentSave();
  }
  function changeDocumentMode(enabled: boolean) {
    if (!activeEditor.isEditable) return;
    collaboration.doc.transact(() => collaboration.doc.getMap("layout").set("documentMode", enabled), LOCAL);
    documentModeRef.current = enabled;
    setDocumentMode(enabled);
    if (!enabled && panel === "layout") setPanel(null);
    scheduleDocumentSave();
  }
  function resolveSuggestions(accept: boolean) {
    if (!editor) return;
    const resolved = (accept ? acceptSuggestions : rejectSuggestions)(editor.getJSON() as never);
    editor.commands.setContent(resolved as never, { emitUpdate: true });
    setSuggestionCounts({ inserted: 0, deleted: 0 });
  }

  const imageSelection = activeEditor.state.selection;
  const panelImage = imageSelection instanceof NodeSelection && ["commentableImage", "pdfEvidence"].includes(imageSelection.node.type.name) ? imageSelection.node : null;
  const layoutVisible = documentMode && panel === "layout";
  const figureIndexVisible = documentMode && documentSettings.figures.enabled && !hasFigureList(activeEditor.getJSON()) && figureCaptions.length > 0;
  const tableIndexVisible = documentMode && documentSettings.tables.enabled && tableCaptions.length > 0;
  const bibliography = formatBibliography(
    citedSourceIds.flatMap((sourceId) => {
      const source = sources.find((candidate) => candidate.id === sourceId);
      return source ? [source] : [];
    }),
    citationLocale,
    citationStyle,
  );
  const bibliographyVisible = documentMode && documentSettings.bibliography.enabled && bibliography.length > 0;
  function bibliographyHref(source: SourceRef) {
    const target = citationTargets.find((item) => item.sourceId === source.id);
    const documentId = target?.documentId || source.pdfDocumentId;
    if (!documentId) return `/wiki/sources/${source.id}`;
    const query = new URLSearchParams();
    if (target?.locator && /^\d+$/.test(target.locator)) query.set("page", target.locator);
    if (target?.annotationId) query.set("annotation", target.annotationId);
    const suffix = query.size ? `?${query.toString()}` : "";
    return `/wiki/sources/${source.id}/read/${documentId}${suffix}`;
  }
  const { coverPageCount, visibleDocumentPages, pageStackPosition, resolveDocumentText, documentCanvasStyle, editorTypographyStyle } = documentCanvasLayout({
    documentSettings, documentPageCount, bibliographyVisible, figureIndexVisible, typography, documentZoom, pageTitle,
  });
  function openCommentComposer(anchor: CommentAnchor) {
    setPendingAnchor(anchor);
    requestAnimationFrame(() => setCommentOpen(true));
  }
  function prepareComment() {
    const { from, to, empty } = activeEditor.state.selection;
    if (empty) return;
    selection.current = { from, to };
    openCommentComposer({ type: "text", quote: activeEditor.state.doc.textBetween(from, to, " ") });
  }
  function selectedImage() {
    const current = activeEditor.state.selection;
    if (!(current instanceof NodeSelection) || !["commentableImage", "pdfEvidence"].includes(current.node.type.name)) return null;
    return {
      nodeId: current.node.attrs.nodeId as string,
      label: (current.node.attrs.caption || current.node.attrs.alt || current.node.attrs.label || current.node.attrs.quote || current.node.attrs.sourceTitle || t("image")) as string,
    };
  }
  function prepareImageComment(mode: "whole" | "region") {
    const image = selectedImage();
    if (!image) return;
    if (mode === "region") setRegionTarget(image);
    else openCommentComposer({ type: "image", ...image, mode: "whole" });
  }
  const figureHandlers = createFigureHandlers({
    activeEditor, t, figureLibrary, uploadControllers, conflictBlocked, toolbarSelection, figureTargetId, documentSettings,
    setImageUploading, setImageError, setInlineImagePickerOpen, setPreferredSvgId, setGraphicsOpen, toolbarChain, changeDocumentSettings,
  });
  const { insertInlineImage, insertFigureAsset, editFigureArtwork, insertFigureList, insertExistingImage } = figureHandlers;
  // A hoisted declaration, because the paste/drop handlers passed to useEditor refer to it.
  function insertFigureFiles(files: File[], position: number, targetId = "") {
    return figureHandlers.insertFigureFiles(files, position, targetId);
  }
  async function submitComment() {
    if (!pendingAnchor || !commentBody.trim() || commentSubmittingRef.current) return;
    commentSubmittingRef.current = true; setCommentSubmitting(true);
    try {
      const result = await addComment({ pageId, body: commentBody, anchor: pendingAnchor, assigneeId: assigneeId === "none" ? null : assigneeId });
      if (pendingAnchor.type === "text" && selection.current) addThreadMark(activeEditor, selection.current, result.threadId);
      setActiveThreadId(result.threadId);
      setCommentsVisible(true);
      commentRailRef.current?.openMobile();
      setCommentOpen(false);
      setCommentBody("");
      setPendingAnchor(null);
      setAssigneeId("none");
      selection.current = null;
      router.refresh();
    } catch { toast.error(t("commentRail.operationFailed")); }
    finally { commentSubmittingRef.current = false; setCommentSubmitting(false); }
  }
  function discardDraftAndReload() {
    discardingDraft.current = true;
    pendingSave.current = null;
    contentSyncDirty.current = false;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    removeEditorStorage(storageKey);
    location.reload();
  }
  async function restoreConflictDraft() {
    if (!conflictRevision) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Include edits made after the conflict was reported. The version check
    // still protects changes another editor made since that response.
    conflictBlocked.current = false;
    await persistContent(currentSnapshot().contentJson);
  }

  const {
    changeProofingLanguage, toggleProofingPicky, ignoreCurrentProofingIssue, disableCurrentProofingRule,
    addCurrentWordToDictionary, replaceAllCurrentProofingIssue, replaceCurrentProofingIssue, nextProofingIssue,
  } = createWikiProofingHandlers({
    activeEditor, pageId, t, spellcheckIssue, setSpellcheckIssue, proofingLanguage, setProofingLanguage,
    proofingSaving, setProofingSaving, proofingPicky, setProofingPicky, setProofingDictionary, setProofingDictionaryLoaded,
    proofingDictionarySaving, setProofingDictionarySaving, ignoredProofingIssues, disabledProofingRuleIds,
  });

  const shortcutLabel = (action: WikiShortcutAction) => displayShortcut(wikiShortcuts[action], { ctrl: t("shortcuts.keys.ctrl"), delete: t("shortcuts.keys.delete") });
  const proofingMenuProps = { language: proofingLanguage, status: proofingStatus, count: proofingCount, picky: proofingPicky,
    saving: proofingSaving || proofingDictionarySaving, onLanguage: (language: ProofingLanguage) => void changeProofingLanguage(language),
    onPicky: () => void toggleProofingPicky(), onRetry: () => proofingRetry.current(), onNext: nextProofingIssue };
  const unresolvedCommentCount = commentThreads.filter((thread) => !thread.resolvedAt).length;
  const currentDocumentModeLabel = t(documentMode ? "document.documentMode" : "document.noteMode");
  const nextDocumentModeLabel = t(documentMode ? "document.noteMode" : "document.documentMode");

  function buildEditorCommands(): EditorSearchCommand[] {
    return buildWikiEditorCommands({
      t, activeEditor, slashCommands, shortcutLabel, executeEditorAction, insertFigureList, documentMode, changeDocumentMode, setPanel,
      setGraphicsOpen, suggesting, setSuggesting, suggestionCounts, resolveSuggestions, proofingPicky, toggleProofingPicky, nextProofingIssue,
      proofingRetry, changeProofingLanguage, pageId, flushSave, setTypographyFocus, setTypographyOpen, setMarginFocusRequest, currentUserId,
    });
  }
  function closeCommandSearch() {
    flushSync(() => setCommandSearchOpen(false));
    activeEditor.view.focus();
  }

  return <FigureLibraryContext.Provider value={{ ...figureLibrary, editArtwork: (nodeId) => void editFigureArtwork(nodeId), replace: (nodeId) => { rememberToolbarSelection(); setFigureSourceMode(false); setFigureTargetId(nodeId); setInlineImagePickerOpen(true); }, editSource: (nodeId) => { rememberToolbarSelection(); setFigureSourceMode(true); setFigureTargetId(nodeId); setInlineImagePickerOpen(true); } }}><div className="relative flex flex-col gap-3"><DocumentPresentationLinks editor={activeEditor} pageId={pageId} slug={pageSlug} flush={() => flushSaveRef.current()} /><div data-testid="document-toolbar" className="sticky top-0 z-40 flex flex-wrap items-center gap-1 border-b border-border/60 bg-background/95 py-2 backdrop-blur">
    <ToolbarButton title={t("commandSearch.title")} shortcut="⇧ ⇧" onClick={() => { rememberToolbarSelection(); setCommandSearchCommands(buildEditorCommands()); setCommandSearchOpen(true); }}><Search className="size-4" /></ToolbarButton>
    <ToolbarGroup label={t("editor.toolbar.groups.history")}>
      <ToolbarButton title={t("editor.toolbar.undo")} shortcut={shortcutLabel("undo")} onClick={() => activeEditor.chain().focus().undo().run()}><Undo2 className="size-4" /></ToolbarButton>
      <ToolbarButton title={t("editor.toolbar.redo")} shortcut={shortcutLabel("redo")} onClick={() => activeEditor.chain().focus().redo().run()}><Redo2 className="size-4" /></ToolbarButton>
    </ToolbarGroup>
    <ToolbarGroup label={t("editor.toolbar.groups.writing")}>
      <ToolbarMenu label={t("workspace.textStyle")} icon={<Pilcrow className="size-4" />} onPointerDown={rememberToolbarSelection}>
        <DropdownMenuItem onClick={() => toolbarChain().setParagraph().run()}><Pilcrow />{t("slash.commands.paragraph.label")}</DropdownMenuItem>
        {([1, 2, 3] as const).map((level) => <DropdownMenuItem key={level} onClick={() => toolbarChain().toggleHeading({ level }).run()}>{t(`editor.toolbar.heading${level}`)}<DropdownMenuShortcut>{shortcutLabel(`heading${level}`)}</DropdownMenuShortcut></DropdownMenuItem>)}
      </ToolbarMenu>
      <ToolbarButton title={t("editor.toolbar.bold")} shortcut={shortcutLabel("bold")} active={activeEditor.isActive("bold")} onClick={() => activeEditor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolbarButton>
      <ToolbarButton title={t("editor.toolbar.italic")} shortcut={shortcutLabel("italic")} active={activeEditor.isActive("italic")} onClick={() => activeEditor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolbarButton>
      {!minimalToolbar && <>
        <ToolbarButton title={t("editor.toolbar.bulletList")} shortcut={shortcutLabel("bulletList")} active={activeEditor.isActive("bulletList")} onClick={() => activeEditor.chain().focus().toggleBulletList().run()}><List className="size-4" /></ToolbarButton>
        <ToolbarButton title={t("editor.toolbar.orderedList")} shortcut={shortcutLabel("orderedList")} active={activeEditor.isActive("orderedList")} onClick={() => activeEditor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolbarButton>
      </>}
      <ToolbarMenu label={t("editor.toolbar.format")} icon={<MoreHorizontal className="size-4" />} onPointerDown={rememberToolbarSelection}>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("editor.toolbar.format")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => toolbarChain().toggleHeading({ level: 3 }).run()}><Heading3 />{t("editor.toolbar.heading3")}<DropdownMenuShortcut>{shortcutLabel("heading3")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => toolbarChain().toggleUnderline().run()}><UnderlineIcon />{t("editor.toolbar.underline")}<DropdownMenuShortcut>{shortcutLabel("underline")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => toolbarChain().toggleMark("highlight", { createdBy: currentUserId }).run()}><Highlighter />{t("editor.toolbar.highlight")}<DropdownMenuShortcut>{shortcutLabel("highlight")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => toolbarChain().toggleStrike().run()}><Strikethrough />{t("editor.toolbar.strike")}<DropdownMenuShortcut>{shortcutLabel("strike")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => toolbarChain().toggleCode().run()}><Code />{t("editor.toolbar.inlineCode")}<DropdownMenuShortcut>{shortcutLabel("inlineCode")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => toolbarChain().toggleTaskList().run()}><ListTodo />{t("editor.toolbar.taskList")}<DropdownMenuShortcut>{shortcutLabel("taskList")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => toolbarChain().toggleBlockquote().run()}><Quote />{t("editor.toolbar.blockquote")}<DropdownMenuShortcut>{shortcutLabel("blockquote")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => toolbarChain().toggleCodeBlock().run()}><Code />{t("editor.toolbar.codeBlock")}<DropdownMenuShortcut>{shortcutLabel("codeBlock")}</DropdownMenuShortcut></DropdownMenuItem>
      </DropdownMenuGroup>
      </ToolbarMenu>
    </ToolbarGroup>
    <ToolbarGroup label={t("editor.toolbar.groups.insert")}>
      <SourcePassageButton editor={activeEditor} />
      <EditorLinkPopover editor={activeEditor} pages={allPages} request={linkEditorRequest} />
      <PageLinkPicker editor={editor} pages={allPages} open={pageLinkOpen} onOpenChange={setPageLinkOpen} /><CitationPicker editor={editor} sources={sources} locale={citationLocale} pageSlug={pageSlug} open={citationOpen} onOpenChange={setCitationOpen} /><EvidencePicker editor={editor} pageId={pageId} locale={citationLocale} open={evidenceOpen} onOpenChange={setEvidenceOpen} />
      <ToolbarMenu label={t("editor.toolbar.insert")} icon={<ImagePlus className="size-4" />} onPointerDown={rememberToolbarSelection}>
      <DropdownMenuItem onClick={openInlineImagePicker}><ImagePlus />{t("figures.insert")}<DropdownMenuShortcut>{shortcutLabel("image")}</DropdownMenuShortcut></DropdownMenuItem>
      <DropdownMenuItem onClick={() => { rememberToolbarSelection(); setFigureReferenceOpen(true); }}><Link2 />{t("figures.insertReference")}</DropdownMenuItem>
      <DropdownMenuItem onClick={insertFigureList}><List />{t("figures.insertList")}</DropdownMenuItem>
      <DropdownMenuItem onClick={() => toolbarChain().setHorizontalRule().run()}><Minus />{t("slash.commands.horizontalRule.label")}<DropdownMenuShortcut>{shortcutLabel("horizontalRule")}</DropdownMenuShortcut></DropdownMenuItem>
      <DropdownMenuItem onClick={() => pageActions.addAttachment()}><Paperclip />{t("slash.commands.attachment.label")}<DropdownMenuShortcut>{shortcutLabel("attachment")}</DropdownMenuShortcut></DropdownMenuItem>
      <DropdownMenuItem onClick={() => pageActions.linkSupportingSource()}><BookMarked />{t("slash.commands.supportingSource.label")}<DropdownMenuShortcut>{shortcutLabel("supportingSource")}</DropdownMenuShortcut></DropdownMenuItem>
      </ToolbarMenu>
    </ToolbarGroup>
    <input ref={imageInputRef} data-testid="wiki-inline-image-input" hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg,.svgz" onChange={(event) => { const file = event.target.files?.[0]; if (file) void insertInlineImage(file); event.target.value = ""; }} />
    <FigurePicker sourceMode={figureSourceMode} open={inlineImagePickerOpen} onOpenChange={setInlineImagePickerOpen} selectedAssetId={figureTargetId ? (() => { let id = ""; activeEditor.state.doc.descendants((node) => { if (node.attrs.nodeId === figureTargetId) id = String(node.attrs.assetId || ""); }); return id; })() : undefined}
      onInsert={insertFigureAsset} onExisting={insertExistingImage} onUpload={(files) => void insertFigureFiles(files, toolbarSelection.current?.from ?? activeEditor.state.selection.from, figureTargetId)}
      onDiagram={() => toolbarChain().insertContent({ type: "mermaidDiagram", attrs: { code: MERMAID_PLACEHOLDER, svg: "", nodeId: crypto.randomUUID(), numbered: true } }).run()}
      onEditSvg={(preferredId) => { setPreferredSvgId(preferredId || ""); setInlineImagePickerOpen(false); setGraphicsOpen(true); }} />
    <FigureReferencePicker editor={activeEditor} open={figureReferenceOpen} onOpenChange={setFigureReferenceOpen} insert={(targetId, label) => {
      const selection = toolbarSelection.current || activeEditor.state.selection;
      const reference = { type: "crossReference", attrs: { targetId, label } };
      if (!activeEditor.state.doc.resolve(selection.from).parent.inlineContent) activeEditor.chain().focus().insertContentAt(selection.to, { type: "paragraph", content: [reference] }).run();
      else toolbarChain().insertContent(reference).run();
    }} />
    <ToolbarMenu label={t("workspace.tools")} icon={<Settings2 className="size-4" />} onPointerDown={rememberToolbarSelection}>
      <DropdownMenuItem onClick={() => setPanel("outline")}><ListTree />{t("editor.outline.title")}</DropdownMenuItem>
      <DropdownMenuItem onClick={() => setPanel("comments")}><MessageSquareText />{t("comments")}{unresolvedCommentCount > 0 && ` (${unresolvedCommentCount})`}</DropdownMenuItem>
      {documentMode && <DropdownMenuItem onClick={() => setPanel("layout")}><FileText />{t("document.panelTitle")}</DropdownMenuItem>}
      {imageSelection instanceof NodeSelection && ["commentableImage", "pdfEvidence"].includes(imageSelection.node.type.name) && <DropdownMenuItem onClick={() => setPanel("image")}><ImagePlus />{t("figures.panelTitle")}</DropdownMenuItem>}
      <DropdownMenuItem onClick={() => setPanel("details")}><Settings2 />{t("documentDetails")}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem data-testid="document-mode-toggle" onClick={() => changeDocumentMode(!documentMode)}><FileText />{currentDocumentModeLabel} → {nextDocumentModeLabel}</DropdownMenuItem>
    </ToolbarMenu>
    <WikiProofingMenu {...proofingMenuProps} compact />
    <ToolbarMenu label={t("editor.toolbar.more")} icon={<MoreHorizontal className="size-4" />}>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("editor.toolbar.groups.review")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setSuggesting((value) => !value)}><ScissorsLineDashed />{suggesting ? t("suggestions.leaveMode") : t("suggestions.enterMode")}</DropdownMenuItem>
        {(suggestionCounts.inserted > 0 || suggestionCounts.deleted > 0) && <>
          <DropdownMenuItem onClick={() => resolveSuggestions(true)}><Check />{t("suggestions.acceptAll", { count: suggestionCounts.inserted + suggestionCounts.deleted })}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => resolveSuggestions(false)}><RotateCcw />{t("suggestions.rejectAll")}</DropdownMenuItem>
        </>}
        <DropdownMenuItem onClick={() => changeSearchOpen(!searchOpen)}><Search />{t("editor.search.title")}</DropdownMenuItem>
        <DropdownMenuItem onClick={prepareComment}><MessageSquareText />{t("inlineComment")}</DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("editor.toolbar.actions")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => requestWikiTask(activeEditor)}><ClipboardCheck />{tTasks("createTask")}<DropdownMenuShortcut>{tTasks("globalShortcut")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => requestWikiDeadline(activeEditor)}><CalendarClock />{tDeadlines("createDeadline")}<DropdownMenuShortcut>{tDeadlines("globalShortcut")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => setGraphicsOpen(true)}><Layers3 />{t("graphics.title")}</DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("editor.toolbar.settings")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTypographyOpen(true)}><Settings2 />{t("editor.preferences.title")}<DropdownMenuShortcut>{shortcutLabel("typography")}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShortcutsOpen(true)}><Keyboard />{t("shortcuts.title")}<DropdownMenuShortcut>{shortcutLabel("shortcuts")}</DropdownMenuShortcut></DropdownMenuItem>
      </DropdownMenuGroup>
    </ToolbarMenu>
    {(saveState === "error" || saveState === "offline") && pendingSave.current && <Button type="button" size="xs" variant="ghost" onClick={() => void persistContent(pendingSave.current!)}>{t("editor.save.retry")}</Button>}
  </div>
  <EditorSearchPanel key={externalSearchQuery} editor={activeEditor} open={searchOpen} onOpenChange={changeSearchOpen} initialQuery={externalSearchQuery} />
  {imageUploading && <p className="text-xs text-muted-foreground">{t("uploadingImage")}</p>}
  {imageError && <p className="text-xs text-destructive">{imageError}</p>}
  {!recoveryAvailable && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t("document.recoveryUnavailable")}</p>}
  {leaseState === "locked" && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3 text-sm text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100"><CloudOff className="size-4" /><span className="flex-1">{t("editor.lease.locked")}</span><Button size="sm" onClick={() => void takeOverEditing()}>{t("editor.lease.takeover")}</Button></div>}
  {saveState === "conflict" && conflictRevision && <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"><RotateCcw className="size-4" /><span className="flex-1">{t("editConflictDescription")}</span><Button size="sm" variant="outline" onClick={discardDraftAndReload}>{t("loadCurrent")}</Button><Button size="sm" onClick={() => void restoreConflictDraft()}>{t("restoreMine")}</Button></div>}
  <div className="flex min-w-0 items-start gap-0">
    <div
      data-wiki-command-scope
      ref={editorRootRef}
      className={documentMode ? "wiki-document-workspace relative min-w-0 flex-1" : "wiki-note-workspace relative min-w-0 flex-1 overflow-x-auto px-4 py-8 md:px-10"}
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === "a") {
          event.preventDefault();
          event.stopPropagation();
          requestWikiTask(activeEditor);
        }
      }}
    >
      <WikiEditorBubbleMenus editor={activeEditor} documentMode={documentMode} currentUserId={currentUserId} setLinkEditorRequest={setLinkEditorRequest} prepareComment={prepareComment} requestWikiTask={requestWikiTask} />
      <div
        className={`wiki-editor-surface${documentMode ? " wiki-document-canvas" : ""}`}
        data-margin-guides={documentSettings.page.showMarginGuides ? "true" : "false"}
        data-numbered-headings={documentMode && documentSettings.page.numberedHeadings ? "true" : "false"}
        style={documentMode ? documentCanvasStyle : editorTypographyStyle}
      >
        <DocumentFrontMatter documentMode={documentMode} documentSettings={documentSettings} pageTitle={pageTitle} visibleDocumentPages={visibleDocumentPages} documentPageCount={documentPageCount} coverPageCount={coverPageCount} pageStackPosition={pageStackPosition} resolveDocumentText={resolveDocumentText} />
        <EditorContent editor={editor} data-testid="wiki-editor" data-document-mode={documentMode ? "true" : "false"} />
        <DocumentBackMatter documentSettings={documentSettings} bibliography={bibliography} bibliographyVisible={bibliographyVisible} bibliographyHref={bibliographyHref} figureIndexVisible={figureIndexVisible} figureCaptions={figureCaptions} tableIndexVisible={tableIndexVisible} tableCaptions={tableCaptions} />
      </div>
      {spellcheckIssue && <WikiProofingSuggestions selected={spellcheckIssue} onClose={() => setSpellcheckIssue(null)}
        onReplace={replaceCurrentProofingIssue} onReplaceAll={replaceAllCurrentProofingIssue} onIgnore={ignoreCurrentProofingIssue}
        onDictionary={() => void addCurrentWordToDictionary()} onDisableRule={disableCurrentProofingRule}
        editable={activeEditor.isEditable} busy={proofingDictionarySaving} />}
      <CommentAnchorOverlay comments={commentThreads} editor={editor} rootRef={editorRootRef} activeThreadId={activeThreadId} onActiveThreadChange={(id) => { commentRailRef.current?.activateThread(id); setPanel("comments"); }} />
    </div>
    <WorkspacePanel title={panel === "outline" ? t("editor.outline.title") : panel === "comments" ? t("comments") : panel === "layout" ? t("document.panelTitle") : panel === "image" ? t("figures.panelTitle") : t("documentDetails")} open={panel !== null} onClose={() => setPanel(null)} className="sticky top-16 max-h-[calc(100dvh-5rem)] overflow-y-auto">
    <div hidden={panel !== "details"}>{details}</div>
    <div hidden={!outlineOpen}><EditorOutlineSheet embedded editor={activeEditor} items={outline} activePosition={activeHeadingPosition} open={outlineOpen} onOpenChange={setOutlineOpen} /></div>
    <div hidden={panel !== "image"}>{panelImage && <FigurePanel key={String(panelImage.attrs.nodeId)} editor={activeEditor} node={panelImage} onComment={prepareImageComment} />}</div>
    <div hidden={!commentsVisible}><CommentRail embedded ref={commentRailRef} visible={commentsVisible} onVisibleChange={setCommentsVisible} pageId={pageId} comments={commentThreads} currentUserId={currentUserId} editor={editor} editorRootRef={editorRootRef} activeThreadId={activeThreadId} onActiveThreadChange={setActiveThreadId} /></div>
    <div hidden={!layoutVisible}>{documentMode && <DocumentLayoutPanel marginFocusRequest={marginFocusRequest} embedded
      pageId={pageId}
      editor={activeEditor}
      settings={documentSettings}
      onApplyTemplate={(settings, contentJson) => {
        if (!activeEditor.isEditable) return;
        collaboration.doc.transact(() => patchMap(collaboration.doc.getMap("layout"), { documentMode: documentModeRef.current, settings: documentSettingsRef.current }, { documentMode: true, settings }), LOCAL);
        documentModeRef.current = true;
        setDocumentMode(true);
        documentSettingsRef.current = settings;
        setDocumentSettings(settings);
        if (contentJson) activeEditor.commands.setContent(JSON.parse(contentJson));
        scheduleDocumentSave();
      }}
      onExport={(format, inline = false) => { void exportSavedDocument(pageId, format, inline, flushSave, () => toast.error(t("document.exportSaveFailed"))); }}
      onSettingsChange={changeDocumentSettings}
      templates={documentTemplates}
      issues={documentIssues}
      outline={outline}
      figureCount={figureCaptions.length}
      tableCount={tableCaptions.length}
      proposalData={proposalData}
      onOpenTypographySettings={() => setTypographyOpen(true)}
      onClose={() => setDocumentLayoutVisible(false)}
    />}</div>
    </WorkspacePanel>
  </div>
  {statusVisible && <footer data-testid="editor-writing-status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-1 pt-2 text-[11px] text-muted-foreground">
    <span>{t("editor.stats.words", { count: writingStats.words })}</span>
    <span>{t("editor.stats.characters", { count: writingStats.characters })}</span>
    {writingStats.selectedWords > 0 && <span>{t("editor.stats.selected", { count: writingStats.selectedWords })}</span>}
    <span>{t("editor.stats.reading", { count: writingStats.readingMinutes })}</span>
    <span className="ml-auto">{t("editor.stats.block", { type: activeEditor.state.selection.$from.parent.type.name })}</span>
  </footer>}
  {regionTarget && <ImageRegionSelector rootRef={editorRootRef} {...regionTarget} onCancel={() => setRegionTarget(null)} onSelect={(anchor) => { setRegionTarget(null); openCommentComposer(anchor); }} />}
  <SvgGraphicsPanel preferredId={preferredSvgId} pageId={pageId} open={graphicsOpen} onOpenChange={setGraphicsOpen} variables={{ title: pageTitle, author: documentSettings.metadata.author, ...documentSettings.variables }} documentSettings={documentSettings} typography={typography} onDocumentSettingsChange={changeDocumentSettings} onAssetReady={handleSvgAssetReady} />
  <Dialog open={commentOpen} onOpenChange={(open) => { if (commentSubmitting) return; setCommentOpen(open); if (!open) setPendingAnchor(null); }}><DialogContent className="w-[min(26rem,calc(100vw-2rem))]"><DialogHeader><DialogTitle>{pendingAnchor?.type === "image" ? t("imageComment") : t("inlineComment")}</DialogTitle></DialogHeader>{pendingAnchor?.type !== "page" && pendingAnchor && <blockquote className="border-l-2 border-amber-400 pl-3 text-sm italic text-muted-foreground">{pendingAnchor.type === "text" ? pendingAnchor.quote : pendingAnchor.label}</blockquote>}<Textarea disabled={commentSubmitting} maxLength={10000} aria-label={t("commentPlaceholder")} autoFocus value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder={t("commentPlaceholder")} /><Select disabled={commentSubmitting} value={assigneeId} onValueChange={(value) => setAssigneeId(value ?? "none")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("unassigned")}</SelectItem>{users.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select><Button onClick={submitComment} disabled={commentSubmitting || !commentBody.trim()}>{t("addComment")}</Button></DialogContent></Dialog>
  {commandSearchOpen && <EditorCommandSearch commands={commandSearchCommands} onClose={closeCommandSearch} onExecute={(command) => {
    const current = buildEditorCommands().find((candidate) => candidate.id === command.id);
    if (!current || current.disabledReason) return;
    flushSync(() => setCommandSearchOpen(false));
    activeEditor.view.focus();
    current.execute();
    const key = `wiki-command-recent:${currentUserId}`;
    writeEditorStorage(key, JSON.stringify(rememberEditorCommand(recentEditorCommands(readEditorStorage(key)), current.id)));
  }} />}
  <WikiShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} bindings={wikiShortcuts} onBindingsChange={setWikiShortcuts} />
  {typographyOpen && <WikiTypographyDialog
    editorPreferences={{ minimalToolbar, statusVisible, typewriterMode }}
    isPrimaryAuthor={isPrimaryAuthor}
    onApplied={(nextTypography, preferences) => {
      setPersonalTypography(nextTypography);
      if (isPrimaryAuthor) setTypography(nextTypography);
      setMinimalToolbar(preferences.minimalToolbar);
      setStatusVisible(preferences.statusVisible);
      setTypewriterMode(preferences.typewriterMode);
      router.refresh();
    }}
    returnFocus={() => activeEditor.view.dom}
    focusControl={typographyFocus}
    onOpenChange={(open) => { setTypographyOpen(open); if (!open) setTypographyFocus(undefined); }}
    onTemplatesChange={setPersonalTypographyTemplates}
    open={typographyOpen}
    templates={personalTypographyTemplates}
    typography={personalTypography}
  />}
  </div></FigureLibraryContext.Provider>;
}
