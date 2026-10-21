"use client";
// Everything the Format pane, the format ribbon and the shape tools need from the editor:
// content updates for the selection, the inline text editor's format API, Change Shape, Merge
// Shapes, Edit Points, Set as Default, Lock Drawing Mode and the eyedropper. Used by
// presentation-editor.tsx.
import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { createId } from "@paralleldrive/cuid2";
import { toast } from "sonner";
import type { PresentationCanvasAction } from "../../lib/presentation-canvas-state";
import { isPresentationElementLocked, type PresentationElement, type PresentationSettings } from "../../lib/presentation";
import { growPresentationText } from "../../lib/presentation-layout";
import { mergeShapes } from "../../lib/presentation-merge-shapes";
import { toEditableFreeform } from "../../lib/presentation-path-edit";
import { pickDefaults } from "../../lib/presentation-shape-defaults";
import { fitShapeToText, isTextHost } from "../../lib/presentation-text-host";
import { isLinearShape } from "../../lib/presentation-interactions";
import type { PresetGalleryEntry } from "../../lib/preset-shapes/preset-gallery";
import { combineTextFormats, textFormatFor, useEditorRefresh } from "./use-text-format";
import type { MergeOperation } from "./format-pane/format-ribbon";

type Shape = Extract<PresentationElement, { type: "shape" }>;
type TextHost = Extract<PresentationElement, { type: "text" | "shape" }>;

/** Recomputes what a content edit changes about the box: grow-to-fit text boxes and shapes. */
function refit(element: PresentationElement, source: PresentationElement): PresentationElement {
  if (element.type === "text" && element.content !== source.content) return growPresentationText(element);
  if (element.type === "shape" && element.content !== source.content) return fitShapeToText(element);
  return element;
}

/** The colour an object shows, for the eyedropper where the browser has none of its own. */
function elementColor(element: PresentationElement | undefined): string | null {
  if (!element) return null;
  if (element.type === "shape") return element.content.fillStyle?.type === "gradient" ? element.content.fillStyle.stops[0].color : element.content.fillStyle?.type === "pattern" ? element.content.fillStyle.foreground : element.content.fill || element.content.stroke || null;
  if (element.type === "text") return element.content.runs?.find((run) => run.color)?.color || element.content.color || null;
  if (element.type === "frame") return element.content.color || null;
  if (element.type === "icon") return element.content.color || null;
  return element.background || null;
}

