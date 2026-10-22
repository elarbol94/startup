"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { Editor } from "@tiptap/react";
import { ViewportPortal, useViewport, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { isPresentationElementLocked, type PresentationElement } from "../lib/presentation";
import { resizePresentationElement, isLinearShape } from "../lib/presentation-interactions";
import { inkOn, presentationDefaultInks } from "../lib/presentation-ink";
import { AdjustHandle, LineEndHandles, type LineEndDrop } from "./presentation-editor/shape-handles";
import { PresentationShape } from "./presentation-shape";
import { useTranslations } from "next-intl";
import { PresentationRichText } from "./presentation-rich-text";
import { PresentationContent, presentationTextStyle } from "./presentation-content";
import { isTextHost, shapeShrinkScale, shapeTextBox, shapeTextContent, textBodyDefaults } from "../lib/presentation-text-host";
import { textBoxCss } from "../lib/presentation-text-style";

/**
 * The node types are shared by the editor and the player: what a reader sees while
 * presenting has to be the same drawing they arranged, so only interactivity differs.
 */

export type PresentationNodeData = {
  element: PresentationElement;
  editable: boolean;
  /** False while several elements are selected: the group is resized as a whole instead. */
  resizable?: boolean;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  onTextChange?: (id: string, text: string) => void;
  onRichTextChange?: (id: string, content: TextContent) => void;
  onResizeChange?: (element: PresentationElement, free: boolean) => void;
  /** A line end dropped on an object (glue) or on empty canvas (free end). */
  onLineEndDrop?: (id: string, end: 0 | 1, drop: LineEndDrop) => void;
  onAdjust?: (id: string, patch: { adjust?: number; cornerRadius?: number; adjustments?: Record<string, number> }) => void;
  lookupElement?: (id: string) => PresentationElement | undefined;
  mediaUrl?: (id: string) => string;
  hidden?: boolean;
  /** A frame the dragged selection would join if dropped now. */
  dropTarget?: boolean;
  /** This text element is open in the inline editor. Owned by the editor, so shortcuts can enter it synchronously. */
  editing?: boolean;
  /** Entered with a caret: the editing hook focuses the editor once the shared text is there. */
  editingDeferred?: boolean;
  onEditingChange?: (id: string, editing: boolean) => void;
  onTextEditorReady?: (id: string, editor: Editor) => void;
  /** Drawn in the editor (selection is possible there), as opposed to a player or a preview. */
  authoring?: boolean;
  /** Colour for text, charts and icons without their own: dark on a light slide, light on a dark one. */
  ink?: string;
  [key: string]: unknown;
};

export type PresentationNode = Node<PresentationNodeData, PresentationElement["type"]>;

const RESIZE_HANDLES = [-1, 0, 1].flatMap(y => [-1, 0, 1].filter(x => x || y).map(x => ({ x, y })));

function Resizer({ selected, data }: { selected: boolean; data: PresentationNodeData }) {
  const { zoom } = useViewport();
  const flow = useReactFlow();
  const t = useTranslations("wiki.presentations");
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  if (!selected || !data.editable || data.resizable === false || isLinearShape(data.element)) return null;
  const element = data.element;
  const beginResize = (event: React.PointerEvent<HTMLButtonElement>, x: number, y: number) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    data.onGestureStart?.();
    const button = event.currentTarget, pointerId = event.pointerId;
    button.closest<HTMLElement>("[data-presentation-canvas]")?.focus();
    button.setPointerCapture(pointerId);
    const start = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const proportional = x !== 0 && y !== 0 && ((element.type === "image" || element.type === "icon") ? !event.shiftKey : event.shiftKey);
      data.onResizeChange?.(resizePresentationElement(element, { x, y }, { x: point.x - start.x, y: point.y - start.y }, proportional, event.altKey), proportional || event.altKey || Boolean(element.rotation));
    };
    const end = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end); window.removeEventListener("blur", end);
      window.removeEventListener("presentation-cancel-gesture", end);
      cleanup.current = null;
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      data.onGestureEnd?.();
    };
    cleanup.current = end;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end); window.addEventListener("blur", end);
    window.addEventListener("presentation-cancel-gesture", end);

  };
  return <ViewportPortal><div className="pointer-events-none absolute" style={{ left: element.x, top: element.y, width: element.width, height: element.height, transform: `rotate(${element.rotation}deg)`, zIndex: 2000 }}>
    {RESIZE_HANDLES.map(({ x, y }) => <button
      key={`${x}-${y}`} type="button" aria-label={t("scaleHandle")}
      data-resize-handle={`${x},${y}`}
      className="nodrag nopan pointer-events-auto touch-none absolute -translate-x-1/2 -translate-y-1/2 rounded-xs border border-indigo-500 bg-background"
      style={{ left: `${(x + 1) * 50}%`, top: `${(y + 1) * 50}%`, width: 10 / zoom, height: 10 / zoom, borderWidth: 1 / zoom, cursor: x === 0 ? "ns-resize" : y === 0 ? "ew-resize" : x === y ? "nwse-resize" : "nesw-resize" }}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => beginResize(event, x, y)} />)}
  </div></ViewportPortal>;
}

