"use client";
import { PresentationContent } from "./presentation-content";
import { growPresentationText } from "../lib/presentation-layout";
import { UserIdentity } from "@/components/user-identity";
import { clientUUID } from "@/lib/client-uuid";
import { userIdentityColor } from "@/lib/user-mark-colors";

import { EditorCommandSearch, type EditorSearchCommand } from "./editor-command-search";
import { PresentationActionMenu, PresentationShortcutHelp } from "./presentation-action-menu";
import { isLinearShape, adaptiveGridGap, selectionRoots, mutableSelection, reorderSelection } from "../lib/presentation-interactions";
import { PresentationShape } from "./presentation-shape";
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
import { usePresentationSourcePreviews } from "./use-presentation-source-previews";
import type { PresentationFormat } from "../lib/presentation-format";
import { arrangePresentation, layoutRoots, presentationAlignments } from "../lib/presentation-layout";
import { subsectionBaseline } from "../lib/presentation-subsections";
import { applyStructureProposal } from "../lib/presentation-structure";
import { PresentationSubsectionUpdates } from "./presentation-subsection-updates";
import { PresentationSourcePanel } from "./presentation-source-panel";
import { documentSectionHref, sourceKey, sourceReviewStatus, synchronizePresentationHeadings, preservePresentationHeadingOverride, type PresentationSourceDocument } from "../lib/presentation-source";
import { readLinkedPosition, rememberLinkedPosition } from "../lib/linked-navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { createId } from "@paralleldrive/cuid2";
import { Background, SelectionMode, Controls, MiniMap, ReactFlow, ReactFlowProvider, ViewportPortal, useStore, useReactFlow, useViewport, type NodeChange } from "@xyflow/react";
import { KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Copy, FileDown, History, ImagePlus, Loader2, Lock, Maximize2, PanelRight, PanelLeft, MoreHorizontal, Share2, Play, Redo2, RotateCw, Save, Search, Settings, Shapes, Square, Trash2, TriangleAlert, Type, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/ui/color-picker";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "./workspace-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { restorePresentationRevision } from "../presentation-actions";
import type { PresentationRecord, PresentationRevisionItem } from "../presentation-queries";
import { PRESENTATION_CAMERA_PADDING, PRESENTATION_SNAP_TOLERANCE, presentationDescendants, presentationAncestors, isPresentationElementLocked, applyGeometryChanges, normalizeRotation, initialPresentationCanvasState, presentationCanvasReducer, presentationCameraBounds, moveStep, presentationShapeKinds, rotateElements, scaleElements, unionBounds, type PresentationCanvasState, type PresentationElement, type PresentationGeometryChange, type PresentationSettings, type PresentationStep, type SnapGuide } from "../lib/presentation";
import { elementsToNodes, presentationNodeTypes, type PresentationNode } from "./presentation-canvas";
import { PresentationPrecisionControls } from "./presentation-precision-controls";
import { alignPresentationToFrame, setPreciseGeometry } from "../lib/presentation-precision";
import { PresentationSelectionTools } from "./presentation-selection-tools";
import { PresentationStudioInspector } from "./presentation-studio-inspector";
import { PresentationLibraryPanel } from "./presentation-library-panel";
import { presentationValuesEqual } from "../lib/presentation-merge";
import type { SaveState } from "./presentation-editor/presentation-editor-utils";
import { DraftInput } from "./presentation-editor/draft-fields";
import { PresentationMiniMapNode, SnapGuides } from "./presentation-editor/canvas-decorations";
import { SelectionOverlay } from "./presentation-editor/selection-overlay";
import { PresentationPathPanel } from "./presentation-editor/presentation-path-panel";
import { PresentationAppearanceInspector } from "./presentation-editor/presentation-appearance-inspector";
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
import { usePresentationTextEditing } from "./presentation-editor/use-presentation-text-editing";
import { usePresentationClipboard } from "./presentation-editor/use-presentation-clipboard";
import { usePresentationClickSelection } from "./presentation-editor/use-presentation-click-selection";
import { usePlacementFocus } from "./presentation-editor/use-placement-focus";
import { isControlKey, isModifierShortcut, presentationKeyScope } from "./presentation-editor/presentation-keyboard-scope";
import { applySelectChanges } from "../lib/presentation-selection";

const subscribePlatform = () => () => {};
const getMacPlatform = () => /Mac|iPhone|iPad/.test(navigator.platform);
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
  const linkText = useTranslations("documentPresentationLinks");
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
  const [insertPicker, setInsertPicker] = useState<"shape" | "chart" | "icon" | null>(null);
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
  const commandRoot = useRef<HTMLDivElement>(null);
  const { commandsOpen, setCommandsOpen, openCommands, restoreCommandFocus } = usePresentationCommandPalette(commandRoot);

  const [formatClipboard, setFormatClipboard] = useState<PresentationFormat | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [sessionId] = useState(() => clientUUID());
  const canEdit = presentation.role === "owner" || presentation.role === "edit";

  const [lockedBy] = useState<string | null>(null);
  const leaseReady = !canEdit || !!collaboration?.ready;
  const [conflict] = useState(false);
  const [activePanel, setActivePanel] = useState<"properties" | "sources" | "design" | "assets" | "comments" | null>(null);
  const [pathOpen, setPathOpen] = useState(false);
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
  const sourcePreviews = usePresentationSourcePreviews(elements.map((element) => element.source));
  useEffect(() => {
    if (disabled || sourcePreviews.error || synchronizePresentationHeadings(elements, sourcePreviews.previews) === elements) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // A source refresh must not replace a custom label still being typed.
        // Blur commits that draft (and its override) before this next frame.
        if (document.activeElement?.hasAttribute("data-linked-heading-title")) return;
        dispatch({ type: "source-headings", elements: (current) => synchronizePresentationHeadings(current, sourcePreviews.previews) });
      });
    };
    sync();
    document.addEventListener("focusout", sync);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("focusout", sync); };
  }, [disabled, elements, sourcePreviews.error, sourcePreviews.previews, dispatch]);
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
  const selectionBounds = useMemo(() => unionBounds(selection.map(presentationCameraBounds)), [selection]);
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
        let next = preservePresentationHeadingOverride(source, update(source));
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

  const onEndpointChange = useCallback((next: PresentationElement) => {
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => current.map(e => e.id === next.id && !isPresentationElementLocked(current, e.id) ? { ...e, x: next.x, y: next.y, width: next.width, rotation: next.rotation } : e) });
  }, [dispatch]);
  const onRichTextChange = useCallback((id: string, content: Extract<PresentationElement, { type: "text" }>["content"]) => updateElement(id, element => element.type === "text" ? { ...element, content } : element), [updateElement]);
  const onResizeChange = useCallback((next: PresentationElement, free: boolean) => {
    dispatch({ type: "geometry", at: Date.now(), changes: [{ id: next.id, x: next.x, y: next.y, width: next.width, height: next.height, resizing: true }], tolerance: free ? 0 : PRESENTATION_SNAP_TOLERANCE / reactFlow.getZoom(), gesture: true });
  }, [dispatch, reactFlow]);
  const collaboratorPresence = collaboration?.people;
  const { dropTargetId, trackDrag, clearPlacement, reveal, openedWithElements } = usePresentationFrames({ elements, steps, reactFlow, canvasRef });
  const textEditing = usePresentationTextEditing();
  const clickSelection = usePresentationClickSelection({ elements, reactFlow, setSelectedIds, isMac });
  const nodes = useMemo(
    () => elementsToNodes(dragPreview ? [...elements, ...dragPreview] : elements, { editable: !disabled, selectedIds: dragPreview ? new Set(dragPreview.filter(e => !dragPreview.some(p => p.id === e.parentId)).map(e => e.id)) : selectedSet, onTextChange,
      onRichTextChange, onEndpointChange, onResizeChange, editingId: textEditing.editingId, onEditingChange: textEditing.onEditingChange, onTextEditorReady: textEditing.onEditorReady,
      onGestureStart: startGesture, onGestureEnd: endGesture, dropTargetId }).map(node => {
      const collaborators = collaboratorPresence?.filter(person => person.selectedIds?.includes(node.id)) ?? [];
      return collaborators.length ? { ...node, style: { ...node.style, outline: `2px solid ${userIdentityColor(collaborators[0].userId)}`, outlineOffset: 3 }, ariaLabel: collaborators.map(person => person.name).join(", ") } : node;
    }),
    [elements, dragPreview, selectedSet, onTextChange, disabled, startGesture, endGesture, collaboratorPresence, onRichTextChange, onEndpointChange, onResizeChange, dropTargetId, textEditing.editingId, textEditing.onEditingChange, textEditing.onEditorReady],
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
          const element = elements.find((element) => element.id === change.id);
          const group = presentationAncestors(elements, change.id).findLast((element) => element.type === "frame" && element.content.isGroup);
          if (group && element) geometry.set(group.id, { id: group.id, x: group.x + change.position.x - element.x, y: group.y + change.position.y - element.y });
          else geometry.set(change.id, { ...geometry.get(change.id), id: change.id, x: change.position.x, y: change.position.y });
          moved.add(group?.id ?? change.id);
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
      });
      if (ended) endGesture();
    },
    [reactFlow, disabled, elements, endGesture, dispatch, clickSelection],
  );

  const rotateSelection = useCallback(
    (deltaDegrees: number, center: { x: number; y: number }) => {
      commitElements((current) => rotateElements(current, selectedSet, deltaDegrees, center));
    },
    [commitElements, selectedSet],
  );

  const scaleSelection = useCallback(
    (scaleX: number, scaleY: number, origin: { x: number; y: number }) => {
      commitElements((current) => scaleElements(current, selectedSet, origin, scaleX, scaleY));
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
  const jumpToSelectionTool = (section: "appearance" | "content" | "structure" | "animation") => {
    const target = document.getElementById(`presentation-tool-${section}`);
    if (!target) return;
    document.querySelectorAll<HTMLDetailsElement>('details[name="presentation-inspector"]').forEach(panel => { panel.open = panel === target; });
    target.scrollIntoView({ block: "start" });
    const focusTarget = target.querySelector<HTMLElement>("summary") ?? target;
    focusTarget.focus({ preventScroll: true });
  };

  const { deleteSelection, duplicateSelection, reorderSelected, copyObjectFormat, pasteObjectFormat } = usePresentationSelectionEdits({
    elements, dispatch, disabled, t, commitElements, selection, formatClipboard, setFormatClipboard, setSelectedIds,
  });

  const { addText, addTextAt, addFrame, addShape, addStudioElement, uploadMedia, uploadImage } = usePresentationInsertion({
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
  const resumeToken = navigationQuery.get("resume");
  const documentResumeToken = navigationQuery.get("documentResume");
  const appliedNavigation = useRef("");
  const appliedViewportEngine = useRef(viewportEngine);
  useEffect(() => {
    if (!viewportEngine || !reactFlow.viewportInitialized || !viewportSized) return;
    const navigationKey = `${presentation.id}:${requestedElement}:${resumeToken}`;
    if (appliedNavigation.current === navigationKey && appliedViewportEngine.current === viewportEngine) return;
    // Next can reactivate a cached editor with a recreated pan/zoom controller.
    // Restore once per controller, as well as once per destination.
    const timer = setTimeout(() => {
      appliedNavigation.current = navigationKey;
      appliedViewportEngine.current = viewportEngine;
      const saved = readLinkedPosition(resumeToken);
      if (saved?.kind === "presentation" && saved.id === presentation.id) {
        setSelectedIds(saved.selectedIds.filter((id) => elements.some((element) => element.id === id)));
        setActiveStepId(steps.some((step) => step.id === saved.activeStepId) ? saved.activeStepId : null);
        void reactFlow.setViewport(saved.viewport);
        if (saved.selectedIds.length) setActivePanel(requestedElement ? "sources" : "properties");
      } else if (requestedElement) {
        const target = elements.find((element) => element.id === requestedElement);
        if (target) { setSelectedIds([target.id]); setActiveStepId(steps.find((step) => step.elementId === target.id)?.id ?? null); flyTo(target); setActivePanel("sources"); }
        else { toast.error(linkText("missingElement")); void reactFlow.fitView({ padding: 0.2 }); }
      } else if (resumeToken) void reactFlow.fitView({ padding: 0.2 });
    }, 0);
    return () => clearTimeout(timer);
  }, [elements, flyTo, linkText, viewportSized, presentation.id, reactFlow, requestedElement, resumeToken, steps, viewportEngine]);

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
      if (!saved) { tab?.close(); toast.error(linkText("saveFailed")); return; }
      if (!newTab) {
        // Hand the lease back before navigation so the next editor can claim it at once.
        await requestEditLease(presentation.id, sessionId, "release").catch(() => undefined);
        if (proceed) proceed(); else router.push(href);
      } else if (tab) {
        tab.location.href = href;
      }
    }).catch(() => { tab?.close(); toast.error(linkText("saveFailed")); })
      .finally(() => { paused.current = false; });
  }, [flush, presentation.id, router, sessionId, t, linkText]);

  function openDocument(document: PresentationSourceDocument, sectionId: string, restoreDocument = false) {
    const token = rememberLinkedPosition({ kind: "presentation", id: presentation.id, viewport: reactFlow.getViewport(), selectedIds, activeStepId });
    let href = documentSectionHref(document.slug, sectionId, presentation.id, selected?.id ?? requestedElement ?? "", token);
    const previousDocument = readLinkedPosition(documentResumeToken);
    if (restoreDocument && previousDocument?.kind === "document" && previousDocument.id === document.id && documentResumeToken) href += `&documentResume=${encodeURIComponent(documentResumeToken)}`;
    flushThen(href, false);
  }
  async function returnToDocument() {
    const saved = readLinkedPosition(documentResumeToken);
    if (saved?.kind !== "document") return;
    try {
      const response = await fetch(`/api/wiki/presentation-sources?source=${encodeURIComponent(saved.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!result.document) { toast.error(linkText("missingSource")); return; }
      openDocument(result.document, saved.sectionId, true);
    } catch { toast.error(linkText("loadFailed")); }
  }

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

  const colorSwatches = (value: string, onPick: (color: string) => void) => (
    <ColorPicker aria-label={studio("color")} value={value} onChange={onPick} disabled={disabled || Boolean(selected?.locked)} clearLabel={t("presentations.colorDefault")} />
  );

  const colorField = (label: string, value: string, onPick: (color: string) => void) => (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ColorPicker aria-label={label} value={value} onChange={onPick} disabled={disabled} clearLabel={t("presentations.clearColor")} />
    </div>
  );

  const sourceAttention = elements.filter((element) => {
    if (!element.source) return false;
    const preview = sourcePreviews.previews.get(sourceKey(element.source));
    return preview && (sourceReviewStatus(element.source, preview) !== "current" || (element.type === "frame" && preview.snapshot?.headingStructure && !presentationValuesEqual(element.source.approvedStructure, preview.snapshot.headingStructure)));
  }).length;
  const sourcePanel = (          <PresentationSourcePanel onSubsectionsChange={(enabled) => {
            if (disabled || !selected?.source) return;
            const descendants = presentationDescendants(elements, new Set([selected.id]));
            commitElements((current) => current.map((element) => element.type === "frame" && descendants.has(element.id) && element.source?.pageId === selected.source!.pageId && !isPresentationElementLocked(current, element.id)
              ? { ...element, source: { ...element.source, syncSubsections: enabled,
                knownSectionIds: enabled ? [...new Set([...(element.source.knownSectionIds ?? []), ...subsectionBaseline(sourcePreviews.previews.get(sourceKey(element.source)))])] : element.source.knownSectionIds } } : element));
          }} structureDisabled={disabled} onStructureApply={(expected, proposal) => {
            if (disabled) return;
            dispatch({ type: "edit", at: Date.now(), separate: true, elements: (current) => applyStructureProposal(current, expected, proposal) });
            const target = proposal.elements.find((element) => element.id === (selected?.id ?? proposal.changes[0].elementId));
            if (target) flyTo(target);
          }} previews={sourcePreviews} elements={elements} selected={selected} disabled={disabled || Boolean(selected && isPresentationElementLocked(elements, selected.id))} onChange={(source) => { if (selected) updateElement(selected.id, (element) => ({ ...element, source })); }} onOpen={openDocument} onReview={(id, source) => updateElement(id, (element) => element.source?.pageId === source.pageId && element.source.sectionId === source.sectionId ? { ...element, source } : element)} onSelect={(id) => { setSelectedIds([id]); const element = elements.find((item) => item.id === id); if (element) flyTo(element); }} />
);
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
  const pathPanel = (<PresentationPathPanel presentation={presentation} steps={steps} elements={elements} selected={selected}
    activeStep={activeStep} activeStepId={activeStepId} setActiveStepId={setActiveStepId} setSelectedIds={setSelectedIds} flyTo={flyTo}
    commitSteps={commitSteps} addStep={addStep} disabled={disabled} readOnly={readOnly} sensors={sensors} onStepDragEnd={onStepDragEnd}
    settings={settings} updateStepDuration={updateStepDuration} updateStepNotes={updateStepNotes} collaboration={collaboration} dispatch={dispatch} />);
  const openHistory = useCallback(async () => {
    if (await flush()) { router.refresh(); setWorkspaceDialog("history"); }
  }, [flush, router]);
  const commandText = t("presentations.commands.title");
  const unavailable = t("presentations.commands.unavailable");
  const insertReason = disabled ? unavailable : elements.length >= 500 ? t("presentations.elementLimit") : undefined;
  const baseCommands: EditorSearchCommand[] = [
    { id: "addText", label: t("presentations.addText"), execute: addText, disabledReason: insertReason, group: commandText },
    { id: "addFrame", label: t("presentations.addFrame"), execute: addFrame, disabledReason: insertReason, group: commandText },
    { id: "addShape", label: t("presentations.addShape"), execute: () => setInsertPicker("shape"), disabledReason: insertReason, group: commandText },
    { id: "addChart", label: studio("addChart"), execute: () => setInsertPicker("chart"), disabledReason: insertReason, group: commandText },
    { id: "addIcon", label: studio("addIcon"), execute: () => setInsertPicker("icon"), disabledReason: insertReason, group: commandText },
    { id: "addImage", label: t("presentations.addImage"), execute: () => imageInputRef.current?.click(), disabledReason: insertReason || (uploading ? unavailable : undefined), group: commandText },
    { id: "uploadMedia", label: studio("uploadMedia"), execute: () => mediaInputRef.current?.click(), disabledReason: insertReason || (uploading ? unavailable : undefined), group: commandText },
    { id: "duplicateSelection", label: t("presentations.duplicateElement"), execute: () => duplicateSelection(selectedIds), disabledReason: disabled || !mutableSelection(elements, selectedIds) ? unavailable : !selection.length ? t("presentations.commands.selectFirst") : elements.length + presentationDescendants(elements, new Set(selectedIds)).size > 500 ? t("presentations.elementLimit") : undefined, contextPriority: selection.length ? 1 : 0, group: commandText },
    { id: "deleteSelection", label: t("presentations.deleteElement"), execute: () => deleteSelection(selectedIds), disabledReason: disabled ? unavailable : !selection.length ? t("presentations.commands.selectFirst") : selection.every(element => isPresentationElementLocked(elements, element.id)) ? unavailable : undefined, group: commandText },
    { id: "undo", label: t("editor.toolbar.undo"), execute: () => dispatch({ type: "undo" }), disabledReason: disabled || !(undo ? undo.canUndo() : canvas.past.length) ? unavailable : undefined, group: commandText },
    { id: "redo", label: t("editor.toolbar.redo"), execute: () => dispatch({ type: "redo" }), disabledReason: disabled || !(undo ? undo.canRedo() : canvas.future.length) ? unavailable : undefined, group: commandText },
    { id: "overview", label: t("presentations.overview"), execute: () => { void reactFlow.fitView({ padding: 0.15, duration: CAMERA_DURATION }); }, group: commandText },
    { id: "path", label: t("presentations.path"), execute: () => { setPathOpen(value => !value); if (!window.matchMedia("(min-width: 1280px)").matches) setActivePanel(null); }, group: commandText },
    ...(["properties", "sources", "design", "assets", "comments"] as const).map(panel => ({ id: panel, label: t(`workspace.${panel}`), execute: () => { setActivePanel(panel); if (!window.matchMedia("(min-width: 1280px)").matches) setPathOpen(false); }, group: commandText })),
    { id: "save", label: t("presentations.save"), execute: () => { void flush(); }, disabledReason: disabled ? unavailable : undefined, group: commandText },
    { id: "history", label: t("presentations.history"), execute: openHistory, group: commandText },
    { id: "playback", label: t("presentations.playbackSettings"), execute: () => setWorkspaceDialog("playback"), group: commandText },
  ];
  const duplicateDrag = (event: React.PointerEvent<HTMLDivElement>) => startDuplicateDrag(event, {
    disabled, isMac, elements, selectedIds, reactFlow, t, setPreviewGuides, setDragPreview, dragCancel, setSelectedIds, dispatch,
  });
  const selectedRoots = selectionRoots(elements, selectedIds);
  const canMutate = !disabled && mutableSelection(elements, selectedIds);
  function interact(key: string) { return t(`presentations.interactions.${key}`); }
  const modifier = isMac ? "⌘" : "Ctrl";
  const shortcutLabels: Record<string, string> = { copy: `${modifier}+C`, cut: `${modifier}+X`, paste: `${modifier}+V`, duplicateSelection: `${modifier}+D`, selectAll: `${modifier}+A`, group: `${modifier}+G`, ungroup: `${modifier}+Shift+G`, undo: `${modifier}+Z`, redo: `${modifier}+Shift+Z`, save: `${modifier}+S`, deleteSelection: "Delete", editText: "Enter", front: `${modifier}+Shift+]`, back: `${modifier}+Shift+[`, forward: `${modifier}+]`, backward: `${modifier}+[`, copyFormat: `${modifier}+Shift+C`, pasteFormat: `${modifier}+Shift+V` };
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
    { id: "selectAll", label: interact("selectAll"), execute: () => setSelectedIds(selectionRoots(elements, elements.map(e => e.id)).map(e => e.id)), group: commandText, disabledReason: (elements.length > 0) ? undefined : unavailable },
    { id: "group", label: interact("group"), execute: groupSelection, group: commandText, disabledReason: (canMutate && selectedRoots.length >= 2 && elements.length < 500) ? undefined : unavailable },
    { id: "ungroup", label: interact("ungroup"), execute: ungroupSelection, group: commandText, disabledReason: (canMutate && selectedRoots.some(e => e.type === "frame" && e.content.isGroup)) ? undefined : unavailable },
    { id: "editText", label: interact("editText"), execute: editText, group: commandText, disabledReason: (canMutate && selected?.type === "text") ? undefined : unavailable },
    { id: "copyFormat", label: interact("copyFormat"), execute: copyObjectFormat, group: commandText, disabledReason: (selection.length === 1) ? undefined : unavailable },
    { id: "pasteFormat", label: interact("pasteFormat"), execute: pasteObjectFormat, group: commandText, disabledReason: (canMutate && Boolean(formatClipboard) && selection.some(e => e.type === formatClipboard?.type)) ? undefined : unavailable },
    { id: "lock", label: interact("lock"), execute: () => setSelectionLocked(true), group: commandText, disabledReason: (canMutate) ? undefined : unavailable },
    { id: "unlock", label: interact("unlock"), execute: () => setSelectionLocked(false), group: commandText, disabledReason: (!disabled && selection.some(e => e.locked) && selectedRoots.every(e => !presentationAncestors(elements, e.id).some(p => p.locked))) ? undefined : unavailable },
    ...(["front", "back", "forward", "backward"] as const).map(direction => ({ id: direction, label: interact(direction), execute: () => dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => reorderSelection(current, selectedIds, direction) }), group: commandText, disabledReason: (canMutate) ? undefined : unavailable })),
    ...presentationAlignments.map(mode => ({ id: `align-${mode}`, label: t(`presentations.layout.${mode}`), group: commandText, disabledReason: arrangementDisabled || selectedRoots.length < (["horizontal", "vertical"].includes(mode) ? 3 : 2) ? unavailable : undefined, execute: () => dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => arrangePresentation(current, selectedSet, mode) }) })),
    { id: "connect", label: interact("connect"), execute: connectSelection, group: commandText, disabledReason: (!arrangementDisabled && selectedRoots.length === 2 && elements.length < 500) ? undefined : unavailable },
    { id: "detach", label: interact("detach"), execute: () => { if (selected?.type === "shape") updateElement(selected.id, e => e.type === "shape" ? { ...e, content: { ...e.content, connection: undefined } } : e); }, group: commandText, disabledReason: (canMutate && selected?.type === "shape" && Boolean(selected.content.connection)) ? undefined : unavailable },
    { id: "shortcutHelp", label: interact("shortcutHelp"), execute: () => setShortcutHelp(true), group: commandText },
  ];

  const showMenuCommand = (id: string) => Boolean(selection.length ?
    ["copy", "cut", "paste", "duplicateSelection", "deleteSelection", "properties", "copyFormat", "pasteFormat", "front", "back", "forward", "backward", "shortcutHelp"].includes(id)
      || (id === "group" && selectedRoots.length >= 2) || (id === "ungroup" && selectedRoots.some(e => e.type === "frame" && e.content.isGroup))
      || (id === "editText" && selected?.type === "text") || (id === "lock" && selection.some(e => !e.locked)) || (id === "unlock" && selection.some(e => e.locked))
      || (id.startsWith("align-") && selectedRoots.length >= 2) || (id === "connect" && !arrangementDisabled && selectedRoots.length === 2)
      || (id === "detach" && selected?.type === "shape" && selected.content.connection) || (id === "sources" && selected && [selected, ...presentationAncestors(elements, selected.id)].some(e => e.source))
    : ["addText", "addFrame", "addShape", "addChart", "addIcon", "addImage", "paste", "selectAll", "overview", "shortcutHelp"].includes(id));
  const handleKeyboard = useEffectEvent((event: KeyboardEvent) => {
    const scope = presentationKeyScope(event, commandRoot.current);
    if (!scope) return;
    const { target, typing } = scope;
    const mod = isModifierShortcut(event), key = event.key.toLowerCase();
    if (mod && key === "s") { event.preventDefault(); executeCommand("save"); return; }
    if (!typing && textEditing.captureKey(event)) return;
    if (typing || commandsOpen || shortcutHelp) return;
    if (pendingElement && (key === "escape" || key === "enter")) { event.preventDefault(); if (key === "escape") setPendingElement(null); else placePending(viewportCenter(), true); return; }
    // A focused button or link keeps its own Enter, Space and arrows; shortcuts, Delete and Escape stay the canvas's.
    if (scope.onControl && isControlKey(event)) return;
    let id: string | undefined;
    if (mod) id = ({ a: "selectAll", c: event.shiftKey ? "copyFormat" : "copy", x: "cut", v: event.shiftKey ? "pasteFormat" : "paste", d: "duplicateSelection", g: event.shiftKey ? "ungroup" : "group", z: event.shiftKey ? "redo" : "undo", y: "redo", "]": event.shiftKey ? "front" : "forward", "[": event.shiftKey ? "back" : "backward", "}": "front", "{": "back" } as Record<string, string>)[key];
    else if (key === "delete" || key === "backspace") id = "deleteSelection";
    else if (key === "enter") id = "editText";
    if (id === "copy" || id === "cut" || id === "paste") return; // handled in the clipboard events these keys fire
    if (id) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) executeCommand(id); return; }
    if (event.shiftKey && event.key === "F10") { event.preventDefault(); const box = canvasRef.current?.getBoundingClientRect(); if (box) setContextPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }); return; }
    if (key === "escape") { if (dragCancel.current) dragCancel.current(); else if (bridge.cancelGesture()) { cancelledGesture.current = true; window.dispatchEvent(new Event("presentation-cancel-gesture")); } else { setContextPosition(null); setSelectedIds([]); commandRoot.current?.focus(); } return; }
    if (key === "tab" && canvasRef.current?.contains(target)) {
      const roots = elements.filter(e => !presentationAncestors(elements, e.id).some(parent => parent.type === "frame" && parent.content.isGroup)); if (!roots.length) return;
      event.preventDefault(); const current = roots.findIndex(e => selectedIds.includes(e.id));
      setSelectedIds([roots[(current + (event.shiftKey ? -1 : 1) + roots.length) % roots.length].id]); return;
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key) && canMutate) {
      event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1;
      const nudged = selectedRoots.filter(e => !(e.type === "shape" && e.content.connection)); dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: false, membership: nudged.map(e => e.id), changes: nudged.map(e => ({ id: e.id, x: e.x + (key === "arrowright" ? step : key === "arrowleft" ? -step : 0), y: e.y + (key === "arrowdown" ? step : key === "arrowup" ? -step : 0) })) });
    }
  });
  useEffect(() => { const key = (event: KeyboardEvent) => handleKeyboard(event); window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true); }, []);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="presentation-editor" data-presentation-workspace data-wiki-command-scope ref={commandRoot} tabIndex={-1}
      onPointerDownCapture={event => { if (commandRoot.current?.contains(event.target as Node) && !(event.target as HTMLElement).closest('button, a, input, textarea, select, [contenteditable=true]')) (canvasRef.current?.contains(event.target as Node) ? canvasRef.current : commandRoot.current)?.focus({ preventScroll: true }); }}>
      {commandsOpen && <EditorCommandSearch shortcutLabels={shortcutLabels} title={commandText} description={t("presentations.commands.description")} commands={commands}
        onClose={() => { flushSync(() => setCommandsOpen(false)); restoreCommandFocus(); }}
        onExecute={item => { if (item.disabledReason) return; flushSync(() => setCommandsOpen(false)); restoreCommandFocus(); item.execute(); }} />}
      <PresentationShortcutHelp open={shortcutHelp} onOpenChange={setShortcutHelp} title={interact("shortcutHelp")} help={interact("gestureHelp")} commands={commands} shortcutLabels={shortcutLabels} />
      <Dialog open={Boolean(insertPicker)} onOpenChange={open => { if (!open) setInsertPicker(null); }}><DialogContent finalFocus={placementFocus}><DialogHeader><DialogTitle>{interact("choose")}</DialogTitle></DialogHeader><div className="grid grid-cols-3 gap-2">{(insertPicker === "shape" ? presentationShapeKinds : insertPicker === "chart" ? ["bar", "line", "pie"] : insertPicker === "icon" ? presentationIconNames : []).map(choice => <Button key={choice} variant="outline" onClick={() => { if (insertPicker === "shape") addShape(choice as PresentationShapeKind); else if (insertPicker) addStudioElement(insertPicker, choice); setInsertPicker(null); }}>{insertPicker === "shape" ? t(`presentations.shapeKinds.${choice}`) : interact(insertPicker === "icon" ? `icons.${choice}` : choice)}</Button>)}</div></DialogContent></Dialog>
      {collaboration && <CollaborationStatus provider={collaboration} className="sr-only" />}
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background px-4 py-3">
        {documentResumeToken && <Button size="sm" variant="outline" onClick={() => void returnToDocument()}>{linkText("backDocument")}</Button>}
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
        <Link
          href={listHref}
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={(event) => leaveVia(event, listHref)}
          onAuxClick={(event) => auxFlush(event, listHref)}
        >
          {t("presentations.title")}
        </Link>
        <span className="text-muted-foreground">/</span>
        <DraftInput
          value={title}
          maxLength={200}
          disabled={disabled}
          aria-label={t("presentations.presentationTitle")}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent font-medium shadow-none hover:border-input sm:w-auto sm:max-w-xl sm:flex-1"
          normalise={(raw) => raw.trim() || title}
          onCommit={(next) => dispatch({ type: "touch", title: next })}
        />
        </div>
        <div className="flex w-full items-center justify-end gap-2 text-xs sm:ml-auto sm:w-auto">
          <span role="status" aria-live="polite" className="mr-auto sm:mr-0"><PresentationSaveIndicator state={saveState} /></span>
          {(saveState === "error" || saveState === "offline") && <Button size="sm" variant="ghost" onClick={() => void flush()} disabled={disabled}><Save className="size-3.5" />{t("presentations.save")}</Button>}
          <Button size="sm" variant="ghost" aria-label={t("workspace.share")} onClick={() => setWorkspaceDialog("sharing")}><Share2 className="size-4" /><span className="hidden sm:inline">{t("workspace.share")}</span></Button>
          <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("workspace.actions")} />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!steps.length || restoring !== null || uploading} onClick={() => flushThen(printHref, true)}><FileDown />{t("presentations.exportPdf")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => executeCommand("history")}><History />{t("presentations.history")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWorkspaceDialog("playback")}><Settings />{t("presentations.playbackSettings")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={disabled} onClick={() => void flush()}><Save />{t("presentations.save")}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
          <Button
            type="button"
            size="sm"
            disabled={!steps.length || restoring !== null || uploading}
            nativeButton={false}
            role="link"
            // The player is server-rendered from the saved canvas, so the navigation waits
            // for the write, rather than presenting a stale canvas. A modifier click still
            // means "new tab" -- it just gets one with the edit in it.
            render={(
              <Link
                href={presentHref}
                onClick={(event) => leaveVia(event, presentHref)}
                onAuxClick={(event) => auxFlush(event, presentHref)}
              />
            )}
          >
            <Play className="size-3.5" />{t("presentations.present")}
          </Button>
        </div>
      </header>
      <div data-testid="presentation-toolbar" className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-background px-3 py-2">
        <Button size="sm" variant="ghost" aria-label={commandText} onClick={openCommands}><Search className="size-4" /><span>{commandText}</span><kbd className="text-xs text-muted-foreground">&#8679; &#8679;</kbd></Button>
        <Button size="sm" variant={pathOpen ? "secondary" : "ghost"} aria-expanded={pathOpen} onClick={() => { setPathOpen((value) => !value); if (!window.matchMedia("(min-width: 1280px)").matches) setActivePanel(null); }}><PanelLeft className="size-4" />{t("presentations.path")}</Button>
        <PresentationActionMenu shortcutLabels={shortcutLabels} commands={commands} showCommand={showMenuCommand} label={interact("actions")} />
        <span className="mx-1 h-5 w-px bg-border/60" />
        <Button type="button" variant="ghost" size="sm" disabled={disabled || elements.length >= 500} onClick={addText}><Type className="size-3.5" />{t("presentations.addText")}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={uploading || disabled || elements.length >= 500} onClick={() => imageInputRef.current?.click()}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          {t("presentations.addImage")}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || elements.length >= 500} onClick={addFrame}><Square className="size-3.5" />{t("presentations.addFrame")}</Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button size="sm" variant="ghost" disabled={disabled || uploading || elements.length >= 500} />}>{t("editor.toolbar.insert")}</DropdownMenuTrigger><DropdownMenuContent finalFocus={placementFocus}>
          <DropdownMenuItem onClick={addFrame}><Square />{t("presentations.addFrame")}</DropdownMenuItem>
          <DropdownMenuSub><DropdownMenuSubTrigger><Shapes />{t("presentations.addShape")}</DropdownMenuSubTrigger><DropdownMenuSubContent>
            {presentationShapeKinds.map(shape => <DropdownMenuItem key={shape} onClick={() => addShape(shape)}><span className="h-5 w-8"><PresentationShape element={{ id: "preview", type: "shape", x: 0, y: 0, width: 80, height: 40, rotation: 0, content: { shape, fill: "", stroke: "", strokeWidth: 3, opacity: 1 } }} /></span>{t(`presentations.shapeKinds.${shape}`)}</DropdownMenuItem>)}
          </DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuSub><DropdownMenuSubTrigger>{studio("addChart")}</DropdownMenuSubTrigger><DropdownMenuSubContent>{["bar", "line", "pie"].map(kind => <DropdownMenuItem key={kind} onClick={() => addStudioElement("chart", kind)}>{interact(kind)}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuSub><DropdownMenuSubTrigger>{studio("addIcon")}</DropdownMenuSubTrigger><DropdownMenuSubContent>{presentationIconNames.map(name => <DropdownMenuItem key={name} onClick={() => addStudioElement("icon", name)}>{interact(`icons.${name}`)}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuItem onClick={() => mediaInputRef.current?.click()}>{studio("uploadMedia")}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger render={<Button size="sm" variant="ghost" disabled={arrangementDisabled} />}>{t("presentations.layout.arrange")}</DropdownMenuTrigger><DropdownMenuContent>
          {presentationAlignments.map(mode => <DropdownMenuItem key={mode} disabled={arrangementRoots.length < ((mode === "horizontal" || mode === "vertical") ? 3 : 2)} onClick={() => executeCommand(`align-${mode}`)}>{t(`presentations.layout.${mode}`)}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={arrangementRoots.length !== 2 || elements.length >= 500} onClick={connectSelection}>{t("presentations.layout.connect")}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <input ref={mediaInputRef} aria-label={studio("uploadMedia")} hidden type="file" accept="video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file); event.target.value = ""; }} />
        <input
          ref={imageInputRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadImage(file);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("presentations.undo")}
          title={t("presentations.undo")}
          disabled={disabled || !(undo ? undo.canUndo() : canvas.past.length)}
          onClick={() => dispatch({ type: "undo" })}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("presentations.redo")}
          title={t("presentations.redo")}
          disabled={disabled || !(undo ? undo.canRedo() : canvas.future.length)}
          onClick={() => dispatch({ type: "redo" })}
        >
          <Redo2 className="size-4" />
        </Button>

        <DropdownMenu><DropdownMenuTrigger render={<Button size="sm" variant={activePanel ? "secondary" : "ghost"} className="ml-auto" />}><PanelRight className="size-4" />{t("workspace.tools")}</DropdownMenuTrigger><DropdownMenuContent align="end">
          {(["properties", "sources", "design", "assets", "comments"] as const).map((panel) => <DropdownMenuItem key={panel} onClick={() => { setActivePanel(panel); if (!window.matchMedia("(min-width: 1280px)").matches) setPathOpen(false); }}>{t(`workspace.${panel}`)}</DropdownMenuItem>)}
        </DropdownMenuContent></DropdownMenu>
      </div>
      <PresentationSubsectionUpdates elements={elements} previews={sourcePreviews} disabled={disabled} undoElements={canvas.past.at(-1)?.elements}
        busy={canvas.dirty || canvas.failed || status === "saving" || Boolean(workspaceDialog)}
        onReviewOpen={() => { setActivePanel(null); setPathOpen(false); }}
        onApply={(expected, proposal) => {
          if (disabled || paused.current || proposal.issue || latest.current.canvas.failed || !presentationValuesEqual(latest.current.canvas.elements, expected)) return false;
          dispatch({ type: "edit", at: Date.now(), separate: true, elements: (current) => presentationValuesEqual(current, expected) ? proposal.elements : current });
          return true;
        }} onUndo={() => dispatch({ type: "undo" })} onShow={(id) => { const element = elements.find((item) => item.id === id); if (element) { setSelectedIds([id]); flyTo(element); } }} />
      {(sourcePreviews.error || sourceAttention > 0) && <button type="button" onClick={() => setActivePanel("sources")} className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-left text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><TriangleAlert className="size-3.5 shrink-0" /><span role="status">{sourcePreviews.error ? linkText("previewFailed") : linkText("needsReview", { count: sourceAttention })}</span></button>}

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
        <div ref={canvasRef} data-presentation-canvas tabIndex={0} onPointerMove={event => { if (pendingElement && !disabled) { const point = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }); setPendingElement({ ...pendingElement, x: point.x - pendingElement.width / 2, y: point.y - pendingElement.height / 2 }); } }} onPointerDownCapture={event => { if (pendingElement && !disabled && event.button === 0 && !(event.target as HTMLElement).closest("button, .react-flow__minimap, .react-flow__controls")) { event.preventDefault(); event.stopPropagation(); placementClick.current = true; placePending(reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); return; } cancelledGesture.current = false; clickSelection.onPointerDown(event); const target = event.target as HTMLElement; marqueeBase.current = event.shiftKey && target.classList.contains("react-flow__pane") ? selectedIds : []; duplicateDrag(event); }} className="relative min-h-40 min-w-0 flex-1 bg-muted/30 outline-none"
          onClickCapture={event => {
            if (placementClick.current) { placementClick.current = false; event.preventDefault(); event.stopPropagation(); return; }
            clickSelection.onClickCapture(event);
          }}
          onDoubleClick={event => { if (!pendingElement && !disabled && elements.length < 500) textEditing.onCanvasDoubleClick(event, () => addTextAt(reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))); }}
          onContextMenu={event => { if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return; event.preventDefault(); const node = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node"); if (node?.dataset.id) { const group = presentationAncestors(elements, node.dataset.id).findLast(e => e.type === "frame" && e.content.isGroup); const id = group?.id ?? node.dataset.id; if (!selectedIds.includes(id)) setSelectedIds([id]); } else clickSelection.onPaneContextMenu(event); setContextPosition({ x: event.clientX, y: event.clientY }); }}>
          {contextPosition && <PresentationActionMenu shortcutLabels={shortcutLabels} commands={commands} showCommand={showMenuCommand} label={interact("actions")} position={contextPosition} onClose={() => { setContextPosition(null); canvasRef.current?.focus(); }} />}
          <div className="absolute right-3 bottom-3 z-10 rounded-lg border bg-background shadow-sm">        <Button type="button" variant="ghost" size="sm" onClick={() => void reactFlow.fitView({ padding: 0.15, duration: CAMERA_DURATION })}>
          <Maximize2 className="size-3.5" />{t("presentations.overview")}
        </Button>
</div>
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={presentationNodeTypes}
            onNodesChange={onNodesChange}
            onNodeDoubleClick={(_event, node) => {
              setSelectedIds([node.id]);
              if (node.type === "text") return;
              setActivePanel("properties");
              if (!window.matchMedia("(min-width: 1280px)").matches) setPathOpen(false);
            }}
            zoomOnDoubleClick={false}
            onNodeDragStart={(event, _node, dragged) => { axisDrag.current = { positions: new Map(elements.map(e => [e.id, { x: e.x, y: e.y }])), shift: event.shiftKey }; trackDrag(dragged); startGesture(); }}
            onNodeDragStop={() => { axisDrag.current = null; trackDrag(null); endGesture(); }}
            onSelectionDragStart={(event, dragged) => { axisDrag.current = { positions: new Map(elements.map(e => [e.id, { x: e.x, y: e.y }])), shift: event.shiftKey }; trackDrag(dragged); startGesture(); }}
            onSelectionDragStop={() => { axisDrag.current = null; trackDrag(null); endGesture(); }}
            elevateNodesOnSelect={false}
            className={styles.canvas}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            fitView={openedWithElements && !resumeToken && !requestedElement}
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
            style={background ? { backgroundColor: background } : undefined}
            panOnDrag={[1]}
            // Wheel and two-finger scroll pan; Ctrl/Cmd+wheel and pinch (a wheel with ctrlKey) zoom.
            panOnScroll zoomActivationKeyCode={["Control", "Meta"]}
            onPaneClick={event => { endGesture(); clickSelection.onPaneClick(event); }}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={adaptiveGridGap(canvasZoom)} size={1 / canvasZoom} />
            <Controls position="bottom-left" showInteractive={false} />
            {elements.length > 0 && <MiniMap ariaLabel={interact("minimapLabel")} className="!hidden sm:!block" position="top-right" pannable zoomable nodeComponent={PresentationMiniMapNode} bgColor="var(--background)" maskColor="rgb(100 116 139 / 0.12)" onClick={(_event, point) => { void reactFlow.setCenter(point.x, point.y, { zoom: reactFlow.getZoom(), duration: 150 }); }} />}
            <SnapGuides guides={dragPreview ? previewGuides : guides} />
            {pendingElement && !disabled && <ViewportPortal><div data-testid="presentation-placement-preview" className="pointer-events-none absolute border border-dashed border-indigo-500 opacity-60" style={{ left: pendingElement.x, top: pendingElement.y, width: pendingElement.width, height: pendingElement.height }}><PresentationContent element={pendingElement} /></div></ViewportPortal>}
            {!disabled && selectionBounds && !(selection.length === 1 && isLinearShape(selection[0])) && !selection.some((element) => isPresentationElementLocked(elements, element.id)) && (
              <SelectionOverlay
                bounds={selectionBounds}
                rotation={selection[0]?.rotation ?? 0}
                referenceAngles={rotationReferences}
                // Individual objects use local-axis handles; a group scales as a whole.
                scalable={selection.length > 1}
                rotateLabel={t("presentations.rotateHandle")}
                scaleLabel={t("presentations.scaleHandle")}
                onRotate={rotateSelection}
                onScale={scaleSelection}
                onGestureStart={startGesture}
                onGestureEnd={endGesture}
              />
            )}
          </ReactFlow>
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

        <WorkspacePanel title={t(`workspace.${activePanel ?? "properties"}`)} open={activePanel !== null} onClose={() => setActivePanel(null)} className="h-full max-h-full overflow-y-auto">
          <select aria-label={t("presentations.selectionTools.panels")} value={activePanel ?? "properties"} onChange={event => setActivePanel(event.target.value as Exclude<typeof activePanel, null>)} className="mb-5 h-10 w-full rounded-lg border bg-background px-3 text-sm">
            {(["properties", "sources", "design", "assets", "comments"] as const).map(panel => <option key={panel} value={panel}>{t(`workspace.${panel}`)}</option>)}
          </select>
          <div hidden={activePanel !== "sources"}>{sourcePanel}</div>
          <div hidden={!["design", "assets", "comments"].includes(activePanel ?? "")}>{libraryPanel}</div>
          <div hidden={activePanel !== "properties"}>
          {selection.length > 0 && <PresentationSelectionTools key={selectionKey} elements={elements} selection={selection}
            disabled={disabled || selection.some(e => isPresentationElementLocked(elements, e.id))} arrangeDisabled={arrangementDisabled} rootCount={arrangementRoots.length}
            onConnect={connectObjects} onArrange={mode => { if (!arrangementDisabled) dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => arrangePresentation(current, selectedSet, mode) }); }} onJump={jumpToSelectionTool} />}
          {selection.length > 0 && <PresentationPrecisionControls key={`precision-${selectionKey}`} elements={elements} selection={selection} disabled={disabled}
            onGeometry={(id, field, value, proportional) => {
              const next = setPreciseGeometry(elements, id, field, value, proportional);
              if (next === elements) return elements.find(e => e.id === id)?.[field] === (field === "rotation" ? normalizeRotation(value) : value);
              dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => setPreciseGeometry(current, id, field, value, proportional) });
              return true;
            }}
            onAlign={mode => dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => alignPresentationToFrame(current, selectedSet, mode) })} />}
          <fieldset disabled={disabled} className="min-w-0">
          {selection.length > 1 && (
            <section className="mt-5 border-t pt-4">
              <div className="flex items-center justify-between gap-1">
                <h2 className="min-w-0 truncate text-xs font-semibold tracking-wide uppercase">
                  {t("presentations.selectionCount", { count: selection.length })}
                </h2>
                <div className="flex shrink-0 items-center">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={t("presentations.duplicateElement")} onClick={() => duplicateSelection(selectedIds)}>
                    <Copy className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={t("presentations.deleteElement")} onClick={() => deleteSelection(selectedIds)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <RotateCw className="size-3.5 shrink-0" />
                {t("presentations.groupHint")}
              </p>
            </section>
          )}

          {selected && (
            <PresentationAppearanceInspector selected={selected} disabled={disabled} selectedLocked={selectedLocked} collaboration={collaboration}
              updateElement={updateElement} reorderSelected={reorderSelected} duplicateSelection={duplicateSelection} deleteSelection={deleteSelection}
              onRichTextChange={onRichTextChange} onTextChange={onTextChange} colorField={colorField} colorSwatches={colorSwatches} interact={interact} />
          )}

          <PresentationStudioInspector elements={elements} selectedIds={selectedIds} activeStep={activeStep}
            onGroup={() => executeCommand("group")} onUngroup={() => executeCommand("ungroup")} canGroup={canMutate && selectedRoots.length >= 2 && elements.length < 500}
            onElements={commitElements} onUpdate={(element) => updateElement(element.id, () => element)} onSteps={commitSteps}
            disabled={disabled || uploading} />
          {selection.length === 0 && <p className="text-xs text-muted-foreground">{t("presentations.selectionTools.emptySelectionHint")}</p>}
          {selection.length === 0 && <details name="presentation-inspector" open className="mt-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">{t("presentations.canvas")}</summary>
            <div className="mt-3">
              {colorField(t("presentations.canvasBackground"), background, (color) => {
                dispatch({ type: "touch", background: color });
              })}
            </div>
          </details>}

          </fieldset>
          </div>
        </WorkspacePanel>
      </div>
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