export function usePresentationFormatting({ elements, selection, selectedIds, settings, dispatch, updateSettings, setSelectedIds, disabled, editingId, onEditorReady, startGesture, endGesture, presentationId, t }: {
  elements: PresentationElement[]; selection: PresentationElement[]; selectedIds: string[]; settings: PresentationSettings;
  dispatch: (action: PresentationCanvasAction) => void; updateSettings: (update: Partial<PresentationSettings>) => void;
  setSelectedIds: (ids: string[]) => void; disabled: boolean; editingId: string | null; onEditorReady: (id: string, editor: Editor) => void;
  startGesture: () => void; endGesture: () => void; presentationId: string; t: (key: string) => string;
}) {
  const [editor, setEditor] = useState<{ id: string; editor: Editor } | null>(null);
  const textEditor = editor && editor.id === editingId && !editor.editor.isDestroyed ? editor.editor : null;
  useEditorRefresh(textEditor);
  const onTextEditorReady = useCallback((id: string, next: Editor) => { setEditor({ id, editor: next }); onEditorReady(id, next); }, [onEditorReady]);

  const editable = selection.filter((element) => !isPresentationElementLocked(elements, element.id));
  const shapes = editable.filter((element): element is Shape => element.type === "shape");
  const texts = editable.filter((element): element is TextHost => isTextHost(element));
  const commit = useCallback((change: (current: PresentationElement[]) => PresentationElement[]) => dispatch({ type: "edit", at: Date.now(), separate: true, elements: change }), [dispatch]);

  const updateContent = useCallback((id: string, change: (content: TextHost["content"]) => TextHost["content"]) => {
    if (disabled) return;
    commit((current) => current.map((element) => {
      if (element.id !== id || (element.type !== "text" && element.type !== "shape") || isPresentationElementLocked(current, id)) return element;
      return refit({ ...element, content: change(element.content) } as PresentationElement, element);
    }));
  }, [commit, disabled]);
  const updateMany = useCallback((ids: Set<string>, change: (content: TextHost["content"]) => TextHost["content"]) => {
    if (disabled || !ids.size) return;
    commit((current) => current.map((element) => ids.has(element.id) && (element.type === "text" || element.type === "shape") && !isPresentationElementLocked(current, element.id)
      ? refit({ ...element, content: change(element.content) } as PresentationElement, element) : element));
  }, [commit, disabled]);
  const shapeIds = new Set(shapes.map((s) => s.id)), textIds = new Set(texts.map((s) => s.id));
  const updateShapes = (change: (content: Shape["content"]) => Shape["content"]) => updateMany(shapeIds, (content) => change(content as Shape["content"]));
  const updateTexts = (change: (content: TextHost["content"]) => TextHost["content"]) => updateMany(textIds, change);

  // While a text is being edited the formats act on its selection; otherwise on all selected texts.
  const editingHost = texts.find((element) => element.id === editingId) ?? null;
  const format = editingHost && textEditor ? textFormatFor(editingHost, textEditor, updateContent)
    : combineTextFormats(texts.map((element) => textFormatFor(element, null, updateContent)!).filter(Boolean));

  /** Change Shape keeps fill, line, effects and text; only the geometry is replaced (adjustments reset). */
  const changeShape = (entry: PresetGalleryEntry) => {
    if (entry.tool) return;
    updateShapes((content) => {
      const { adjustments: _a, adjust: _b, freeform: _c, cornerRadius: _d, ...rest } = content;
      void _a; void _b; void _c; void _d;
      return { ...rest, preset: entry.id as Shape["content"]["preset"] };
    });
  };

  const mergeable = shapes.filter((shape) => !isLinearShape(shape) && !shape.content.connection);
  const canMerge = !disabled && mergeable.length >= 2;
  /** The primary shape is the first one selected, as in PowerPoint; selectedIds keep click order. */
  const mergeSelection = (op: MergeOperation) => {
    const ordered = selectedIds.filter((id) => mergeable.some((shape) => shape.id === id));
    const result = mergeShapes(elements, ordered, op, () => createId());
    if (!result) { toast.error(t("presentations.mergeShapes.empty")); return; }
    commit(() => result.elements);
    setSelectedIds(result.created);
  };

  const [editPointsId, setEditPointsId] = useState<string | null>(null);
  const editPointsElement = editPointsId ? elements.find((element): element is Shape => element.id === editPointsId && element.type === "shape" && Boolean(element.content.freeform)) ?? null : null;
  const canEditPoints = !disabled && shapes.length === 1 && !isLinearShape(shapes[0]) && !shapes[0].content.connection;
  const startEditPoints = () => {
    const shape = shapes[0];
    const next = shape && toEditableFreeform(shape);
    if (!shape || !next) { toast.error(t("presentations.editPoints.unavailable")); return; }
    if (!shape.content.freeform) commit((current) => current.map((element) => element.id === shape.id ? next : element));
    setEditPointsId(shape.id);
  };
  const replaceElement = useCallback((next: PresentationElement) => {
    dispatch({ type: "edit", at: Date.now(), elements: (current) => current.map((element) => element.id === next.id ? next : element) });
  }, [dispatch]);

  const canSetDefault = !disabled && editable.length === 1 && Boolean(pickDefaults(editable[0]));
  const setAsDefault = () => {
    const picked = editable[0] && pickDefaults(editable[0]);
    if (!picked) return;
    updateSettings({ defaults: { ...settings.defaults, [picked.kind]: picked.defaults } });
    toast.success(t(`presentations.formatPane.defaults.${picked.kind}Set`));
  };

  // The eyedropper where the browser has none: the next click on an object takes its colour.
  const [picking, setPicking] = useState(false);
  const resolver = useRef<((color: string | null) => void) | null>(null);
  const requestColor = useCallback(() => new Promise<string | null>((resolve) => { resolver.current?.(null); resolver.current = resolve; setPicking(true); }), []);
  const finishPick = useCallback((color: string | null) => { resolver.current?.(color); resolver.current = null; setPicking(false); }, []);
  const pickAt = (clientX: number, clientY: number) => {
    const node = document.elementsFromPoint(clientX, clientY).map((el) => el.closest<HTMLElement>(".react-flow__node")).find(Boolean);
    finishPick(elementColor(elements.find((element) => element.id === node?.dataset.id)));
  };

  const uploadPicture = useCallback(async (file: File) => {
    try {
      const body = new FormData(); body.append("file", file); body.append("entityType", "wikiPresentation"); body.append("entityId", presentationId);
      const response = await fetch("/api/files", { method: "POST", body });
      const payload = (await response.json()) as { id?: string };
      if (!response.ok || !payload.id) throw new Error("upload failed");
      return payload.id;
    } catch { toast.error(t("presentations.uploadFailed")); return null; }
  }, [presentationId, t]);

  const [pane, setPane] = useState<{ open: boolean; group: "shape" | "text"; key: number }>({ open: false, group: "shape", key: 0 });
  const openPane = (group: "shape" | "text") => setPane((current) => ({ open: true, group, key: current.key + 1 }));

  return {
    onTextEditorReady, textEditor, shapes, texts, format, updateContent, updateShapes, updateTexts,
    changeShape, canMerge, mergeSelection, editPointsElement, canEditPoints, startEditPoints, stopEditPoints: () => setEditPointsId(null), replaceElement,
    startGesture, endGesture, canSetDefault, setAsDefault, picking, requestColor, finishPick, pickAt, uploadPicture, pane, openPane, closePane: () => setPane((current) => ({ ...current, open: false })),
  };
}