type TextContent = Extract<PresentationElement, { type: "text" }>["content"];

/**
 * The inline rich-text editor of a text box or a shape. Same box and typography as the
 * rendered text, so the text does not move on entering edit mode.
 */
function TextEditSurface({ element, content, data, setEditing, className, style }: {
  element: Extract<PresentationElement, { type: "text" | "shape" }>; content: TextContent; data: PresentationNodeData; setEditing: (editing: boolean) => void; className?: string; style?: CSSProperties;
}) {
  const box = textBoxCss(content.body, textBodyDefaults(element));
  const scale = element.type === "shape" ? shapeShrinkScale(element) : 1;
  return <div className={cn("nodrag nopan nowheel cursor-text", className)} style={{ ...presentationTextStyle(content, scale), ...box.outer, ...style }} onBlur={event => {
    // Decided a frame later: remounting the editor (React's development double mount)
    // drops focus for a moment and gives it back.
    const surface = event.currentTarget;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (surface.isConnected && !surface.contains(active) && !active?.closest("[data-editor-command-search], [data-presentation-text-toolbar], [data-text-toolbar-popup]")) setEditing(false);
    });
  }} onKeyDown={event => {
    // Escape, and F2 as in PowerPoint, leave text editing with the object still selected.
    if (event.key === "Escape" || event.key === "F2") { event.preventDefault(); event.stopPropagation(); setEditing(false); event.currentTarget.closest<HTMLElement>("[data-presentation-canvas]")?.focus(); }
  }}>
    <div style={box.inner} className="min-h-0 [&>div]:h-auto [&_.ProseMirror]:h-auto [&_.ProseMirror]:min-h-[1.15em]">
      <PresentationRichText inline autoFocus={!data.editingDeferred} elementId={element.id} content={content} onChange={next => data.onRichTextChange?.(element.id, next)} onReady={editor => data.onTextEditorReady?.(element.id, editor)} />
    </div>
  </div>;
}

function TextNode({ data, selected }: NodeProps<PresentationNode>) {
  const element = data.element;
  if (element.type !== "text") return null;
  const { fontSize, bold, color, align } = element.content;
  const setEditing = (editing: boolean) => data.onEditingChange?.(element.id, editing);

  return (
    <div
      inert={data.hidden || undefined}
      className={cn(
        "h-full w-full",
        data.editable && "cursor-move rounded-sm active:cursor-grabbing",
        data.editable && selected && "ring-2 ring-indigo-500/60",
      )}
    >
      <Resizer selected={Boolean(selected)} data={data} />
      {data.editing && data.editable ? (
        <TextEditSurface element={element} content={element.content} data={data} setEditing={setEditing} className={cn("h-full w-full", !color && !data.ink && "text-foreground")}
          style={!color && data.ink ? { color: data.ink } : undefined} />
      ) : (
        <div
          className={cn("h-full w-full overflow-hidden whitespace-pre-wrap break-words leading-tight", !color && !data.ink && "text-foreground")}
          style={{ fontSize, fontWeight: bold ? 700 : 400, textAlign: align, color: color || data.ink }}
          data-presentation-text={element.id}
          onDoubleClick={() => { if (data.editable) setEditing(true); }}
        >
          <PresentationContent element={element} interactive={!data.editable} />
        </div>
      )}
    </div>
  );
}

