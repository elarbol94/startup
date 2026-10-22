"use client";
// PowerPoint's Shapes gallery and the drawing tool armed from it, and what it drew: inserted
// like any new object, glued where it was drawn, selected. Used by presentation-editor.tsx.
import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { setLineEnd } from "../../lib/presentation-connectors";
import { applyDefaults } from "../../lib/presentation-shape-defaults";
import type { PresetGalleryEntry } from "../../lib/preset-shapes/preset-gallery";
import type { PresentationCanvasAction, PresentationElement, PresentationSettings } from "../../lib/presentation";
import type { DrawGlue } from "./presentation-draw-overlay";
import { frameInsertionEdit } from "./use-presentation-frames";
import type { useRibbonState } from "./ribbon/use-ribbon-state";
import type { usePresentationTextEditing } from "./use-presentation-text-editing";

export function usePresentationDrawTool({ disabled, elements, settings, dispatch, t, setSelectedIds, canvasRef, ribbon, textEditing }: {
  disabled: boolean;
  elements: PresentationElement[];
  settings: PresentationSettings;
  dispatch: (action: PresentationCanvasAction) => void;
  t: ReturnType<typeof useTranslations<"wiki">>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  canvasRef: RefObject<HTMLDivElement | null>;
  ribbon: ReturnType<typeof useRibbonState>;
  textEditing: ReturnType<typeof usePresentationTextEditing>;
}) {
  /** PowerPoint's Shapes gallery, and the drawing tool armed from it. */
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [drawTool, setDrawTool] = useState<PresetGalleryEntry | null>(null);
  /** Lock Drawing Mode: the armed tool stays armed after each object until Escape. */
  const [drawLock, setDrawLock] = useState(false);

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

  return { galleryOpen, setGalleryOpen, drawTool, setDrawTool, drawLock, setDrawLock, createDrawn };
}
