"use client";
import { PresentationContent } from "./presentation-content";
import { growPresentationText } from "../lib/presentation-layout";
import { UserIdentity } from "@/components/user-identity";
import { clientUUID } from "@/lib/client-uuid";
import { userIdentityColor } from "@/lib/user-mark-colors";

import { EditorCommandSearch, type EditorSearchCommand } from "./editor-command-search";
import { PresentationActionMenu, PresentationShortcutHelp } from "./presentation-action-menu";
import { downloadPresentationPptx } from "./presentation-pptx-download";
import { isLinearShape, adaptiveGridGap, selectionRoots, mutableSelection, reorderSelection } from "../lib/presentation-interactions";
import { presentationIconNames, type PresentationShapeKind } from "../lib/presentation";

import "@xyflow/react/dist/style.css";
import styles from "./presentation-editor.module.css";

import { useCallback, useEffect, useEffectEvent, useSyncExternalStore, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useEditorNavigation } from "./use-editor-navigation";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as Y from "yjs";
import { PresentationBridge } from "../collaboration/presentation-bridge";
import { CollaborationContext, CollaborationStatus, useCollaboration, useCollaborationContext } from "../collaboration/ui";
import { presentationJSON, decode, REMOTE } from "../collaboration/codec";
import type { PresentationFormat } from "../lib/presentation-format";
import { arrangePresentation, layoutRoots, presentationAlignments } from "../lib/presentation-layout";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { createId } from "@paralleldrive/cuid2";
import { Background, SelectionMode, Controls, ReactFlow, ReactFlowProvider, ViewportPortal, useStore, useReactFlow, useViewport, type NodeChange } from "@xyflow/react";
import { KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { History, Loader2, Lock, Maximize2, MonitorPlay, Play, Save, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "./workspace-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { restorePresentationRevision } from "../presentation-actions";
import type { PresentationRecord, PresentationRevisionItem } from "../presentation-queries";
import { PRESENTATION_CAMERA_PADDING, PRESENTATION_SNAP_TOLERANCE, presentationDescendants, presentationAncestors, isPresentationElementLocked, applyGeometryChanges, normalizeRotation, initialPresentationCanvasState, presentationCanvasReducer, presentationCameraBounds, moveStep, presentationShapeKinds, rotateElements, scaleElements, unionBounds, type PresentationCanvasState, type PresentationElement, type PresentationGeometryChange, type PresentationSettings, type PresentationStep, type SnapGuide } from "../lib/presentation";
import { elementsToNodes, presentationNodeTypes, type PresentationNode } from "./presentation-canvas";
import { usePresentationShapeEdits } from "./presentation-editor/use-presentation-shape-edits";
import { PresentationDrawOverlay, type DrawGlue } from "./presentation-editor/presentation-draw-overlay";
import type { PresetGalleryEntry } from "../lib/preset-shapes/preset-gallery";
import { setLineEnd } from "../lib/presentation-connectors";
import { ROTATE_STEP, formatTextHosts, keyboardResize, nudge, type ArrowKey } from "../lib/presentation-keyboard-edits";
import { rotateElementsIndividually, textFormatKey } from "./presentation-editor/presentation-shortcuts";
import { nextFrameBounds } from "../lib/presentation-frame-rail";
import { alignPresentationToFrame, setPreciseGeometry } from "../lib/presentation-precision";
import { PresentationLibraryPanel } from "./presentation-library-panel";
import type { SaveState } from "./presentation-editor/presentation-editor-utils";
import { DraftInput } from "./presentation-editor/draft-fields";
import { GridOverlay, SnapGuides } from "./presentation-editor/canvas-decorations";
import { PresentationMiniMap, PresentationMiniMapToggle } from "./presentation-editor/presentation-minimap";
import { PresentationDocumentTitle } from "./presentation-editor/presentation-document-title";
import { formatShortcut, presentationShapeToolCommands, presentationShortcutLabels, toolShortcut } from "./presentation-editor/presentation-shortcuts";
import { SelectionOverlay } from "./presentation-editor/selection-overlay";
import { PresentationPathPanel } from "./presentation-editor/presentation-path-panel";
import { PresentationPlaybackSettings } from "./presentation-editor/presentation-playback-settings";
import { startDuplicateDrag } from "./presentation-editor/presentation-duplicate-drag";
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
import { isControlKey, isModifierShortcut, presentationKeyScope } from "./presentation-editor/presentation-keyboard-scope";
import { isTextHost, textHostContent, withHostText } from "../lib/presentation-text-host";
import { applySelectChanges, dragTargetId, parentSelection, selectionPath, selectionTargetId } from "../lib/presentation-selection";
import { usePresentationFormatting } from "./presentation-editor/use-presentation-formatting";
import { FloatingTextToolbar } from "./presentation-editor/floating-text-toolbar";
import { usePresentationViewSettings } from "./presentation-editor/use-presentation-view-settings";
import { PresentationRibbon } from "./presentation-editor/ribbon/presentation-ribbon";
import { useRibbonState } from "./presentation-editor/ribbon/use-ribbon-state";
import type { RibbonModel, RibbonPanel } from "./presentation-editor/ribbon/ribbon-model";
import { PresentationPropertiesPane, type PropertiesRequest } from "./presentation-editor/properties/properties-pane";
import { CanvasGuides } from "./presentation-editor/canvas-guides";
import { CanvasRulers, RULER_SIZE } from "./presentation-editor/canvas-rulers";
import { GridGuidesDialog } from "./presentation-editor/grid-guides-dialog";
import { EditPointsOverlay, type EditPointsLabels } from "./presentation-editor/edit-points-overlay";
import { formatCentimetres } from "../lib/presentation-grid";
import { applyDefaults } from "../lib/presentation-shape-defaults";
import { PRESENTATION_DARK_INK, inkOn, presentationSurface } from "../lib/presentation-ink";
import { presentationElementCaption, presentationSceneElements, presentationSceneSteps } from "../lib/presentation";
import { useDetailScene } from "./presentation-editor/use-detail-scene";
import { DetailSceneBar } from "./presentation-editor/detail-scene-bar";
import { WikiImportDialog } from "./presentation-editor/wiki-import-dialog";
import { PresentationDetailBadges } from "./presentation-detail-badges";

const subscribePlatform = () => () => {};
const getMacPlatform = () => /Mac|iPhone|iPad/.test(navigator.platform);
/** Whether this viewer last left the frame rail open -- a per-browser convenience only. */
const RAIL_KEY = "presentation-frame-rail-open";
const subscribeRail = () => () => {};
// Only where the rail docks beside the canvas: on small screens it is a drawer over it.
const getRailOpen = () => { try { return window.localStorage.getItem(RAIL_KEY) === "1" && window.matchMedia("(min-width: 1280px)").matches; } catch { return false; } };
const CAMERA_DURATION = 700;

async function requestEditLease(id: string, sessionId: string, action: "acquire" | "takeover" | "heartbeat" | "release"): Promise<{ editable?: boolean; holderName?: string }> {
  const response = await fetch(`/api/wiki/presentations/${id}/lease`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, action }), keepalive: action === "release",
  });
  if (!response.ok) throw new Error("Edit lease request failed");
  return response.json();
}

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
  // Canvas geometry is already stored; viewport sizing is the readiness signal.
  const viewportSized = useStore((state) => state.width > 0 && state.height > 0);
  const viewportEngine = useStore((state) => state.panZoom);
  const format = useFormatter();
  const router = useRouter();
  const reactFlow = useReactFlow<PresentationNode>();
  const { resolvedTheme } = useTheme();
  const canvasRef = useRef<HTMLDivElement>(null);
  const { zoom: canvasZoom } = useViewport();
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number } | null>(null);
  const [shortcutHelp, setShortcutHelp] = useState(false);
  const [miniMapVisible, setMiniMapVisible] = useState(false);
  const [insertPicker, setInsertPicker] = useState<"shape" | "chart" | "icon" | null>(null);
  /** PowerPoint's Shapes gallery, and the drawing tool armed from it. */
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [drawTool, setDrawTool] = useState<PresetGalleryEntry | null>(null);
  /** Lock Drawing Mode: the armed tool stays armed after each object until Escape. */
  const [drawLock, setDrawLock] = useState(false);
  const [gridDialog, setGridDialog] = useState(false);
  const isMac = useSyncExternalStore(subscribePlatform, getMacPlatform, () => false);
  const placementClick = useRef(false);
  const [pendingElement, setPendingElement] = useState<PresentationElement | null>(null);
  const [previewGuides, setPreviewGuides] = useState<SnapGuide[]>([]);
  const [dragPreview, setDragPreview] = useState<PresentationElement[] | null>(null);
  const dragCancel = useRef<(() => void) | null>(null);
  const cancelledGesture = useRef(false);
  const marqueeBase = useRef<string[]>([]);
  const axisDrag = useRef<{ positions: Map<string, { x: number; y: number }>; shift: boolean } | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (axisDrag.current) axisDrag.current.shift = event.shiftKey; };
    window.addEventListener("keydown", key); window.addEventListener("keyup", key);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", key); };
  }, []);
  useEffect(() => () => dragCancel.current?.(), []);
  // An Escape-cancelled gesture ignores the rest of that gesture; any new press, wherever it
  // lands (an overlay handle included), starts a fresh one.
  useEffect(() => {
    const press = () => { cancelledGesture.current = false; };
    window.addEventListener("pointerdown", press, true);
    return () => window.removeEventListener("pointerdown", press, true);
  }, []);
  const commandRoot = useRef<HTMLDivElement>(null);
  const { commandsOpen, setCommandsOpen, openCommands, restoreCommandFocus } = usePresentationCommandPalette(commandRoot);

  const [formatClipboard, setFormatClipboard] = useState<PresentationFormat | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [sessionId] = useState(() => clientUUID());
  const canEdit = presentation.role === "owner" || presentation.role === "edit";

  const [lockedBy] = useState<string | null>(null);
  const leaseReady = !canEdit || !!collaboration?.ready;
  const [conflict] = useState(false);
  const [activePanel, setActivePanel] = useState<"properties" | "design" | "assets" | "comments" | null>(null);
  /** Which Eigenschaften tab to bring forward: a double-click asks for the object's own tab, a ribbon launcher for its group. */
  const [paneRequest, setPaneRequest] = useState<PropertiesRequest>({ tab: "primary", key: 0 });
  // The frame rail stays open for authors who keep it open, like PowerPoint's slide pane:
  // the last choice in this browser is the starting state.
  const railRemembered = useSyncExternalStore(subscribeRail, getRailOpen, () => false);
  const [pathChoice, setPathChoice] = useState<boolean | null>(null);
  const pathOpen = pathChoice ?? railRemembered;
  const setPathOpen = useCallback((next: boolean | ((open: boolean) => boolean)) => {
    const open = typeof next === "function" ? next(pathOpen) : next;
    setPathChoice(open);
    try { window.localStorage.setItem(RAIL_KEY, open ? "1" : "0"); } catch { /* storage unavailable: the choice lasts for this visit */ }
  }, [pathOpen]);
  const [workspaceDialog, setWorkspaceDialog] = useState<"sharing" | "history" | "playback" | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const readOnly = !canEdit || !leaseReady || lockedBy !== null || conflict || collaboration?.status === "denied" || collaboration?.status === "error";
  const disabled = readOnly || restoring !== null;
  const paused = useRef(false);
  const savedVersion = useRef(presentation.updatedAt);
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

  const updateStepDuration = useCallback(
    (id: string, durationMs: number | undefined) => {
      commitSteps((current) => current.map((step) => (step.id === id ? { ...step, durationMs } : step)));
    },
    [commitSteps],
  );

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
  const { dropTargetId, trackDrag, clearPlacement, reveal, openedWithElements } = usePresentationFrames({ elements, steps, reactFlow, canvasRef });
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
  // The detail page handle shows on the element under the pointer (and on the selection). It
  // sits just outside the element, so leaving the element waits a moment for the pointer to
  // reach the handle instead of hiding it on the way.
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (badgeTimer.current) clearTimeout(badgeTimer.current); }, []);
  const hoverBadge = useCallback((id: string | null) => {
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    if (id) setHoveredBadge(id); else badgeTimer.current = setTimeout(() => setHoveredBadge(null), 350);
  }, []);
  const badgeIds = useMemo(() => new Set([...selectedIds, ...(hoveredBadge ? [hoveredBadge] : [])]), [selectedIds, hoveredBadge]);
  const nodes = useMemo(
    () => elementsToNodes(dragPreview ? [...detail.elements, ...dragPreview] : detail.elements, { editable: !disabled, selectedIds: dragPreview ? new Set(dragPreview.filter(e => !dragPreview.some(p => p.id === e.parentId)).map(e => e.id)) : selectedSet, onTextChange,
      onRichTextChange, onLineEndDrop, onAdjust, onResizeChange, editingId: textEditing.editingId, deferredId: textEditing.deferredId, onEditingChange: textEditing.onEditingChange, onTextEditorReady,
      onGestureStart: startGesture, onGestureEnd: endGesture, dropTargetId, background: presentationSurface(background) }).map(node => {
      const collaborators = collaboratorPresence?.filter(person => person.selectedIds?.includes(node.id)) ?? [];
      return collaborators.length ? { ...node, style: { ...node.style, outline: `2px solid ${userIdentityColor(collaborators[0].userId)}`, outlineOffset: 3 }, ariaLabel: collaborators.map(person => person.name).join(", ") } : node;
    }),
    [detail.elements, dragPreview, selectedSet, onTextChange, disabled, startGesture, endGesture, collaboratorPresence, onRichTextChange, onLineEndDrop, onAdjust, onResizeChange, dropTargetId, textEditing.editingId, textEditing.deferredId, textEditing.onEditingChange, onTextEditorReady, background],
  );

  /**
   * React Flow reports a whole gesture as one batch of changes, which is what makes group
   * dragging and snapping possible: the moving elements are collected first, aligned as a
   * single box against everything that stayed put, and only then written back.
   */
  const onNodesChange = useCallback(
    (changes: NodeChange<PresentationNode>[]) => {
      const selectChanges = changes.filter((change) => change.type === "select");
      if (selectChanges.length && !clickSelection.ignoreSelectChanges()) {
        const preservedIds = marqueeBase.current;
        setSelectedIds((current) => applySelectChanges(elements, current, selectChanges, preservedIds));
      }

      const geometry = new Map<string, PresentationGeometryChange>();
      const moved = new Set<string>();
      let gesture = false;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          // A press on a group member moves the nearest selected level around it: the whole
          // group, or the member itself once the author has drilled into the group.
          const element = elements.find((element) => element.id === change.id);
          const targetId = dragTargetId(elements, change.id, selectedSet);
          const target = elements.find((element) => element.id === targetId);
          if (targetId !== change.id && target && element) geometry.set(targetId, { id: targetId, x: target.x + change.position.x - element.x, y: target.y + change.position.y - element.y });
          else geometry.set(change.id, { ...geometry.get(change.id), id: change.id, x: change.position.x, y: change.position.y });
          moved.add(targetId);
          if (change.dragging) gesture = true;
        } else if (change.type === "dimensions" && change.dimensions && (change.resizing || change.setAttributes)) {
          // React Flow also reports the dimensions it measured on mount; the reducer drops
          // those, so opening a presentation never looks unsaved.
          geometry.set(change.id, { ...geometry.get(change.id), id: change.id, ...change.dimensions, resizing: true });
          if (change.resizing) gesture = true;
        }
      }
      const ended = changes.some((change) => (change.type === "position" && change.dragging === false)
        || (change.type === "dimensions" && change.resizing === false));
      if (disabled || dragCancel.current || cancelledGesture.current || !geometry.size) {
        if (ended) endGesture();
        return;
      }
      if (axisDrag.current?.shift) {
        const first = [...geometry.values()].find(change => change.x !== undefined && change.y !== undefined);
        const original = first && axisDrag.current.positions.get(first.id);
        if (first && original) {
          const horizontal = Math.abs(first.x! - original.x) >= Math.abs(first.y! - original.y);
          for (const change of geometry.values()) { const e = axisDrag.current.positions.get(change.id); if (e && !change.resizing) { geometry.set(change.id, horizontal ? { ...change, y: e.y } : { ...change, x: e.x }); } }
        }
      }
      dispatch({
        type: "geometry",
        at: Date.now(),
        changes: [...geometry.values()],
        // The snap has to feel the same at any zoom, so the screen tolerance is converted.
        tolerance: axisDrag.current?.shift ? 0 : PRESENTATION_SNAP_TOLERANCE / reactFlow.getZoom(),
        gesture, membership: ended && moved.size ? selectionRoots(elements, moved).map((element) => element.id) : undefined, // drop joins/leaves frames in the same undo step
        snap: snapOptions(),
      });
      if (ended) endGesture();
    },
    [reactFlow, disabled, elements, endGesture, dispatch, clickSelection, selectedSet, snapOptions],
  );

  const rotateSelection = useCallback(
    (deltaDegrees: number, center: { x: number; y: number }) => {
      commitElements((current) => rotateElements(current, selectedSet, deltaDegrees, center));
    },
    [commitElements, selectedSet],
  );

  /** The selection as a scale gesture started: every factor is applied to this, not to the last move. */
  const scaleBase = useRef<PresentationElement[] | null>(null);
  const startScale = useCallback(() => { scaleBase.current = bridge.current().elements; }, [bridge]);
  const scaleSelection = useCallback(
    (scaleX: number, scaleY: number, origin: { x: number; y: number }) => {
      const base = scaleBase.current;
      if (!base) return;
      const scaled = new Map(scaleElements(base, selectedSet, origin, scaleX, scaleY).map((element) => [element.id, element]));
      const moving = presentationDescendants(base, selectedSet);
      // Only the selection takes its geometry from the snapshot; everything else stays live.
      commitElements((current) => current.map((element) => {
        const next = moving.has(element.id) ? scaled.get(element.id) : undefined;
        return next ? { ...element, x: next.x, y: next.y, width: next.width, height: next.height } : element;
      }));
    },
    [commitElements, selectedSet],
  );

  /** Where a new element lands: the middle of what the author is currently looking at. */
  const viewportCenter = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }, [reactFlow]);

  const addElement = useCallback(
    (element: PresentationElement, place = true) => {
      if (disabled) return;
      if (elements.length >= 500) { toast.error(t("presentations.elementLimit")); return; }
      if (place) { setPendingElement(element); canvasRef.current?.focus(); return; }
      dispatch(frameInsertionEdit([element], current => [...current, element], t));
      setSelectedIds([element.id]);
    },
    [dispatch, disabled, elements.length, t],
  );

  const placePending = (point: { x: number; y: number }, keyboard = false) => {
    if (!pendingElement || disabled) return;
    const centred = { ...pendingElement, x: point.x - pendingElement.width / 2, y: point.y - pendingElement.height / 2 }, placed = keyboard ? clearPlacement(centred) : centred;
    addElement(placed, false); if (keyboard) reveal(placed);
    setPendingElement(null); canvasRef.current?.focus();
    textEditing.onPlaced(pendingElement, elements.length < 500);
  };

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

  const { deleteSelection, duplicateSelection, copyObjectFormat, pasteObjectFormat } = usePresentationSelectionEdits({
    elements, dispatch, disabled, t, commitElements, selection, formatClipboard, setFormatClipboard, setSelectedIds,
  });

  const { addText, addTextAt, addFrame: addCanvasFrame, addShape, addStudioElement, uploadMedia, uploadImage } = usePresentationInsertion({
    addElement, viewportCenter, t, studio, presentation, disabled, uploading, setUploading,
  });

  const pendingFly = useRef(0);
  useEffect(() => () => cancelAnimationFrame(pendingFly.current), []);
  const flyTo = useCallback(
    (element: PresentationElement) => {
      cancelAnimationFrame(pendingFly.current);
      // Tool panels can open in the same selection event. Let the canvas resize
      // before fitting an explicitly requested stop; ordinary panel toggles do not pan.
      pendingFly.current = requestAnimationFrame(() => {
        pendingFly.current = requestAnimationFrame(() => {
          void reactFlow.fitBounds(presentationCameraBounds(element), { padding: PRESENTATION_CAMERA_PADDING, duration: CAMERA_DURATION });
        });
      });
    },
    [reactFlow],
  );

  const requestedElement = navigationQuery.get("element");
  const appliedNavigation = useRef("");
  const appliedViewportEngine = useRef(viewportEngine);
  useEffect(() => {
    if (!viewportEngine || !reactFlow.viewportInitialized || !viewportSized || !requestedElement) return;
    const navigationKey = `${presentation.id}:${requestedElement}`;
    if (appliedNavigation.current === navigationKey && appliedViewportEngine.current === viewportEngine) return;
    // Next can reactivate a cached editor with a recreated pan/zoom controller.
    // Restore once per controller, as well as once per destination.
    const timer = setTimeout(() => {
      appliedNavigation.current = navigationKey;
      appliedViewportEngine.current = viewportEngine;
      const target = elements.find((element) => element.id === requestedElement);
      if (target) { detail.reveal(target.id); setSelectedIds([target.id]); setActiveStepId(steps.find((step) => step.elementId === target.id)?.id ?? null); flyTo(target); setActivePanel("properties"); }
      else void reactFlow.fitView({ padding: 0.2 });
    }, 0);
    return () => clearTimeout(timer);
  }, [elements, flyTo, viewportSized, presentation.id, reactFlow, requestedElement, steps, viewportEngine, detail]);

  const addStep = useCallback(() => {
    if (!selected || disabled) return;
    const step = { id: createId(), elementId: selected.id };
    commitSteps((current) => [...current, step]);
    setActiveStepId(step.id);
  }, [commitSteps, selected, disabled]);

  const updateStepNotes = useCallback(
    (stepId: string, notes: string) => {
      commitSteps((current) =>
        current.map((step) => (step.id === stepId ? { ...step, notes: notes || undefined } : step)),
      );
    },
    [commitSteps],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onStepDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (readOnly || !over || active.id === over.id) return;
    commitSteps((current) => moveStep(
      current,
      current.findIndex((step) => step.id === active.id),
      current.findIndex((step) => step.id === over.id),
    ));
  }, [commitSteps, readOnly]);

  /** Present and PDF export both read the canvas back from the database, so both have to
   * wait for a pending edit to be written before they hand over. */
  const listHref = "/wiki/presentations";
  const presentHref = `/wiki/presentations/${presentation.id}/present`;
  const printHref = `/print/presentations/${presentation.id}`;

  /** Hands over to a page rendered from the saved canvas once the pending edit has landed
   * -- flushing nothing when there is nothing to write. A tab that has to be new is opened
   * inside the click -- opening it after the await is what popup blockers exist for -- and
   * only then pointed at the target. A write that fails leaves the author here with their
   * edit and the toast. */
  const flushThen = useCallback((href: string, newTab: boolean, proceed?: () => void) => {
    if (paused.current) return;
    const tab = newTab ? window.open("about:blank", "_blank") : null;
    if (newTab && !tab) {
      toast.error(t("presentations.popupBlocked"));
      return;
    }
    paused.current = true;
    void flush().then(async (saved) => {
      if (!saved) { tab?.close(); toast.error(t("presentations.leaveSaveFailed")); return; }
      if (!newTab) {
        // Hand the lease back before navigation so the next editor can claim it at once.
        await requestEditLease(presentation.id, sessionId, "release").catch(() => undefined);
        if (proceed) proceed(); else router.push(href);
      } else if (tab) {
        tab.location.href = href;
      }
    }).catch(() => { tab?.close(); toast.error(t("presentations.leaveSaveFailed")); })
      .finally(() => { paused.current = false; });
  }, [flush, presentation.id, router, sessionId, t]);

  useEditorNavigation(flushThen, '[data-testid="presentation-editor"]');
  /** Flush even a clean canvas: a focused field may still hold an uncommitted draft.
   * A modifier click keeps this editor open with its lease and opens a saved copy. */
  const leaveVia = (event: React.MouseEvent, href: string) => {
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey;
    event.preventDefault();
    flushThen(href, newTab);
  };
  /** Middle-click never reaches onClick, and its default is the same new tab. */
  const auxFlush = (event: React.MouseEvent, href: string) => {
    if (event.button !== 1) return;
    event.preventDefault();
    flushThen(href, true);
  };


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
  const addFrame = () => { if (detail.sceneId) addNestedFrame(); else addCanvasFrame(); };
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
  /** What a gallery tool drew: inserted like any new object, glued where it was drawn, selected. */
  const createDrawn = (drawn: PresentationElement, glue: DrawGlue) => {
    if (!drawLock) setDrawTool(null);
    canvasRef.current?.focus();
    if (disabled || elements.length >= 500) return;
    // New objects start in the presentation's default format (Set as Default Shape / Line / Text Box).
    const element = applyDefaults(drawn, settings.defaults);
    dispatch(frameInsertionEdit([element], current => {
      const byId = new Map(current.map(e => [e.id, e]));
      let next = element;
      for (const [end, target] of [[0, glue.from], [1, glue.to]] as const) {
        const glued = target && byId.get(target.elementId);
        if (next.type === "shape" && glued) next = setLineEnd(next, end, { element: glued, site: target.site }, byId);
      }
      return [...current, next];
    }, t));
    setSelectedIds([element.id]);
    // A drawn shape brings Formformat forward, as in PowerPoint.
    if (element.type === "shape") ribbon.showContextual();
    if (element.type === "text" && !drawLock) textEditing.startEditing(element.id);
  };
  const pathPanel = (<PresentationPathPanel presentation={presentation} steps={detail.steps} elements={elements} selected={selected}
    activeStep={activeStep} activeStepId={activeStepId} setActiveStepId={setActiveStepId} setSelectedIds={setSelectedIds} flyTo={flyTo}
    commitSteps={commitSteps} addStep={addStep} disabled={disabled} readOnly={readOnly} sensors={sensors} onStepDragEnd={onStepDragEnd}
    settings={settings} updateStepDuration={updateStepDuration} updateStepNotes={updateStepNotes} collaboration={collaboration} dispatch={dispatch}
    scene={scene} onNewFrame={addFrameAtEnd} />);
  const openHistory = useCallback(async () => {
    if (await flush()) { router.refresh(); setWorkspaceDialog("history"); }
  }, [flush, router]);
  // Below the docking width a side pane is a drawer over the canvas, so only one shows at a time.
  const narrow = () => !window.matchMedia("(min-width: 1280px)").matches;
  const togglePath = () => { setPathOpen(value => !value); if (narrow()) setActivePanel(null); };
  const openPanel = (panel: RibbonPanel) => { setActivePanel(panel); if (narrow()) setPathOpen(false); };
  const togglePanel = (panel: RibbonPanel) => { if (activePanel === panel) setActivePanel(null); else openPanel(panel); };
  const requestProperties = (tab: PropertiesRequest["tab"]) => { setPaneRequest((current) => ({ tab, key: current.key + 1 })); openPanel("properties"); };
  const commandText = t("presentations.commands.title");
  const unavailable = t("presentations.commands.unavailable");
  const insertReason = disabled ? unavailable : elements.length >= 500 ? t("presentations.elementLimit") : undefined;
  const baseCommands: EditorSearchCommand[] = [
    { id: "addText", label: t("presentations.addText"), execute: addText, disabledReason: insertReason, group: commandText },
    { id: "addFrame", label: t("presentations.addFrame"), execute: addFrame, disabledReason: insertReason, group: commandText },
    { id: "addNestedFrame", label: t("presentations.addNestedFrame"), execute: addNestedFrame, disabledReason: nestedFrameDisabled ? unavailable : undefined, group: commandText },
    { id: "addShape", label: t("presentations.addShape"), execute: () => setGalleryOpen(true), disabledReason: insertReason, group: commandText },
    ...presentationShapeToolCommands({ addShape, label: shape => t(`presentations.shapeKinds.${shape}`), disabledReason: insertReason, group: commandText }),
    { id: "addChart", label: studio("addChart"), execute: () => setInsertPicker("chart"), disabledReason: insertReason, group: commandText },
    { id: "addIcon", label: studio("addIcon"), execute: () => setInsertPicker("icon"), disabledReason: insertReason, group: commandText },
    { id: "addImage", label: t("presentations.addImage"), execute: () => imageInputRef.current?.click(), disabledReason: insertReason || (uploading ? unavailable : undefined), group: commandText },
    { id: "uploadMedia", label: studio("uploadMedia"), execute: () => mediaInputRef.current?.click(), disabledReason: insertReason || (uploading ? unavailable : undefined), group: commandText },
    { id: "duplicateSelection", label: t("presentations.duplicateElement"), execute: () => duplicateSelection(selectedIds), disabledReason: disabled || !mutableSelection(elements, selectedIds) ? unavailable : !selection.length ? t("presentations.commands.selectFirst") : elements.length + presentationDescendants(elements, new Set(selectedIds)).size > 500 ? t("presentations.elementLimit") : undefined, contextPriority: selection.length ? 1 : 0, group: commandText },
    { id: "deleteSelection", label: t("presentations.deleteElement"), execute: () => deleteSelection(selectedIds), disabledReason: disabled ? unavailable : !selection.length ? t("presentations.commands.selectFirst") : selection.every(element => isPresentationElementLocked(elements, element.id)) ? unavailable : undefined, group: commandText },
    { id: "undo", label: t("editor.toolbar.undo"), execute: () => dispatch({ type: "undo" }), disabledReason: disabled || !(undo ? undo.canUndo() : canvas.past.length) ? unavailable : undefined, group: commandText },
    { id: "redo", label: t("editor.toolbar.redo"), execute: () => dispatch({ type: "redo" }), disabledReason: disabled || !(undo ? undo.canRedo() : canvas.future.length) ? unavailable : undefined, group: commandText },
    { id: "overview", label: t("presentations.overview"), execute: () => { void reactFlow.fitView({ padding: 0.15, duration: CAMERA_DURATION }); }, group: commandText },
    { id: "path", label: t("presentations.path"), execute: togglePath, active: pathOpen, group: commandText },
    ...(["properties", "design", "assets", "comments"] as const).map(panel => ({ id: panel, label: t(`workspace.${panel}`), execute: () => openPanel(panel), active: activePanel === panel, group: commandText })),
    { id: "save", label: t("presentations.save"), execute: () => { void flush(); }, disabledReason: disabled ? unavailable : undefined, group: commandText },
    { id: "share", label: t("workspace.share"), execute: () => setWorkspaceDialog("sharing"), group: commandText },
    { id: "exportPdf", label: t("presentations.exportPdf"), execute: () => flushThen(printHref, true), disabledReason: !steps.length || restoring !== null || uploading ? unavailable : undefined, group: commandText },
    { id: "exportPptx", label: `${t("presentations.ribbon.exportAs")} ${t("presentations.exportPptx")}`, execute: () => void downloadPresentationPptx(presentation.id, flush, { saveFailed: t("presentations.leaveSaveFailed"), failed: t("presentations.exportPptxFailed"), placeholders: t("presentations.exportPptxPlaceholders") }), disabledReason: restoring !== null || uploading ? unavailable : undefined, group: commandText },
    { id: "history", label: t("presentations.history"), execute: openHistory, group: commandText },
    { id: "playback", label: t("presentations.playbackSettings"), execute: () => setWorkspaceDialog("playback"), group: commandText },
    { id: "openDetail", label: selected && detail.frameByBox.has(selected.id) ? tDetails("open") : tDetails("create"), execute: () => { if (selected) detail.open(selected.id); }, disabledReason: !selected || selected.type === "shape" && selected.content.connection ? t("presentations.commands.selectFirst") : !detail.frameByBox.has(selected.id) && insertReason ? insertReason : undefined, group: commandText },
    { id: "closeDetail", label: tDetails("close"), execute: detail.close, disabledReason: detail.sceneId ? undefined : unavailable, group: commandText },
    { id: "removeDetail", label: tDetails("remove"), execute: () => { if (selected) detail.remove(selected.id); }, disabledReason: !disabled && selected && detail.frameByBox.has(selected.id) ? undefined : unavailable, group: commandText },
    { id: "importWiki", label: tDetails("importWiki"), execute: () => setWikiImportOpen(true), disabledReason: !disabled && detail.sceneId ? undefined : unavailable, group: commandText },
    { id: "toggleMiniMap", label: t("presentations.ribbon.miniMap"), execute: () => setMiniMapVisible(value => !value), active: miniMapVisible, disabledReason: elements.length ? undefined : unavailable, group: commandText },
  ];
  const duplicateDrag = (event: React.PointerEvent<HTMLDivElement>) => startDuplicateDrag(event, {
    disabled, isMac, elements, selectedIds, reactFlow, t, setPreviewGuides, setDragPreview, dragCancel, setSelectedIds, dispatch,
  });
  const selectedRoots = selectionRoots(elements, selectedIds);
  const canMutate = !disabled && mutableSelection(elements, selectedIds);
  function interact(key: string) { return t(`presentations.interactions.${key}`); }
  const shortcutLabels = presentationShortcutLabels(isMac, { ctrl: tShortcuts("ctrl"), delete: t("shortcuts.keys.delete"), enter: t("shortcuts.keys.enter"), shift: tShortcuts("shift"), alt: tShortcuts("alt") });
  const executeCommand = (id: string) => { const command = commands.find(c => c.id === id); if (command && !command.disabledReason) command.execute(); };
  const { groupSelection, ungroupSelection, editText, setSelectionLocked } = usePresentationSelectionCommands({
    selected, selectedIds, selectedRoots, canMutate, elements, steps, dispatch, setSelectedIds, startTextEditing: textEditing.startEditing, t,
  });
  const { copySelection, pasteSelection } = usePresentationClipboard({
    selection, selectedIds, canMutate, elements, disabled, contextPosition, reactFlow, viewportCenter,
    presentation, dispatch, setSelectedIds, deleteSelection, latest, t, commandRoot, canvasRef,
  });
  const placementFocus = usePlacementFocus(canvasRef, Boolean(pendingElement));
  const commands: EditorSearchCommand[] = [
    ...baseCommands,
    { id: "copy", label: interact("copy"), execute: () => copySelection(), group: commandText, disabledReason: (selection.length > 0) ? undefined : unavailable },
    { id: "cut", label: interact("cut"), execute: () => copySelection(true), group: commandText, disabledReason: (canMutate) ? undefined : unavailable },
    { id: "paste", label: interact("paste"), execute: pasteSelection, group: commandText, disabledReason: (!disabled) ? undefined : unavailable },
    { id: "selectAll", label: interact("selectAll"), execute: () => setSelectedIds(selectionRoots(elements, detail.elements.map(e => e.id)).map(e => e.id)), group: commandText, disabledReason: (detail.elements.length > 0) ? undefined : unavailable },
    { id: "group", label: interact("group"), execute: groupSelection, group: commandText, disabledReason: (canMutate && selectedRoots.length >= 2 && elements.length < 500) ? undefined : unavailable },
    { id: "ungroup", label: interact("ungroup"), execute: ungroupSelection, group: commandText, disabledReason: (canMutate && selectedRoots.some(e => e.type === "frame" && e.content.isGroup)) ? undefined : unavailable },
    { id: "editText", label: interact("editText"), execute: editText, group: commandText, disabledReason: (canMutate && isTextHost(selected)) ? undefined : unavailable },
    { id: "copyFormat", label: interact("copyFormat"), execute: copyObjectFormat, group: commandText, disabledReason: (selection.length === 1) ? undefined : unavailable },
    { id: "pasteFormat", label: interact("pasteFormat"), execute: pasteObjectFormat, group: commandText, disabledReason: (canMutate && Boolean(formatClipboard) && selection.some(e => e.type === formatClipboard?.type)) ? undefined : unavailable },
    { id: "lock", label: interact("lock"), execute: () => setSelectionLocked(true), group: commandText, disabledReason: (canMutate) ? undefined : unavailable },
    { id: "unlock", label: interact("unlock"), execute: () => setSelectionLocked(false), group: commandText, disabledReason: (!disabled && selection.some(e => e.locked) && selectedRoots.every(e => !presentationAncestors(elements, e.id).some(p => p.locked))) ? undefined : unavailable },
    ...(["front", "back", "forward", "backward"] as const).map(direction => ({ id: direction, label: interact(direction), execute: () => dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => reorderSelection(current, selectedIds, direction) }), group: commandText, disabledReason: (canMutate) ? undefined : unavailable })),
    ...presentationAlignments.map(mode => ({ id: `align-${mode}`, label: t(`presentations.layout.${mode}`), group: commandText, disabledReason: arrangementDisabled || selectedRoots.length < (["horizontal", "vertical"].includes(mode) ? 3 : 2) ? unavailable : undefined, execute: () => dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => arrangePresentation(current, selectedSet, mode) }) })),
    { id: "connect", label: interact("connect"), execute: connectSelection, group: commandText, disabledReason: (!arrangementDisabled && selectedRoots.length === 2 && elements.length < 500) ? undefined : unavailable },
    { id: "detach", label: interact("detach"), execute: () => { if (selected?.type === "shape") updateElement(selected.id, e => e.type === "shape" ? { ...e, content: { ...e.content, connection: undefined } } : e); }, group: commandText, disabledReason: (canMutate && selected?.type === "shape" && Boolean(selected.content.connection)) ? undefined : unavailable },
    { id: "shortcutHelp", label: interact("shortcutHelp"), execute: () => setShortcutHelp(true), group: commandText },
    { id: "formatShape", label: t(formatting.shapes.length ? "presentations.formatPane.title" : "presentations.formatPane.titleText"), execute: () => { formatting.openPane(formatting.shapes.length ? "shape" : "text"); requestProperties(formatting.shapes.length ? "fill" : "text"); }, group: commandText, disabledReason: (formatting.shapes.length || formatting.texts.length) ? undefined : unavailable },
    { id: "setDefault", label: t(`presentations.formatPane.defaults.${selected?.type === "text" ? "textBox" : selected?.type === "shape" && isLinearShape(selected) ? "line" : "shape"}`), execute: formatting.setAsDefault, group: commandText, disabledReason: formatting.canSetDefault ? undefined : unavailable },
    { id: "editPoints", label: t("presentations.formatPane.editShape.editPoints"), execute: formatting.startEditPoints, group: commandText, disabledReason: formatting.canEditPoints ? undefined : unavailable },
    ...(["union", "combine", "fragment", "intersect", "subtract"] as const).map(op => ({ id: `merge-${op}`, label: `${t("presentations.formatPane.merge.title")}: ${t(`presentations.formatPane.merge.${op}`)}`, execute: () => formatting.mergeSelection(op), group: commandText, disabledReason: formatting.canMerge ? undefined : unavailable })),
    { id: "toggleRuler", label: t("presentations.gridGuides.ruler"), execute: view.toggleRuler, active: settings.ruler, group: commandText },
    { id: "toggleGrid", label: t("presentations.gridGuides.gridlines"), execute: view.toggleGrid, active: settings.grid.show, group: commandText },
    { id: "toggleGuides", label: t("presentations.gridGuides.guides"), execute: view.toggleGuides, active: settings.guides.show, group: commandText },
    { id: "gridGuides", label: t("presentations.gridGuides.title"), execute: () => setGridDialog(true), group: commandText },
  ];

  const showMenuCommand = (id: string) => Boolean(selection.length ?
    ["copy", "cut", "paste", "duplicateSelection", "deleteSelection", "properties", "copyFormat", "pasteFormat", "front", "back", "forward", "backward", "shortcutHelp", "formatShape", "setDefault"].includes(id)
      || (id === "editPoints" && formatting.canEditPoints)
      || (id === "group" && selectedRoots.length >= 2) || (id === "ungroup" && selectedRoots.some(e => e.type === "frame" && e.content.isGroup))
      || (id === "editText" && isTextHost(selected)) || (id === "lock" && selection.some(e => !e.locked)) || (id === "unlock" && selection.some(e => e.locked))
      || (id.startsWith("align-") && selectedRoots.length >= 2) || (id === "connect" && !arrangementDisabled && selectedRoots.length === 2)
      || (id === "detach" && selected?.type === "shape" && selected.content.connection)
      || (id === "openDetail" && selection.length === 1) || (id === "removeDetail" && Boolean(selected && detail.frameByBox.has(selected.id)))
    : (detail.sceneId && (id === "closeDetail" || id === "importWiki")) || ["addText", "addFrame", "addShape", "addChart", "addIcon", "addImage", "paste", "selectAll", "overview", "toggleRuler", "toggleGrid", "toggleGuides", "gridGuides", "shortcutHelp"].includes(id));
  const handleKeyboard = useEffectEvent((event: KeyboardEvent) => {
    // An armed drawing tool owns the keyboard (Escape cancels it, Enter finishes a freeform).
    if (drawTool) return;
    const scope = presentationKeyScope(event, commandRoot.current);
    if (!scope) return;
    if (formatting.picking && event.key === "Escape") { event.preventDefault(); formatting.finishPick(null); return; }
    // Edit Points owns Escape, Delete and the arrows while it is on.
    if (formatting.editPointsElement) return;
    const { target, typing } = scope;
    if (!typing && view.onKeyDown(event)) return;
    const mod = isModifierShortcut(event), key = event.key.toLowerCase();
    // Only plain Mod+S saves: Mod+Shift+S stays strikethrough in the text editor.
    if (mod && key === "s" && !event.shiftKey && !event.altKey) { event.preventDefault(); executeCommand("save"); return; }
    if (!typing && textEditing.captureKey(event)) return;
    if (typing || commandsOpen || shortcutHelp) return;
    if (pendingElement && (key === "escape" || key === "enter")) { event.preventDefault(); if (key === "escape") setPendingElement(null); else placePending(viewportCenter(), true); return; }
    // A focused button or link keeps its own Enter, Space and arrows; shortcuts, Delete and Escape stay the canvas's.
    if (scope.onControl && isControlKey(event)) return;
    let id: string | undefined;
    // Mod+Shift+A/D stay the app-wide "Neue Aufgabe"/"Neue Deadline".
    // PowerPoint's text keys on a selected box or shape format all of its text.
    const textFormat = mod && !event.altKey ? textFormatKey(event) : undefined;
    if (textFormat) { event.preventDefault(); event.stopPropagation(); if (canMutate && selectedRoots.length) dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => formatTextHosts(current, new Set(selectedRoots.map(e => e.id)), textFormat) }); return; }
    if (mod) id = formatShortcut(event) ?? ({ a: event.shiftKey ? "" : "selectAll", c: event.shiftKey ? "" : "copy", x: "cut", v: event.shiftKey ? "" : "paste", d: event.shiftKey ? "" : "duplicateSelection", g: event.shiftKey ? "ungroup" : "group", z: event.shiftKey ? "redo" : "undo", y: "redo", "}": "front", "{": "back" } as Record<string, string>)[key];
    else if (key === "delete" || key === "backspace") id = "deleteSelection";
    else if (key === "enter") id = "editText";
    else if (key === "f2") {
      // F2 toggles text editing, entering with all text selected.
      event.preventDefault(); if (canMutate && isTextHost(selected) && !selectedLocked) textEditing.startEditing(selected.id); return;
    }
    else if (!pendingElement && canMutate && isTextHost(selected) && !selectedLocked && event.key.length === 1 && !event.altKey && key !== " ") {
      // Typing on a selected text box or shape adds to its text, like PowerPoint: edit mode
      // opens with the caret at the end and this key is buffered for the editor.
      textEditing.startEditing(selected.id, "end", textHostContent(selected).text); textEditing.captureKey(event); return;
    }
    else if (!pendingElement) id = toolShortcut(event);
    if (id === "copy" || id === "cut" || id === "paste") return; // handled in the clipboard events these keys fire
    if (id) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) executeCommand(id); return; }
    if (event.shiftKey && event.key === "F10") { event.preventDefault(); const box = canvasRef.current?.getBoundingClientRect(); if (box) setContextPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }); return; }
    if (key === "escape") { if (dragCancel.current) dragCancel.current(); else if (bridge.cancelGesture()) { cancelledGesture.current = true; window.dispatchEvent(new Event("presentation-cancel-gesture")); } else if (!selectedIds.length && detail.sceneId) detail.close(); else { setContextPosition(null); setSelectedIds(current => parentSelection(elements, current)); commandRoot.current?.focus(); } return; }
    if (key === "tab" && canvasRef.current?.contains(target)) {
      const roots = detail.elements.filter(e => !presentationAncestors(elements, e.id).some(parent => parent.type === "frame" && parent.content.isGroup)); if (!roots.length) return;
      event.preventDefault(); const current = roots.findIndex(e => selectedIds.includes(e.id));
      setSelectedIds([roots[(current + (event.shiftKey ? -1 : 1) + roots.length) % roots.length].id]); return;
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key) && canMutate) {
      event.preventDefault(); event.stopPropagation();
      const arrow = key as ArrowKey, targets = selectedRoots.filter(e => !(e.type === "shape" && e.content.connection));
      if (!targets.length) return;
      // PowerPoint: Alt+Left/Right turns by 15°, Shift(+Ctrl)+Arrow resizes by 10 % (1 %), Arrow moves.
      if (event.altKey) { if (arrow === "arrowleft" || arrow === "arrowright") commitElements(current => rotateElementsIndividually(current, targets.map(e => e.id), arrow === "arrowright" ? ROTATE_STEP : -ROTATE_STEP)); return; }
      const changes = event.shiftKey ? keyboardResize(targets, arrow, mod) : nudge(targets, arrow);
      dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: false, membership: targets.map(e => e.id), changes });
    }
  });
  useEffect(() => { const key = (event: KeyboardEvent) => handleKeyboard(event); window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true); }, []);
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
      return <Button type="button" size="sm" variant={ribbon ? "ghost" : "default"} disabled={!steps.length || restoring !== null || uploading || (fromCurrent && !activeStep)} nativeButton={false} role="link"
        className={ribbon ? "h-[70px] flex-col justify-start gap-1 px-2 pt-1.5 text-xs font-normal [&_svg]:size-6!" : undefined}
        title={ribbon ? t(fromCurrent ? "presentations.ribbon.fromCurrentTip" : "presentations.ribbon.fromStartTip") : undefined}
        render={<Link href={href} onClick={(event) => leaveVia(event, href)} onAuxClick={(event) => auxFlush(event, href)} />}>
        {fromCurrent ? <MonitorPlay className="size-3.5" /> : <Play className="size-3.5" />}
        {fromCurrent ? t("presentations.ribbon.fromCurrent") : ribbon ? t("presentations.ribbon.fromStart") : t("presentations.present")}
      </Button>;
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
      <Dialog open={Boolean(insertPicker)} onOpenChange={open => { if (!open) setInsertPicker(null); }}><DialogContent finalFocus={placementFocus}><DialogHeader><DialogTitle>{interact("choose")}</DialogTitle></DialogHeader><div className="grid grid-cols-3 gap-2">{(insertPicker === "shape" ? presentationShapeKinds : insertPicker === "chart" ? ["bar", "line", "pie"] : insertPicker === "icon" ? presentationIconNames : []).map(choice => <Button key={choice} variant="outline" onClick={() => { if (insertPicker === "shape") addShape(choice as PresentationShapeKind); else if (insertPicker) addStudioElement(insertPicker, choice); setInsertPicker(null); }}>{insertPicker === "shape" ? t(`presentations.shapeKinds.${choice}`) : interact(insertPicker === "icon" ? `icons.${choice}` : choice)}</Button>)}</div></DialogContent></Dialog>
      {collaboration && <CollaborationStatus provider={collaboration} className="sr-only" />}
      <PresentationRibbon model={ribbonModel} />
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
        <WorkspacePanel title={t("presentations.path")} open={pathOpen} onClose={() => setPathOpen(false)} side="left" narrow className="h-full max-h-full overflow-y-auto"><fieldset disabled={disabled} className="min-w-0">{pathPanel}</fieldset></WorkspacePanel>
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
            fitView={openedWithElements && !requestedElement}
            fitViewOptions={{ padding: 0.2 }}
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
            {/* Shown gridlines replace the background dots: the overlay draws them over the slide. */}
            {settings.grid.show
              ? <GridOverlay spacing={settings.grid.spacing} transparency={settings.grid.transparency} />
              // bgColor too: the dot layer otherwise paints the app theme's colour over the slide surface.
              : <Background gap={adaptiveGridGap(canvasZoom)} size={1 / canvasZoom} bgColor={presentationSurface(background)} color={inkOn(presentationSurface(background)) === PRESENTATION_DARK_INK ? "#94a3b8" : "#64748b"} />}
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
          {workspaceDialog === "history" && <fieldset disabled={disabled}>          <section className="mt-5 border-t pt-4">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <History className="size-3.5" />{t("presentations.history")}
            </h2>
            {revisions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("presentations.noRevisions")}</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {revisions.map((revision) => (
                  <li key={revision.id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{format.dateTime(revision.createdAt, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Vienna" })}</span>
                      <span className="block truncate text-muted-foreground"><UserIdentity userId={revision.createdBy} name={revision.createdByName} compact /></span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={readOnly || restoring !== null}
                      onClick={async () => {
                        if (!confirm(t("presentations.restoreConfirm"))) return;
                        paused.current = true;
                        setRestoring(revision.id);
                        try {
                          if (!await flush()) return;
                          // Unmount rich-text property editors before replacing their shared content.
                          flushSync(() => setSelectedIds([]));
                          const restored = await restorePresentationRevision({ revisionId: revision.id, sessionId, expectedUpdatedAt: savedVersion.current });
                          if (collaboration && "collaboration" in restored && restored.collaboration) Y.applyUpdate(collaboration.doc, decode(restored.collaboration.update), REMOTE);
                          savedVersion.current = restored.savedAt;
                          dispatch({ type: "reset", snapshot: restored.snapshot });
                          setSelectedIds([]);
                          setActiveStepId(null);
                          setStatus("saved");
                          setWorkspaceDialog(null);
                          router.refresh();
                        } catch {
                          toast.error(t("presentations.restoreFailed"));
                        } finally {
                          paused.current = false;
                          setRestoring(null);
                        }
                      }}
                    >
                      {restoring === revision.id ? <Loader2 className="size-3.5 animate-spin" /> : t("presentations.restore")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
</fieldset>}
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
