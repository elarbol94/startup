"use client";
import { PresentationContent } from "./presentation-content";
import { growPresentationText } from "../lib/presentation-layout";
import { clientUUID } from "@/lib/client-uuid";
import { userIdentityColor } from "@/lib/user-mark-colors";

import { EditorCommandSearch } from "./editor-command-search";
import { PresentationActionMenu, PresentationShortcutHelp } from "./presentation-action-menu";
import { isLinearShape, selectionRoots, mutableSelection } from "../lib/presentation-interactions";

import "@xyflow/react/dist/style.css";
import styles from "./presentation-editor.module.css";

import { memo, useCallback, useEffect, useSyncExternalStore, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PresentationBridge } from "../collaboration/presentation-bridge";
import { CollaborationContext, CollaborationStatus, useCollaboration, useCollaborationContext } from "../collaboration/ui";
import { presentationJSON } from "../collaboration/codec";
import type { PresentationFormat } from "../lib/presentation-format";
import { arrangePresentation, layoutRoots } from "../lib/presentation-layout";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { createId } from "@paralleldrive/cuid2";
import { SelectionMode, Controls, ReactFlow, ReactFlowProvider, ViewportPortal, useReactFlow } from "@xyflow/react";
import { Lock, Maximize2, Save, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "./workspace-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PresentationRecord, PresentationRevisionItem } from "../presentation-queries";
import { PRESENTATION_SNAP_TOLERANCE, presentationDescendants, isPresentationElementLocked, applyGeometryChanges, normalizeRotation, initialPresentationCanvasState, presentationCanvasReducer, presentationCameraBounds, rotateElements, unionBounds, type PresentationCanvasState, type PresentationElement, type PresentationSettings, type PresentationStep } from "../lib/presentation";
import { elementsToNodes, presentationNodeTypes, type PresentationNode } from "./presentation-canvas";
import { usePresentationShapeEdits } from "./presentation-editor/use-presentation-shape-edits";
import { PresentationDrawOverlay } from "./presentation-editor/presentation-draw-overlay";
import { nextFrameBounds } from "../lib/presentation-frame-rail";
import { formatTextHosts } from "../lib/presentation-keyboard-edits";
import { alignPresentationToFrame, setPreciseGeometry } from "../lib/presentation-precision";
import { PresentationLibraryPanel } from "./presentation-library-panel";
import type { SaveState } from "./presentation-editor/presentation-editor-utils";
import { DraftInput } from "./presentation-editor/draft-fields";
import { CanvasSurface, GridOverlay, SnapGuides } from "./presentation-editor/canvas-decorations";
import { PresentationMiniMap, PresentationMiniMapToggle } from "./presentation-editor/presentation-minimap";
import { PresentationDocumentTitle } from "./presentation-editor/presentation-document-title";
import { presentationShortcutLabels } from "./presentation-editor/presentation-shortcuts";
import { SelectionOverlay } from "./presentation-editor/selection-overlay";
import { PresentationPathPanel } from "./presentation-editor/presentation-path-panel";
import { PresentationPlaybackSettings } from "./presentation-editor/presentation-playback-settings";
import { PresentationStartButton } from "./presentation-editor/presentation-start-button";
import { usePresentationCommandPalette } from "./presentation-editor/use-presentation-command-palette";
import { usePresentationAutosave } from "./presentation-editor/use-presentation-autosave";
import { usePresentationSaveState } from "./presentation-editor/use-presentation-save-state";
import { PresentationSaveIndicator } from "./presentation-editor/presentation-save-indicator";
import { usePresentationGestureBoundaries } from "./presentation-editor/use-presentation-gesture-boundaries";
import { usePresentationSelectionEdits } from "./presentation-editor/use-presentation-selection-edits";
import { usePresentationInsertion } from "./presentation-editor/use-presentation-insertion";
import { usePresentationSelectionCommands } from "./presentation-editor/use-presentation-selection-commands";
import { frameInsertionEdit, usePresentationFrames } from "./presentation-editor/use-presentation-frames";
import { isSectionFrame, nestedPresentationFrame, nextFrameNumber } from "../lib/presentation-frames";
import { usePresentationTextEditing } from "./presentation-editor/use-presentation-text-editing";
import { usePresentationClipboard } from "./presentation-editor/use-presentation-clipboard";
import { usePresentationClickSelection } from "./presentation-editor/use-presentation-click-selection";
import { usePlacementFocus } from "./presentation-editor/use-placement-focus";
import { isTextHost, textHostContent, withHostText } from "../lib/presentation-text-host";
import { selectionPath, selectionTargetId } from "../lib/presentation-selection";
import { usePresentationFormatting } from "./presentation-editor/use-presentation-formatting";
import { FloatingTextToolbar } from "./presentation-editor/floating-text-toolbar";
import { usePresentationViewSettings } from "./presentation-editor/use-presentation-view-settings";
import { PresentationRibbon } from "./presentation-editor/ribbon/presentation-ribbon";
import { useRibbonState } from "./presentation-editor/ribbon/use-ribbon-state";
import type { RibbonModel } from "./presentation-editor/ribbon/ribbon-model";
import { PresentationPropertiesPane } from "./presentation-editor/properties/properties-pane";
import { CanvasGuides } from "./presentation-editor/canvas-guides";
import { CanvasRulers, RULER_SIZE } from "./presentation-editor/canvas-rulers";
import { GridGuidesDialog } from "./presentation-editor/grid-guides-dialog";
import { EditPointsOverlay, type EditPointsLabels } from "./presentation-editor/edit-points-overlay";
import { formatCentimetres } from "../lib/presentation-grid";
import { presentationSurface } from "../lib/presentation-ink";
import { presentationElementCaption, presentationSceneElements, presentationSceneSteps } from "../lib/presentation";
import { useDetailScene } from "./presentation-editor/use-detail-scene";
import { DetailSceneBar } from "./presentation-editor/detail-scene-bar";
import { WikiImportDialog } from "./presentation-editor/wiki-import-dialog";
import { PresentationDetailBadges } from "./presentation-detail-badges";
import { usePresentationLeave } from "./presentation-editor/use-presentation-leave";
import { usePresentationRestore } from "./presentation-editor/use-presentation-restore";
import { PresentationHistoryPanel } from "./presentation-editor/presentation-history-panel";
import { usePresentationDrag } from "./presentation-editor/use-presentation-drag";
import { usePresentationSelectionTransforms } from "./presentation-editor/use-presentation-selection-transforms";
import { usePresentationCamera } from "./presentation-editor/use-presentation-camera";
import { usePresentationSteps } from "./presentation-editor/use-presentation-steps";
import { usePresentationWorkspacePanels } from "./presentation-editor/use-presentation-workspace-panels";
import { useDetailBadges } from "./presentation-editor/use-detail-badges";
import { usePresentationDrawTool } from "./presentation-editor/use-presentation-draw-tool";
import { usePresentationPlacement } from "./presentation-editor/use-presentation-placement";
import { usePresentationKeyboard } from "./presentation-editor/use-presentation-keyboard";
import { usePresentationCommands } from "./presentation-editor/use-presentation-commands";
import { InsertPickerDialog, type InsertPicker } from "./presentation-editor/insert-picker-dialog";

const subscribePlatform = () => () => {};
const getMacPlatform = () => /Mac|iPhone|iPad/.test(navigator.platform);
const CAMERA_DURATION = 700;
/** Keeps its last render while `held`: the ribbon and frame rail have nothing new to show mid-drag,
 * and their controls cannot be reached while a canvas gesture holds the pointer. */
const Held = memo(function Held({ children }: { held: boolean; children: ReactNode }) { return children; }, (_, next) => next.held);

function Editor({
  presentation,
  revisions,
}: {
  presentation: PresentationRecord;
  revisions: PresentationRevisionItem[];
}) {
  const collaboration = useCollaborationContext();
  const t = useTranslations("wiki");
  const studio = useTranslations("presentationStudio");
  const tShortcuts = useTranslations("shortcuts");
  const navigationQuery = useSearchParams();
  const router = useRouter();
  const reactFlow = useReactFlow<PresentationNode>();
  const { resolvedTheme } = useTheme();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number } | null>(null);
  const [shortcutHelp, setShortcutHelp] = useState(false);
  const [miniMapVisible, setMiniMapVisible] = useState(false);
  const [insertPicker, setInsertPicker] = useState<InsertPicker>(null);
  const [gridDialog, setGridDialog] = useState(false);
  const isMac = useSyncExternalStore(subscribePlatform, getMacPlatform, () => false);
  const commandRoot = useRef<HTMLDivElement>(null);
  const { commandsOpen, setCommandsOpen, openCommands, restoreCommandFocus } = usePresentationCommandPalette(commandRoot);

  const [formatClipboard, setFormatClipboard] = useState<PresentationFormat | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [sessionId] = useState(() => clientUUID());
  const canEdit = presentation.role === "owner" || presentation.role === "edit";

  const [lockedBy] = useState<string | null>(null);
  const leaseReady = !canEdit || !!collaboration?.ready;
  const [conflict] = useState(false);
  const panels = usePresentationWorkspacePanels();
  const { activePanel, setActivePanel, paneRequest, pathOpen, setPathOpen, togglePath, togglePanel, requestProperties } = panels;
  const [workspaceDialog, setWorkspaceDialog] = useState<"sharing" | "history" | "playback" | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const readOnly = !canEdit || !leaseReady || lockedBy !== null || conflict || collaboration?.status === "denied" || collaboration?.status === "error";
  const disabled = readOnly || restoring !== null;
  const paused = useRef(false);
  /**
   * The canvas, its undo stack and the alignment guides are one reducer: undo has to
   * snapshot exactly the canvas an edit is applied to, and a drag reports edits faster than
   * React re-renders, so every canvas change is expressed as a pure transition instead of a
   * read-modify-write. The stack lives for this editing session only.
   */
  const [canvas, rawDispatch] = useReducer(
    presentationCanvasReducer,
    presentation,
    (source) => initialPresentationCanvasState(source.elements, source.steps, source.background, source.settings, source.title),
  );
  const [bridge] = useState(() => new PresentationBridge(collaboration, canvas, rawDispatch));
  const dispatch = bridge.dispatch;
  const undo = bridge.undo;
  useEffect(() => bridge.connect(), [bridge]);
  const { elements, steps, guides, background, settings, title } = canvas;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionKey = selectedIds.join(":");
  const [inspectedSelection, setInspectedSelection] = useState(selectionKey);
  if (selectionKey !== inspectedSelection) {
    setInspectedSelection(selectionKey);
    if (!selectionKey) setActivePanel((current) => current === "properties" ? null : current);
  }
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [status, setStatus] = useState<Exclude<SaveState, "unsaved">>("idle");
  const [uploading, setUploading] = useState(false);

  const saveState = usePresentationSaveState(collaboration, { local: status, dirty: canvas.dirty, failed: canvas.failed });

  // The paths that leave the editor -- unmount, "Präsentieren", "PDF-Export" -- run outside
  // React's data flow and need the canvas as it is at that moment, not as it was when they
  // were wired up.
  const latest = useRef({ canvas, readOnly });
  /** The write in flight, so a flush can wait for it and land after it. */
  const inFlight = useRef<Promise<boolean> | null>(null);
  const lastPersisted = useRef<PresentationCanvasState | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selection = useMemo(
    () => elements.filter((element) => selectedSet.has(element.id)),
    [elements, selectedSet],
  );
  // The property panel edits exactly one element; two or more are handled as a group.
  const selected = selection.length === 1 ? selection[0] : null;
  const selectedLocked = Boolean(selected && isPresentationElementLocked(elements, selected.id));
  // A single object's handles sit on its own (rotated) box; several share the box around them all.
  const selectionBounds = useMemo(() => selection.length === 1
    ? { x: selection[0].x, y: selection[0].y, width: selection[0].width, height: selection[0].height }
    : unionBounds(selection.map(presentationCameraBounds)), [selection]);
  const rotationReferences = useMemo(() => {
    const moving = presentationDescendants(elements, selectedSet);
    return elements.filter(element => !moving.has(element.id)).map(element => element.rotation);
  }, [elements, selectedSet]);
  const activeStep = steps.find((step) => step.id === activeStepId) ?? null;

  const commitElements = useCallback(
    (update: (current: PresentationElement[]) => PresentationElement[]) =>
      dispatch({ type: "edit", at: Date.now(), elements: update }),
    [dispatch],
  );

  const commitSteps = useCallback(
    (update: (current: PresentationStep[]) => PresentationStep[]) =>
      dispatch({ type: "edit", at: Date.now(), steps: update }),
    [dispatch],
  );

  const { flush } = usePresentationAutosave({
    collaboration, canvas, readOnly, restoring, status, setStatus, paused, latest, inFlight, lastPersisted, selectedIds, canEdit, presentation, rawDispatch,
  });

  const updateElement = useCallback(
    (id: string, update: (element: PresentationElement) => PresentationElement) => {
      commitElements((current) => {
        const source = current.find((element) => element.id === id);
        if (!source || isPresentationElementLocked(current, id)) return current;
        let next = update(source);
        if (next.type === "text" && next.content !== source.content && next.width === source.width && next.height === source.height) next = growPresentationText(next);
        let result = current;
        if (next.rotation !== source.rotation) result = rotateElements(result, new Set([id]), next.rotation - source.rotation, { x: source.x + source.width / 2, y: source.y + source.height / 2 });
        if (["x", "y", "width", "height"].some((key) => next[key as "x"] !== source[key as "x"])) result = applyGeometryChanges(result, [{ id, x: next.x, y: next.y, width: next.width, height: next.height }], 0).elements;
        return result.map((element) => element.id === id ? { ...next, x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation } : element);
      });
    },
    [commitElements],
  );

  const updateSettings = useCallback((update: Partial<PresentationSettings>) => {
    dispatch({ type: "touch", settings: update });
  }, [dispatch]);

  const onTextChange = useCallback(
    (id: string, text: string) => {
      updateElement(id, (element) => (element.type === "text" ? { ...element, content: { ...element.content, text, runs: undefined } } : element));
    },
    [updateElement],
  );

  const { startGesture, endGesture } = usePresentationGestureBoundaries(dispatch);

  const { onLineEndDrop, onRouteChange, onAdjust } = usePresentationShapeEdits(dispatch);
  const locale = useLocale();
  const view = usePresentationViewSettings({ settings, update: updateSettings, elements, createId: () => createId(), viewportCenter: () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
  } });
  const snapOptions = view.snapOptions;
  const onRichTextChange = useCallback((id: string, content: Extract<PresentationElement, { type: "text" }>["content"]) => updateElement(id, element => element.type === "text" ? { ...element, content } : withHostText(element, content)), [updateElement]);
  const onResizeChange = useCallback((next: PresentationElement, free: boolean) => {
    dispatch({ type: "geometry", at: Date.now(), changes: [{ id: next.id, x: next.x, y: next.y, width: next.width, height: next.height, resizing: true }], tolerance: free ? 0 : PRESENTATION_SNAP_TOLERANCE / reactFlow.getZoom(), gesture: true, snap: free ? undefined : snapOptions() });
  }, [dispatch, reactFlow, snapOptions]);
  const collaboratorPresence = collaboration?.people;
  const { dropTargetId, trackDrag, clearPlacement, reveal } = usePresentationFrames({ elements, steps, reactFlow, canvasRef });
  const textEditing = usePresentationTextEditing();
  // The text being edited can disappear under the editor (delete, undo, a collaborator). Edit
  // mode ends with it, so restoring an element with the same id never reopens it mid-edit.
  if (textEditing.editingId && !elements.some((element) => element.id === textEditing.editingId)) textEditing.stopEditing();
  const formatting = usePresentationFormatting({ elements, selection, selectedIds, settings, dispatch, updateSettings, setSelectedIds, disabled, editingId: textEditing.editingId,
    onEditorReady: textEditing.onEditorReady, startGesture, endGesture, presentationId: presentation.id, t });
  const onTextEditorReady = formatting.onTextEditorReady;
  const ribbon = useRibbonState({ contextual: formatting.shapes.length > 0 || formatting.texts.length > 0, onSearch: openCommands });
  const editOnClick = useCallback((id: string, point: { x: number; y: number }) => {
    const element = elements.find((element) => element.id === id);
    if (!disabled && isTextHost(element) && !isPresentationElementLocked(elements, id)) textEditing.startEditing(id, point, textHostContent(element).text);
  }, [elements, disabled, textEditing]);
  const clickSelection = usePresentationClickSelection({ elements, reactFlow, selectedIds, setSelectedIds, isMac, onClickSelected: editOnClick });
  // Only the open scene is drawn: the overview, or the one detail page being edited.
  const detail = useDetailScene({ elements, steps, dispatch, disabled, setSelectedIds, reactFlow });
  const [wikiImportOpen, setWikiImportOpen] = useState(false);
  const tDetails = useTranslations("wiki.presentations.details");
  const { hoverBadge, badgeIds } = useDetailBadges(selectedIds);
  // Gesture refs written by the canvas handlers below, so they live here (the compiler rejects mutating a hook's returned ref).
  const placementClick = useRef(false);
  const dragCancel = useRef<(() => void) | null>(null);
  const cancelledGesture = useRef(false);
  const marqueeBase = useRef<string[]>([]);
  const axisDrag = useRef<{ positions: Map<string, { x: number; y: number }>; shift: boolean } | null>(null);
  const { previewGuides, dragPreview, onNodesChange, duplicateDrag } = usePresentationDrag({
    elements, selectedIds, selectedSet, setSelectedIds, disabled, isMac, reactFlow, t, dispatch, endGesture, snapOptions, clickSelection, dragCancel, cancelledGesture, marqueeBase, axisDrag,
  });
  const nodes = useMemo(
    () => elementsToNodes(dragPreview ? [...detail.elements, ...dragPreview] : detail.elements, { editable: !disabled, selectedIds: dragPreview ? new Set(dragPreview.filter(e => !dragPreview.some(p => p.id === e.parentId)).map(e => e.id)) : selectedSet, onTextChange,
      onRichTextChange, onLineEndDrop, onAdjust, onResizeChange, editingId: textEditing.editingId, deferredId: textEditing.deferredId, onEditingChange: textEditing.onEditingChange, onTextEditorReady,
      onGestureStart: startGesture, onGestureEnd: endGesture, dropTargetId, background: presentationSurface(background) }).map(node => {
      const collaborators = collaboratorPresence?.filter(person => person.selectedIds?.includes(node.id)) ?? [];
      return collaborators.length ? { ...node, style: { ...node.style, outline: `2px solid ${userIdentityColor(collaborators[0].userId)}`, outlineOffset: 3 }, ariaLabel: collaborators.map(person => person.name).join(", ") } : node;
    }),
    [detail.elements, dragPreview, selectedSet, onTextChange, disabled, startGesture, endGesture, collaboratorPresence, onRichTextChange, onLineEndDrop, onAdjust, onResizeChange, dropTargetId, textEditing.editingId, textEditing.deferredId, textEditing.onEditingChange, onTextEditorReady, background],
  );

  const { rotateSelection, startScale, scaleSelection } = usePresentationSelectionTransforms({ commitElements, selectedSet, bridge });

  const { pendingElement, setPendingElement, viewportCenter, addElement, placePending } = usePresentationPlacement({
    disabled, elements, dispatch, t, setSelectedIds, canvasRef, reactFlow, clearPlacement, reveal, textEditing,
  });

  const arrangementRoots = layoutRoots(elements, selectedSet);
  const arrangementDisabled = disabled || arrangementRoots.length < 2 || arrangementRoots.some(e => isPresentationElementLocked(elements, e.id) || (e.type === "shape" && e.content.connection));
  const connectObjects = (fromId: string, toId: string) => {
    const from = elements.find(e => e.id === fromId), to = elements.find(e => e.id === toId);
    if (disabled || !from || !to || fromId === toId || elements.length >= 500 || isPresentationElementLocked(elements, fromId)
      || (from.type === "shape" && from.content.connection) || (to.type === "shape" && to.content.connection)) return;
    addElement({ id: createId(), type: "shape", x: 0, y: 0, width: 20, height: 20, rotation: 0,
      content: { shape: "arrow", fill: "", stroke: "", strokeWidth: 3, opacity: 1, connection: { fromId, toId } } }, false);
  };
  const connectSelection = () => {
    if (!arrangementDisabled && arrangementRoots.length === 2) connectObjects(arrangementRoots[0].id, arrangementRoots[1].id);
  };

  const selectionEdits = usePresentationSelectionEdits({
    elements, dispatch, disabled, t, commitElements, selection, formatClipboard, setFormatClipboard, setSelectedIds,
  });
  const { deleteSelection } = selectionEdits;

  const insertion = usePresentationInsertion({
    addElement, viewportCenter, t, studio, presentation, disabled, uploading, setUploading,
  });
  const { addTextAt, addShape, addStudioElement, uploadMedia, uploadImage } = insertion;

  const requestedElement = navigationQuery.get("element");
  const { flyTo } = usePresentationCamera({ reactFlow, requestedElement, presentationId: presentation.id, elements, steps, detail, setSelectedIds, setActiveStepId, setActivePanel });

  const { updateStepDuration, addStep, updateStepNotes, sensors, onStepDragEnd } = usePresentationSteps({ commitSteps, selected, disabled, readOnly, setActiveStepId });

  const { listHref, presentHref, printHref, flushThen, leaveVia, auxFlush } = usePresentationLeave({ flush, presentationId: presentation.id, router, sessionId, t, paused });

  const libraryPanel = (          <PresentationLibraryPanel section={activePanel === "assets" ? "assets" : activePanel === "comments" ? "comments" : "design"} id={presentation.id} selectedId={selected?.id} canEdit={canEdit && !disabled} onSelect={(id) => { setSelectedIds([id]); const element = elements.find((element) => element.id === id); if (element) flyTo(element); }} flush={flush}
            onTheme={(theme) => { commitElements((current) => current.map((element) => element.type === "text" ? { ...element, content: { ...element.content, color: theme.foreground, font: theme.font } } : element.type === "frame" ? { ...element, content: { ...element.content, color: theme.accent } } : element)); dispatch({ type: "touch", background: theme.background }); }}
            onTemplate={(snapshot) => { dispatch({ type: "edit", at: Date.now(), elements: () => snapshot.elements, steps: () => snapshot.steps }); dispatch({ type: "touch", background: snapshot.background, settings: snapshot.settings }); setSelectedIds([]); }}
            onAsset={(attachmentId, alt) => { const { x, y } = viewportCenter(); addElement({ id: createId(), type: "image", x, y, width: 360, height: 240, rotation: 0, content: { attachmentId, alt } }); }}
            onIcon={(name) => { const { x, y } = viewportCenter(); addElement({ id: createId(), type: "icon", x, y, width: 100, height: 100, rotation: 0, content: { name, color: "#6366f1" } }); }} />
);
  const sharingPanel = (          <PresentationLibraryPanel section="sharing" id={presentation.id} selectedId={selected?.id} canEdit={canEdit && !disabled} onSelect={(id) => { setSelectedIds([id]); const element = elements.find((element) => element.id === id); if (element) flyTo(element); }} flush={flush}
            onTheme={(theme) => { commitElements((current) => current.map((element) => element.type === "text" ? { ...element, content: { ...element.content, color: theme.foreground, font: theme.font } } : element.type === "frame" ? { ...element, content: { ...element.content, color: theme.accent } } : element)); dispatch({ type: "touch", background: theme.background }); }}
            onTemplate={(snapshot) => { dispatch({ type: "edit", at: Date.now(), elements: () => snapshot.elements, steps: () => snapshot.steps }); dispatch({ type: "touch", background: snapshot.background, settings: snapshot.settings }); setSelectedIds([]); }}
            onAsset={(attachmentId, alt) => { const { x, y } = viewportCenter(); addElement({ id: createId(), type: "image", x, y, width: 360, height: 240, rotation: 0, content: { attachmentId, alt } }); }}
            onIcon={(name) => { const { x, y } = viewportCenter(); addElement({ id: createId(), type: "icon", x, y, width: 100, height: 100, rotation: 0, content: { name, color: "#6366f1" } }); }} />
);
  const scene = useMemo(() => ({ title, elements, steps, background, settings }), [title, elements, steps, background, settings]);
  /** The rail's "New frame": the next frame beside the last one on the path, like a new slide. */
  const addFrameAtEnd = () => {
    if (detail.sceneId) { addNestedFrame(); return; }
    if (disabled || elements.length >= 500) return;
    // New frames extend the overview's path, never a detail page's.
    if (detail.sceneId) detail.show(null);
    const frame: PresentationElement = { id: createId(), type: "frame", ...nextFrameBounds(presentationSceneElements(elements, null), presentationSceneSteps(elements, steps, null)), rotation: 0, content: { label: "", shape: "rect", color: "" } };
    dispatch(frameInsertionEdit([frame], current => [...current, frame], t));
    setSelectedIds([frame.id]);
    flyTo(frame);
  };
  const { galleryOpen, setGalleryOpen, drawTool, setDrawTool, setDrawLock, createDrawn } = usePresentationDrawTool({ disabled, elements, settings, dispatch, t, setSelectedIds, canvasRef, ribbon, textEditing });
  const addFrame = () => { if (detail.sceneId) addNestedFrame(); else insertion.addFrame(); };
  const nestedFrameParent = selected && isSectionFrame(selected) ? selected : detail.trail.at(-1)?.frame;
  const nestedFrameDisabled = disabled || !nestedFrameParent || isPresentationElementLocked(elements, nestedFrameParent.id)
    || elements.length >= 500 || steps.length >= 500 || nestedFrameParent.width < 40 || nestedFrameParent.height < 40;
  const addNestedFrame = () => {
    if (nestedFrameDisabled || !nestedFrameParent) return;
    const frame = nestedPresentationFrame(nestedFrameParent, createId(), t("presentations.frameName", {
      number: nextFrameNumber(elements, number => t("presentations.frameName", { number })),
    }));
    if (!frame) return;
    setPendingElement(null);
    setDrawTool(null);
    // Preserve the explicit parent even when other frames overlap its center.
    const edit = frameInsertionEdit([frame], current => [...current, frame], t);
    dispatch({ ...edit, elements: current => [...current, frame] });
    setSelectedIds([frame.id]);
    flyTo(frame);
  };
  const pathPanel = (<PresentationPathPanel presentation={presentation} steps={detail.steps} elements={elements} selected={selected}
    activeStep={activeStep} activeStepId={activeStepId} setActiveStepId={setActiveStepId} setSelectedIds={setSelectedIds} flyTo={flyTo}
    commitSteps={commitSteps} addStep={addStep} disabled={disabled} readOnly={readOnly} sensors={sensors} onStepDragEnd={onStepDragEnd}
    settings={settings} updateStepDuration={updateStepDuration} updateStepNotes={updateStepNotes} collaboration={collaboration} dispatch={dispatch}
    scene={scene} onNewFrame={addFrameAtEnd} />);
  const openHistory = useCallback(async () => {
    if (await flush()) { router.refresh(); setWorkspaceDialog("history"); }
  }, [flush, router]);
  const restoreRevision = usePresentationRestore({ updatedAt: presentation.updatedAt, flush, sessionId, collaboration, dispatch, paused, setRestoring, setSelectedIds, setActiveStepId, setStatus, onRestored: () => setWorkspaceDialog(null), router, t });
  const selectedRoots = selectionRoots(elements, selectedIds);
  const canMutate = !disabled && mutableSelection(elements, selectedIds);
  function interact(key: string) { return t(`presentations.interactions.${key}`); }
  const shortcutLabels = presentationShortcutLabels(isMac, { ctrl: tShortcuts("ctrl"), delete: t("shortcuts.keys.delete"), enter: t("shortcuts.keys.enter"), shift: tShortcuts("shift"), alt: tShortcuts("alt") });
  const selectionCommands = usePresentationSelectionCommands({
    selected, selectedIds, selectedRoots, canMutate, elements, steps, dispatch, setSelectedIds, startTextEditing: textEditing.startEditing, t,
  });
  const clipboard = usePresentationClipboard({
    selection, selectedIds, canMutate, elements, disabled, contextPosition, reactFlow, viewportCenter,
    presentation, dispatch, setSelectedIds, deleteSelection, latest, t, commandRoot, canvasRef,
  });
  const placementFocus = usePlacementFocus(canvasRef, Boolean(pendingElement));
  const { commands, commandText, executeCommand, showMenuCommand } = usePresentationCommands({
    t, studio, tDetails, interact, disabled, elements, steps, settings, canvas, selection, selectedIds, selected, selectedSet, selectedRoots, canMutate, uploading, restoring,
    insertion: { ...insertion, addFrame }, addNestedFrame, nestedFrameDisabled, setGalleryOpen, setInsertPicker, imageInputRef, mediaInputRef, selectionEdits, selectionCommands, clipboard, formatClipboard, dispatch, undo, reactFlow,
    panels, flush, flushThen, printHref, presentationId: presentation.id, setWorkspaceDialog, openHistory, detail, setWikiImportOpen, miniMapVisible, setMiniMapVisible,
    setSelectedIds, arrangementDisabled, connectSelection, updateElement, setShortcutHelp, formatting, view, setGridDialog,
  });
  usePresentationKeyboard({
    drawTool, commandRoot, canvasRef, formatting, view, textEditing, commandsOpen, shortcutHelp, pendingElement, setPendingElement, placePending, viewportCenter,
    canMutate, selectedRoots, selected, selectedLocked, selectedIds, setSelectedIds, elements, detail, dispatch, commitElements, executeCommand, setContextPosition, dragCancel, cancelledGesture, bridge,
  });
  const ribbonModel: RibbonModel = {
    state: ribbon, commands, run: executeCommand, shortcuts: shortcutLabels, disabled, insertDisabled: disabled || elements.length >= 500, uploading,
    title: <>
      <PresentationDocumentTitle title={title} />
      <Link href={listHref} className="shrink-0 text-sm text-muted-foreground hover:text-foreground" onClick={(event) => leaveVia(event, listHref)} onAuxClick={(event) => auxFlush(event, listHref)}>
        {t("presentations.title")}
      </Link>
      <span className="text-muted-foreground">/</span>
      <DraftInput value={title} maxLength={200} disabled={disabled} aria-label={t("presentations.presentationTitle")}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent font-medium shadow-none hover:border-input sm:max-w-md"
        normalise={(raw) => raw.trim() || title} onCommit={(next) => dispatch({ type: "touch", title: next })} />
    </>,
    saveStatus: <>
      <span role="status" aria-live="polite"><PresentationSaveIndicator state={saveState} /></span>
      {(saveState === "error" || saveState === "offline") && <Button size="sm" variant="ghost" onClick={() => void flush()} disabled={disabled}><Save className="size-3.5" />{t("presentations.save")}</Button>}
    </>,
    // The player is server-rendered from the saved canvas, so the navigation waits for the
    // write rather than presenting a stale canvas. A modifier click still means "new tab" --
    // it just gets one with the edit in it.
    // "From current stop" opens on the stop selected in the path panel.
    present: (variant) => {
      const fromCurrent = variant === "ribbonCurrent", ribbon = variant !== "titleBar";
      const href = fromCurrent && activeStep ? `${presentHref}?from=${encodeURIComponent(activeStep.id)}` : presentHref;
      return <PresentationStartButton href={href} ribbon={ribbon} fromCurrent={fromCurrent} startMode={settings.startMode}
        disabled={!steps.length || restoring !== null || uploading || (fromCurrent && !activeStep)}
        leaveVia={leaveVia} auxFlush={auxFlush} />;
    },
    onLeave: () => flushThen(listHref, false), onSearch: openCommands,
    pathOpen, togglePath, activePanel, togglePanel,
    shapeGallery: { open: galleryOpen, setOpen: setGalleryOpen, armed: Boolean(drawTool), onPick: (entry, options) => { setGalleryOpen(false); setPendingElement(null); setDrawLock(Boolean(options?.lock)); setDrawTool(entry); canvasRef.current?.focus(); } },
    addStudio: (kind, choice) => addStudioElement(kind, choice),
    background, setBackground: (color) => dispatch({ type: "touch", background: color }),
    formatting,
    onTextKey: (key) => { if (canMutate && selectedRoots.length) dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => formatTextHosts(current, new Set(selectedRoots.map(e => e.id)), key) }); },
    onOpenPane: (group) => { formatting.openPane(group); requestProperties(group === "shape" ? "fill" : "text"); },
  };
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="presentation-editor" data-presentation-workspace data-wiki-command-scope ref={commandRoot} tabIndex={-1}
      onPointerDownCapture={event => { if (commandRoot.current?.contains(event.target as Node) && !(event.target as HTMLElement).closest('button, a, input, textarea, select, [contenteditable=true]')) (canvasRef.current?.contains(event.target as Node) ? canvasRef.current : commandRoot.current)?.focus({ preventScroll: true }); }}>
      {commandsOpen && <EditorCommandSearch shortcutLabels={shortcutLabels} title={commandText} description={t("presentations.commands.description")} commands={commands}
        onClose={() => { flushSync(() => setCommandsOpen(false)); restoreCommandFocus(); }}
        onExecute={item => { if (item.disabledReason) return; flushSync(() => setCommandsOpen(false)); restoreCommandFocus(); item.execute(); }} />}
      <PresentationShortcutHelp open={shortcutHelp} onOpenChange={setShortcutHelp} title={interact("shortcutHelp")} help={interact("gestureHelp")} commands={commands} shortcutLabels={shortcutLabels} />
      <InsertPickerDialog insertPicker={insertPicker} setInsertPicker={setInsertPicker} placementFocus={placementFocus} addShape={addShape} addStudioElement={addStudioElement} t={t} interact={interact} />
      {collaboration && <CollaborationStatus provider={collaboration} className="sr-only" />}
      <Held held={canvas.gestureActive}><PresentationRibbon model={ribbonModel} /></Held>
      <input ref={mediaInputRef} aria-label={studio("uploadMedia")} hidden type="file" accept="video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file); event.target.value = ""; }} />
      <input ref={imageInputRef} aria-label={t("presentations.uploadImage")} hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadImage(file); }} />
      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b bg-destructive/10 px-3 py-2 text-sm">
          <TriangleAlert className="size-4 shrink-0" />
          <span className="flex-1">{t("presentations.saveConflict")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(latest.current.canvas, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = "presentation-draft.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>{studio("downloadDraft")}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>{t("presentations.reloadLatest")}</Button>
        </div>
      )}

      {!conflict && readOnly && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <Lock className="size-4 shrink-0" />
          <span>{!canEdit ? studio("viewOnly") : !leaseReady && lockedBy === null ? t("presentations.checkingAccess") : lockedBy ? t("presentations.lockedBy", { name: lockedBy }) : t("presentations.locked")}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <WorkspacePanel title={t("presentations.path")} open={pathOpen} onClose={() => setPathOpen(false)} side="left" narrow className="h-full max-h-full overflow-y-auto"><fieldset disabled={disabled} className="min-w-0"><Held held={canvas.gestureActive}>{pathPanel}</Held></fieldset></WorkspacePanel>
        {/* The detail page breadcrumb sits above the canvas, never over the slide being edited. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DetailSceneBar trail={detail.trail} onShow={detail.show} onClose={detail.close} onImport={() => setWikiImportOpen(true)} disabled={disabled} />
        <div ref={canvasRef} data-presentation-canvas tabIndex={0} onPointerMove={event => { if (pendingElement && !disabled) { const point = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }); setPendingElement({ ...pendingElement, x: point.x - pendingElement.width / 2, y: point.y - pendingElement.height / 2 }); } }} onPointerDownCapture={event => { if (formatting.picking) { event.preventDefault(); event.stopPropagation(); formatting.pickAt(event.clientX, event.clientY); return; } if ((event.target as HTMLElement).closest("[data-presentation-overlay]")) return; if (pendingElement && !disabled && event.button === 0 && !(event.target as HTMLElement).closest("button, .react-flow__minimap, .react-flow__controls")) { event.preventDefault(); event.stopPropagation(); placementClick.current = true; placePending(reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); return; } cancelledGesture.current = false; clickSelection.onPointerDown(event); const target = event.target as HTMLElement; marqueeBase.current = event.shiftKey && target.classList.contains("react-flow__pane") ? selectedIds : []; clickSelection.pressGroupMember(event); duplicateDrag(event); }} className={`relative min-h-40 min-w-0 flex-1 bg-muted/30 outline-none ${formatting.picking ? "cursor-crosshair [&_*]:!cursor-crosshair" : ""}`}
          onClickCapture={event => {
            if (placementClick.current) { placementClick.current = false; event.preventDefault(); event.stopPropagation(); return; }
            clickSelection.onClickCapture(event);
          }}
          onDoubleClick={event => { const editedNode = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node")?.dataset.id; if (editedNode && editedNode === textEditing.editingId) { textEditing.onEditingDoubleClick(editedNode); return; } if (!pendingElement && !disabled && elements.length < 500) textEditing.onCanvasDoubleClick(event, () => addTextAt(reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))); }}
          onContextMenu={event => { if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return; event.preventDefault(); const node = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node"); if (node?.dataset.id) { const id = node.dataset.id; if (!selectionPath(elements, id).some(level => selectedIds.includes(level))) setSelectedIds([selectionTargetId(elements, id, selectedIds)]); } else clickSelection.onPaneContextMenu(event); setContextPosition({ x: event.clientX, y: event.clientY }); }}>
          {drawTool && !disabled && <PresentationDrawOverlay tool={drawTool} reactFlow={reactFlow} lookup={(id) => elements.find((element) => element.id === id)}
            onCreate={createDrawn} onCancel={() => { setDrawTool(null); setDrawLock(false); canvasRef.current?.focus(); }} label={t(`presentations.shapeGallery.shapes.${drawTool.id}`)} />}
          {contextPosition && <PresentationActionMenu shortcutLabels={shortcutLabels} commands={commands} showCommand={showMenuCommand} label={interact("actions")} position={contextPosition} onClose={() => { setContextPosition(null); canvasRef.current?.focus(); }} />}
          <div className="absolute right-3 bottom-3 z-10 flex rounded-lg border bg-background shadow-sm">{elements.length > 0 && <PresentationMiniMapToggle visible={miniMapVisible} onToggle={() => setMiniMapVisible(value => !value)} showLabel={interact("minimapShow")} hideLabel={interact("minimapHide")} />}        <Button type="button" variant="ghost" size="sm" onClick={() => void reactFlow.fitView({ padding: 0.15, duration: CAMERA_DURATION })}>
          <Maximize2 className="size-3.5" />{t("presentations.overview")}
        </Button>
</div>
          {selected && isTextHost(selected) && !disabled && !selectedLocked && !pendingElement && !drawTool && !contextPosition && formatting.format && (
            <FloatingTextToolbar key={`${selected.id}:${textEditing.editingId ?? "selected"}`} element={selected} format={formatting.format}
              canvasRef={canvasRef} updateText={formatting.updateTexts} onMore={() => requestProperties("text")} />
          )}
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={presentationNodeTypes}
            onNodesChange={onNodesChange}
            onNodeMouseEnter={(_event, node) => hoverBadge(node.id)}
            onNodeMouseLeave={() => hoverBadge(null)}
            onNodeDoubleClick={(_event, node) => {
              setSelectedIds([node.id]);
              if (node.type === "text") return;
              if (!disabled && isTextHost(node.data.element) && !isPresentationElementLocked(elements, node.id)) { textEditing.startEditing(node.id); return; }
              // Like PowerPoint, a double-click opens the object's own formatting: Picture for a picture, Frame for a frame.
              requestProperties("primary");
            }}
            zoomOnDoubleClick={false}
            onNodeDragStart={(event, _node, dragged) => { axisDrag.current = { positions: new Map(elements.map(e => [e.id, { x: e.x, y: e.y }])), shift: event.shiftKey }; trackDrag(dragged); startGesture(); }}
            onNodeDragStop={() => { axisDrag.current = null; trackDrag(null); endGesture(); }}
            onSelectionDragStart={(event, dragged) => { axisDrag.current = { positions: new Map(elements.map(e => [e.id, { x: e.x, y: e.y }])), shift: event.shiftKey }; trackDrag(dragged); startGesture(); }}
            onSelectionDragStop={() => { axisDrag.current = null; trackDrag(null); endGesture(); }}
            elevateNodesOnSelect={false}
            className={styles.canvas}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            // Scene-aware camera restoration waits for the viewport controller and size.
            fitView={false}
            minZoom={0.02}
            maxZoom={8}
            nodesConnectable={false}
            nodesDraggable={!disabled}
            // Delete is handled by the editor's own shortcut, so there is one delete path.
            deleteKeyCode={null}
            // A drag on empty canvas draws a marquee (Shift adds to it); modifier clicks toggle (usePresentationClickSelection).
            selectionKeyCode={null}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            selectionOnDrag
            onSelectionEnd={() => { marqueeBase.current = []; }}
            selectionMode={SelectionMode.Full}
            panActivationKeyCode="Space"
            style={{ backgroundColor: presentationSurface(background) }}
            panOnDrag={[1]}
            // Wheel and two-finger scroll pan; Ctrl/Cmd+wheel and pinch (a wheel with ctrlKey) zoom.
            panOnScroll zoomActivationKeyCode={["Control", "Meta"]}
            onPaneClick={event => { endGesture(); clickSelection.onPaneClick(event); }}
            proOptions={{ hideAttribution: false }}
          >
            {/* Gridlines draw over the slide; off, the canvas is plain. */}
            {settings.grid.show
              ? <GridOverlay spacing={settings.grid.spacing} transparency={settings.grid.transparency} />
              : <CanvasSurface surface={presentationSurface(background)} />}
            {/* React Flow insets panels by 15 px; past the vertical ruler when it shows. */}
            <Controls position="bottom-left" showInteractive={false} style={settings.ruler ? { marginLeft: RULER_SIZE + 15 } : undefined} />
            {elements.length > 0 && miniMapVisible && <PresentationMiniMap label={interact("minimapLabel")} />}
            <SnapGuides guides={dragPreview ? previewGuides : guides} />
            <PresentationDetailBadges elements={detail.elements} frameByBox={detail.frameByBox} onOpen={detail.open} showFor={badgeIds} onHover={hoverBadge}
              createFor={!disabled && selection.length === 1 && !dragPreview && !(selected?.type === "shape" && selected.content.connection) && !(selected?.type === "frame" && detail.sceneId === selected.id) ? selected : null}
              openLabel={box => tDetails("openNamed", { name: presentationElementCaption(box) || tDetails("group") })} createLabel={tDetails("create")} />
            {settings.guides.show && <CanvasGuides guides={settings.guides.list} onChange={view.setGuides} createId={() => createId()} elements={elements} rulers={settings.ruler} disabled={disabled}
              format={cm => formatCentimetres(cm, locale)} labels={{ guide: t("presentations.gridGuides.guide"), addVertical: t("presentations.gridGuides.addVertical"), addHorizontal: t("presentations.gridGuides.addHorizontal"), delete: t("presentations.gridGuides.delete") }} />}
            {formatting.editPointsElement && !disabled && <EditPointsOverlay element={formatting.editPointsElement} labels={t.raw("presentations.editPoints") as EditPointsLabels}
              onChange={formatting.replaceElement} onCommitStart={startGesture} onCommitEnd={endGesture} onExit={formatting.stopEditPoints} />}
            {pendingElement && !disabled && <ViewportPortal><div data-testid="presentation-placement-preview" className="pointer-events-none absolute border border-dashed border-indigo-500 opacity-60" style={{ left: pendingElement.x, top: pendingElement.y, width: pendingElement.width, height: pendingElement.height }}><PresentationContent element={pendingElement} /></div></ViewportPortal>}
            {!disabled && !formatting.editPointsElement && selectionBounds && !(selection.length === 1 && isLinearShape(selection[0])) && !selection.some((element) => isPresentationElementLocked(elements, element.id)) && (
              <SelectionOverlay
                box={selectionBounds}
                rotation={selection.length === 1 ? selection[0].rotation : 0}
                startAngle={selection[0]?.rotation ?? 0}
                outlines={selection}
                referenceAngles={rotationReferences}
                // Individual objects use local-axis handles; several scale together.
                scalable={selection.length > 1}
                rotateLabel={t("presentations.rotateHandle")}
                scaleLabel={t("presentations.scaleHandle")}
                onRotate={rotateSelection}
                onScaleStart={startScale}
                onScale={scaleSelection}
                onGestureStart={startGesture}
                onGestureEnd={endGesture}
              />
            )}
          </ReactFlow>
          {settings.ruler && <CanvasRulers elements={elements} selection={selectionBounds ?? undefined} onAddGuide={view.addGuide} disabled={disabled}
            format={cm => formatCentimetres(cm, locale)} labels={{ horizontal: t("presentations.gridGuides.horizontalRuler"), vertical: t("presentations.gridGuides.verticalRuler") }} />}
          {formatting.picking && <div role="status" data-testid="eyedropper-hint" className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded bg-background px-3 py-2 text-xs shadow">{t("presentations.formatPane.colors.eyedropperHint")}</div>}
          {pendingElement && !disabled && <div role="status" className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-background px-3 py-2 text-xs shadow">{interact("placeHint")}</div>}
          {!elements.length && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <Square className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">{t("presentations.emptyCanvasTitle")}</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">{t("presentations.emptyCanvasDescription")}</p>
              </div>
            </div>
          )}
        </div>
        </div>

        <WorkspacePanel title={t(`workspace.${activePanel ?? "properties"}`)} open={activePanel !== null} onClose={() => setActivePanel(null)} className="h-full max-h-full overflow-y-auto">
          <div hidden={!["design", "assets", "comments"].includes(activePanel ?? "")}>{libraryPanel}</div>
          <div hidden={activePanel !== "properties"}>
            <PresentationPropertiesPane key={selection.length ? "selection" : "canvas"} elements={elements} selection={selection} disabled={disabled || uploading} collaboration={collaboration}
              formatting={formatting} request={paneRequest} run={executeCommand} commands={commands} updateElement={updateElement}
              onTextChange={onTextChange} onRichTextChange={onRichTextChange} onRouteChange={onRouteChange}
              onGeometry={(id, field, value, proportional) => {
                const next = setPreciseGeometry(elements, id, field, value, proportional);
                if (next === elements) return elements.find(e => e.id === id)?.[field] === (field === "rotation" ? normalizeRotation(value) : value);
                dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => setPreciseGeometry(current, id, field, value, proportional) });
                return true;
              }}
              onAlignInFrame={mode => dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => alignPresentationToFrame(current, selectedSet, mode) })}
              onArrange={mode => { if (!arrangementDisabled) dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => arrangePresentation(current, selectedSet, mode) }); }}
              arrangeDisabled={arrangementDisabled} rootCount={arrangementRoots.length} onConnect={connectObjects} onElements={commitElements}
              onSelect={(id) => { setSelectedIds([id]); const element = elements.find((candidate) => candidate.id === id); if (element) flyTo(element); }}
              activeStep={activeStep} onSteps={commitSteps} background={background} onBackground={(color) => dispatch({ type: "touch", background: color })} />
          </div>
        </WorkspacePanel>
      </div>
      <WikiImportDialog open={wikiImportOpen} onOpenChange={setWikiImportOpen} onImport={detail.importSection} />
      <GridGuidesDialog open={gridDialog} onOpenChange={setGridDialog} settings={settings} update={updateSettings} toggleGuides={view.toggleGuides} disabled={disabled} />
      <Dialog open={workspaceDialog !== null} onOpenChange={(open) => { if (!open) setWorkspaceDialog(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{workspaceDialog === "sharing" ? studio("sharing") : workspaceDialog === "history" ? t("presentations.history") : t("presentations.playbackSettings")}</DialogTitle></DialogHeader>
          {workspaceDialog === "sharing" && sharingPanel}
          {workspaceDialog === "history" && <fieldset disabled={disabled}><PresentationHistoryPanel revisions={revisions} readOnly={readOnly} restoring={restoring} onRestore={restoreRevision} /></fieldset>}
          {workspaceDialog === "playback" && <PresentationPlaybackSettings disabled={disabled} settings={settings} updateSettings={updateSettings} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PresentationEditor({ presentation, revisions }: { presentation: PresentationRecord; revisions: PresentationRevisionItem[] }) {
  const canEdit = presentation.role === "owner" || presentation.role === "edit";
  const collaboration = useCollaboration("presentation", presentation.id, canEdit);
  if (canEdit && !collaboration.ready) return <CollaborationStatus provider={collaboration} />;
  const source = canEdit ? { ...presentation, ...presentationJSON(collaboration.doc) } : presentation;
  return <CollaborationContext.Provider value={canEdit ? collaboration : null}>
    <ReactFlowProvider><Editor key={presentation.id} presentation={source} revisions={revisions} /></ReactFlowProvider>
  </CollaborationContext.Provider>;
}