function ImageNode({ data, selected }: NodeProps<PresentationNode>) {
  const element = data.element;
  if (element.type !== "image") return null;
  return (
    <div
      inert={data.hidden || undefined}
      className={cn(
        "h-full w-full overflow-hidden",
        data.editable && "cursor-move active:cursor-grabbing",
        data.editable && selected && "ring-2 ring-indigo-500/60",
      )}
    >
      <Resizer selected={Boolean(selected)} data={data} />
      <PresentationContent element={element} mediaUrl={data.mediaUrl} />
    </div>
  );
}

/** Screen width of the band along a frame's outline that grabs and moves the frame. */
const FRAME_EDGE_HIT = 12;

function FrameNode({ data, selected }: NodeProps<PresentationNode>) {
  const { zoom } = useViewport();
  const element = data.element;
  if (element.type !== "frame") return null;
  const { label, shape, color } = element.content;
  return (
    <div
      inert={data.hidden || undefined}
      data-drop-target={data.dropTarget || undefined}
      className={cn(
        "h-full w-full",
        data.editable && "cursor-move active:cursor-grabbing",
        data.editable && selected && "ring-2 ring-indigo-500/60",
        data.dropTarget && "bg-indigo-500/5 ring-4 ring-indigo-500",
        shape !== "none" && "border-2",
        shape === "circle" && "rounded-full",
        shape === "rect" && "rounded-xl",
        // An invisible frame is a pure camera target — it stays outlined in the editor
        // so it can be grabbed, and disappears in the player.
        shape === "none" && data.editable && "rounded-xl border-2 border-dashed opacity-50",
        shape !== "none" && !color && !data.ink && "border-foreground/40",
      )}
      // Without a colour of its own the outline follows the slide: dark on light, light on dark.
      style={shape !== "none" && (color || data.ink) ? { borderColor: color || `${data.ink}66` } : undefined}
    >
      {/* Only the outline and the label receive pointer events: they move the frame. A click
          on the empty interior reaches the pane (which selects the frame) and a drag there
          draws a marquee. The band is sized in screen pixels -- non-scaling-stroke ignores the
          viewport's CSS scale -- and sits under the resize handles, so grabbing the edge
          between two handles moves the frame. */}
      {!data.hidden && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden data-frame-edge>
          {shape === "circle" ? (
            <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="none" stroke="transparent" strokeWidth={FRAME_EDGE_HIT / zoom} pointerEvents="stroke" />
          ) : (
            <rect width="100%" height="100%" rx={12} fill="none" stroke="transparent" strokeWidth={FRAME_EDGE_HIT / zoom} pointerEvents="stroke" />
          )}
        </svg>
      )}
      <Resizer selected={Boolean(selected)} data={data} />
      {/* A frame's name is for the author; while presenting, the slide speaks for itself. */}
      {label && data.authoring && (
        <span
          data-frame-label
          className="pointer-events-auto absolute -top-6 left-0 max-w-full truncate text-sm font-medium"
          style={{ color: color || data.ink || undefined }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * SVG rather than styled divs: a rectangle and an ellipse are as cheap either way, but an
 * arrow and a line are not, and one drawing path keeps stroke and fill behaving alike.
 * Rotation stays on the node wrapper, so it applies to shapes exactly as to everything else.
 */
function ShapeNode({ data, selected }: NodeProps<PresentationNode>) {
  const element = data.element;
  if (element.type !== "shape") return null;
  const setEditing = (editing: boolean) => data.onEditingChange?.(element.id, editing);
  return <div inert={data.hidden || undefined} style={data.ink ? { color: data.ink } : undefined} className={cn("h-full w-full", !data.ink && "text-foreground", data.editable && "cursor-move", data.editable && selected && !isLinearShape(element) && "ring-2 ring-indigo-500/60")}>
    <Resizer selected={Boolean(selected)} data={data} />
    {data.editing && data.editable ? (
      // The drawing stays put; the text editor sits over it, centred like the rendered text.
      <div className="relative h-full w-full">
        <div className="pointer-events-none absolute inset-0"><PresentationShape element={element} mediaUrl={data.mediaUrl} /></div>
        <div className="absolute" style={shapeTextBox(element)}>
          <TextEditSurface element={element} content={shapeTextContent(element.content)} data={data} setEditing={setEditing} className="absolute inset-0" />
        </div>
      </div>
    ) : <div className="pointer-events-none h-full w-full"><PresentationContent element={element} interactive={false} mediaUrl={data.mediaUrl} /></div>}
    {selected && data.editable && data.resizable !== false && isLinearShape(element) && data.lookupElement && data.onLineEndDrop &&
      <LineEndHandles element={element} lookup={data.lookupElement} onDrop={(end, drop) => data.onLineEndDrop?.(element.id, end, drop)} />}
    {selected && data.editable && data.resizable !== false && !isLinearShape(element) && data.onAdjust &&
      <AdjustHandle element={element} onAdjust={(patch) => data.onAdjust?.(element.id, patch)} onGestureStart={data.onGestureStart} onGestureEnd={data.onGestureEnd} />}
  </div>;
}

function ContentNode({ data, selected }: NodeProps<PresentationNode>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (data.hidden) ref.current?.querySelectorAll("video,audio").forEach((media) => (media as HTMLMediaElement).pause());
  }, [data.hidden]);
  return <div ref={ref} inert={data.hidden || undefined} style={data.ink ? { color: data.ink } : undefined} className={cn("h-full w-full", data.editable && "cursor-move active:cursor-grabbing", data.editable && selected && "ring-2 ring-indigo-500/60")}>
    <Resizer selected={Boolean(selected)} data={data} />
    <div className={data.editable ? "pointer-events-none h-full w-full" : "nodrag nopan nowheel h-full w-full"}>
      <PresentationContent element={data.element} mediaUrl={data.mediaUrl} interactive={!data.editable} />
    </div>
  </div>;
}
export const presentationNodeTypes = { text: TextNode, image: ImageNode, frame: FrameNode, shape: ShapeNode, video: ContentNode, audio: ContentNode, chart: ContentNode, icon: ContentNode };

/**
 * Frames sit behind everything else so a text block placed inside one stays grabbable.
 * Within each of those two bands the array index decides what paints on top, which is what
 * "bring to front" / "send to back" reorder. The band offset is larger than the 500-element
 * cap, so a frame can never climb over content.
 */
const FRONT_BAND = 1_000;

// Nodes are rebuilt on every canvas change. Handing React Flow the previous object for an
// element whose node did not change lets it skip that node instead of re-rendering them all.
const nodeCache = new WeakMap<PresentationElement, PresentationNode>();
const sameValue = (a: unknown, b: unknown) => a === b || (!!a && !!b && typeof a === "object" && typeof b === "object"
  && Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => (b as Record<string, unknown>)[key] === value));
function cachedNode(node: PresentationNode) {
  const cached = nodeCache.get(node.data.element);
  if (cached && Object.keys(node).length === Object.keys(cached).length
    && Object.entries(node).every(([key, value]) => sameValue(value, cached[key as keyof PresentationNode]))) return cached;
  nodeCache.set(node.data.element, node);
  return node;
}

export function elementsToNodes(
  elements: PresentationElement[],
  options: {
    editable: boolean;
    selectedIds?: Set<string>;
    onGestureStart?: () => void;
    onGestureEnd?: () => void;
    onTextChange?: (id: string, text: string) => void;
    editingId?: string | null;
    deferredId?: string | null;
    onEditingChange?: (id: string, editing: boolean) => void;
    onTextEditorReady?: (id: string, editor: Editor) => void;
  onRichTextChange?: (id: string, content: TextContent) => void;
  onResizeChange?: (element: PresentationElement, free: boolean) => void;
  onLineEndDrop?: (id: string, end: 0 | 1, drop: LineEndDrop) => void;
  onAdjust?: (id: string, patch: { adjust?: number; cornerRadius?: number; adjustments?: Record<string, number> }) => void;
    /** Ids currently hidden so they can fade in — the player's step-arrival entrance. */
    enteringIds?: Set<string>;
    hiddenIds?: Set<string>;
    animationMs?: number;
    mediaUrl?: (id: string) => string;
    dropTargetId?: string | null;
    /** The presentation background, which text on the bare canvas reads against. */
    background?: string;
    /** Elements that open a detail page while presenting: they lift under the pointer. */
    openerIds?: Set<string>;
  },
): PresentationNode[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const lookupElement = (id: string) => byId.get(id);
  const inks = presentationDefaultInks(elements, options.background);
  return elements.map((element, index) => {
    const locked = isPresentationElementLocked(elements, element.id);
    const style: CSSProperties = element.type === "frame" ? { pointerEvents: "none" } : {};
    // Empty space and section interiors use the pane cursor; only selectable
    // object surfaces advertise selection/movement, including locked objects.
    if (options.selectedIds !== undefined) {
      style.cursor = options.editable && !locked ? "move" : "pointer";
    }
    // Node styles override React Flow's positioning transform. Keep the translation or
    // rotating an element teleports it back to the canvas origin.
    if (element.rotation) {
      style.transform = `translate(${element.x}px, ${element.y}px) rotate(${element.rotation}deg)`;
      style.transformOrigin = "center center";
    }
    if (element.background) style.backgroundColor = element.background;
    if (options.hiddenIds) {
      style.opacity = options.hiddenIds.has(element.id) ? 0 : 1;
      style.pointerEvents = options.hiddenIds.has(element.id) ? "none" : style.pointerEvents;
      style.transition = `opacity ${options.animationMs ?? 300}ms ease`;
    }
    if (options.enteringIds?.has(element.id) && !options.hiddenIds?.has(element.id)) {
      // Fixed, subtle fade on step arrival — deliberately not a per-element setting.
      // A keyframe animation (not a state-driven transition) plays once whenever this
      // element newly becomes part of the arriving step.
      style.animation = "presentation-element-enter 300ms ease";
    }
    return cachedNode({
      id: element.id,
      type: element.type,
      position: { x: element.x, y: element.y },
      width: element.width,
      height: element.height,
      selected: Boolean(options.selectedIds?.has(element.id)),
      draggable: options.editable && !locked,
      selectable: options.selectedIds !== undefined,
      connectable: false,
      deletable: options.editable && !locked,
      zIndex: (element.type === "frame" ? 0 : FRONT_BAND) + index,
      className: options.openerIds?.has(element.id) ? "presentation-opener" : undefined,
      style: Object.keys(style).length ? style : undefined,
      data: {
        element,
        editable: options.editable && !locked,
        resizable: options.selectedIds?.size === 1,
        onGestureStart: options.onGestureStart,
        onGestureEnd: options.onGestureEnd,
        onTextChange: options.onTextChange,
        onRichTextChange: options.onRichTextChange,
        onLineEndDrop: options.onLineEndDrop,
        onAdjust: options.onAdjust,
        // Only a selected line draws end handles; a fresh lookup there keeps them from reading stale elements.
        lookupElement: options.onLineEndDrop && options.selectedIds?.has(element.id) ? lookupElement : undefined,
        onResizeChange: options.onResizeChange,
        mediaUrl: options.mediaUrl,
        hidden: options.hiddenIds?.has(element.id),
        dropTarget: options.dropTargetId === element.id || undefined,
        editing: isTextHost(element) && options.editingId === element.id,
        editingDeferred: options.deferredId === element.id || undefined,
        onEditingChange: options.onEditingChange,
        onTextEditorReady: options.onTextEditorReady,
        ink: inks.get(element.id) ?? (element.type === "frame" ? inkOn(options.background) : undefined),
        authoring: options.selectedIds !== undefined,
      },
    });
  });
}
