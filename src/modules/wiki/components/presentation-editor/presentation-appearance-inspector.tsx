"use client";
// Appearance section of the presentation properties panel for one selected element: z-order,
// duplicate/delete, and the text, image, frame and shape specific fields. Used by presentation-editor.tsx.
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownToLine, ArrowUpToLine, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { useCollaborationContext } from "../../collaboration/ui";
import { isLinearShape } from "../../lib/presentation-interactions";
import { presentationTextFits } from "../../lib/presentation-layout";
import { presentationFrameShapes, presentationShapeKinds, type PresentationElement } from "../../lib/presentation";
import { PresentationRichText } from "../presentation-rich-text";
import { DraftInput, DraftTextarea } from "./draft-fields";
import { parseNumberInput } from "./presentation-editor-utils";

export function PresentationAppearanceInspector({
  selected, disabled, selectedLocked, collaboration, updateElement, reorderSelected, duplicateSelection, deleteSelection,
  onRichTextChange, onTextChange, colorField, colorSwatches, interact,
}: {
  selected: PresentationElement;
  disabled: boolean;
  selectedLocked: boolean;
  collaboration: ReturnType<typeof useCollaborationContext>;
  updateElement: (id: string, update: (element: PresentationElement) => PresentationElement) => void;
  reorderSelected: (id: string, to: "front" | "back") => void;
  duplicateSelection: (ids: string[]) => void;
  deleteSelection: (ids: string[]) => void;
  onRichTextChange: (id: string, content: Extract<PresentationElement, { type: "text" }>["content"]) => void;
  onTextChange: (id: string, text: string) => void;
  colorField: (label: string, value: string, onPick: (color: string) => void) => ReactNode;
  colorSwatches: (value: string, onPick: (color: string) => void) => ReactNode;
  interact: (key: string) => string;
}) {
  const t = useTranslations("wiki");
  return (
    <details id="presentation-tool-appearance" name="presentation-inspector" open className="my-3 scroll-mt-4 rounded-lg border p-3">
      <summary className="mb-3 cursor-pointer text-sm font-semibold">{t("presentations.selectionTools.appearance")}</summary>
      <fieldset disabled={disabled || selectedLocked} className="min-w-0">
      <div className="flex items-center justify-between gap-1">
        <h2 className="min-w-0 truncate text-xs font-semibold tracking-wide uppercase">{t(`presentations.elementTypes.${selected.type}`)}</h2>
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.bringToFront")} onClick={() => reorderSelected(selected.id, "front")}>
            <ArrowUpToLine className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.sendToBack")} onClick={() => reorderSelected(selected.id, "back")}>
            <ArrowDownToLine className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.duplicateElement")} onClick={() => duplicateSelection([selected.id])}>
            <Copy className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.deleteElement")} onClick={() => deleteSelection([selected.id])}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {!(selected.type === "shape" && (selected.content.shape === "arrow" || selected.content.shape === "doubleArrow" || selected.content.shape === "line")) && colorField(t("presentations.elementBackground"), selected.background ?? "", (color) =>
          updateElement(selected.id, (element) => ({ ...element, background: color })),
        )}
      </div>

      {selected.type === "text" && (
        <div className="mt-3 space-y-3">
          {collaboration ? <PresentationRichText key={selected.id} elementId={selected.id}
            content={selected.content} onChange={content => onRichTextChange(selected.id, content)} disabled={disabled || selectedLocked}
            inline autoFocus={false} label={t("presentations.textContent")} /> : (
          <DraftTextarea
            key={selected.id}
            aria-label={t("presentations.textContent")}
            value={selected.content.text}
            maxLength={5_000}
            rows={4}
            onCommit={(text) => onTextChange(selected.id, text)}
          />
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={Boolean(selected.content.autoFit)} onCheckedChange={(checked) => updateElement(selected.id, element => element.type === "text" ? { ...element, content: { ...element.content, autoFit: checked ? { minFontSize: Math.min(12, element.content.fontSize), maxFontSize: element.content.fontSize } : undefined } } : element)} />
            {t("presentations.layout.autoFit")}
          </label>
          {selected.content.autoFit && <p className="text-xs text-muted-foreground">{t("presentations.layout.autoFitHint")}</p>}
          {selected.content.autoFit && !presentationTextFits(selected) && <p role="status" className="text-xs text-amber-700">{t("presentations.layout.overcrowded")}</p>}
          <label className="block text-xs text-muted-foreground">{t("presentations.layout.padding")}
            <DraftInput type="number" min={0} max={100} value={String(selected.content.padding ?? 0)} normalise={raw => String(parseNumberInput(raw, 0, 100) ?? 0)} onCommit={next => updateElement(selected.id, element => element.type === "text" ? { ...element, content: { ...element.content, padding: Number(next) } } : element)} />
          </label>
          <label className="block text-xs text-muted-foreground">
            {t("presentations.fontSize")}
            <DraftInput
              type="number"
              min={8}
              max={400}
              className="mt-1 h-8"
              key={`${selected.id}-size`}
              value={String(selected.content.autoFit?.maxFontSize ?? selected.content.fontSize)}
              normalise={(raw) => String(Math.round(parseNumberInput(raw, 8, 400) ?? selected.content.fontSize))}
              onCommit={(next) =>
                updateElement(selected.id, (element) =>
                  element.type === "text" ? { ...element, content: { ...element.content, fontSize: Number(next), autoFit: element.content.autoFit ? { minFontSize: Math.min(element.content.autoFit.minFontSize, Number(next)), maxFontSize: Number(next) } : undefined } } : element,
                )
              }
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant={selected.content.bold ? "default" : "outline"}
              size="sm"
              onClick={() =>
                updateElement(selected.id, (element) =>
                  element.type === "text" ? { ...element, content: { ...element.content, bold: !element.content.bold } } : element,
                )
              }
            >
              {t("presentations.bold")}
            </Button>
            {(["left", "center", "right"] as const).map((align) => (
              <Button
                key={align}
                type="button"
                variant={selected.content.align === align ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  updateElement(selected.id, (element) =>
                    element.type === "text" ? { ...element, content: { ...element.content, align } } : element,
                  )
                }
              >
                {t(`presentations.align.${align}`)}
              </Button>
            ))}
          </div>
          {colorSwatches(selected.content.color, (color) =>
            updateElement(selected.id, (element) =>
              element.type === "text" ? { ...element, content: { ...element.content, color } } : element,
            ),
          )}
        </div>
      )}

      {selected.type === "shape" && selected.content.connection && <div className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">{t("presentations.layout.connectedHint")}</p>
        <Button size="sm" variant="outline" onClick={() => updateElement(selected.id, element => element.type === "shape" ? { ...element, content: { ...element.content, connection: undefined } } : element)}>{t("presentations.layout.detach")}</Button>
      </div>}
      {selected.type === "image" && (
        <label className="mt-3 block text-xs text-muted-foreground">
          {t("presentations.altText")}
          <DraftInput
            key={selected.id}
            className="mt-1 h-8"
            value={selected.content.alt}
            maxLength={500}
            onCommit={(alt) =>
              updateElement(selected.id, (element) =>
                element.type === "image" ? { ...element, content: { ...element.content, alt } } : element,
              )
            }
          />
        </label>
      )}

      {selected.type === "frame" && (
        <div className="mt-3 space-y-3">
          <label className="block text-xs text-muted-foreground">
            {t("presentations.frameLabel")}
            <DraftInput
              key={selected.id}
              className="mt-1 h-8"
              value={selected.content.label}
              data-linked-heading-title=""
              maxLength={200}
              onCommit={(label) =>
                updateElement(selected.id, (element) =>
                  element.type === "frame" ? { ...element, content: { ...element.content, label } } : element,
                )
              }
            />
          </label>
          <div className="flex gap-1.5">
            {presentationFrameShapes.map((shape) => (
              <Button
                key={shape}
                type="button"
                variant={selected.content.shape === shape ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  updateElement(selected.id, (element) =>
                    element.type === "frame" ? { ...element, content: { ...element.content, shape } } : element,
                  )
                }
              >
                {t(`presentations.frameShapes.${shape}`)}
              </Button>
            ))}
          </div>
          {colorSwatches(selected.content.color, (color) =>
            updateElement(selected.id, (element) =>
              element.type === "frame" ? { ...element, content: { ...element.content, color } } : element,
            ),
          )}
        </div>
      )}

      {selected.type === "shape" && <div className="mt-3 space-y-2">
        {selected.content.shape === "roundedRect" && <label className="block text-xs">{interact("cornerRadius")}<DraftInput type="number" min={0} max={1000} value={String(selected.content.cornerRadius ?? 20)} normalise={raw => String(Math.max(0, Math.min(1000, Number(raw) || 0)))} onCommit={value => updateElement(selected.id, e => e.type === "shape" ? { ...e, content: { ...e.content, cornerRadius: Number(value) } } : e)} /></label>}
        <label className="block text-xs">{interact("dashPattern")}<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={selected.content.dash ?? "solid"} onChange={event => { const dash = event.target.value as "solid" | "dash" | "dot"; updateElement(selected.id, e => e.type === "shape" ? { ...e, content: { ...e.content, dash } } : e); }}>{["solid", "dash", "dot"].map(value => <option key={value} value={value}>{interact(value)}</option>)}</select></label>
        {isLinearShape(selected) && <>{(["startHead", "endHead"] as const).map(field => <label key={field} className="block text-xs">{interact(field)}<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={selected.content[field] ?? (field === "startHead" ? selected.content.shape === "doubleArrow" ? "triangle" : "none" : selected.content.shape === "line" ? "none" : "triangle")} onChange={event => { const value = event.target.value as "none" | "triangle" | "open"; updateElement(selected.id, e => e.type === "shape" ? { ...e, content: { ...e.content, [field]: value } } : e); }}>{["none", "triangle", "open"].map(value => <option key={value} value={value}>{interact(value)}</option>)}</select></label>)}<label className="block text-xs">{interact("headSize")}<DraftInput type="number" min={1} max={1000} value={String(selected.content.headSize ?? Math.max(10, selected.content.strokeWidth * 3))} normalise={raw => String(Math.max(1, Math.min(1000, Number(raw) || 1)))} onCommit={value => updateElement(selected.id, e => e.type === "shape" ? { ...e, content: { ...e.content, headSize: Number(value) } } : e)} /></label></>}
      </div>}
      {selected.type === "shape" && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {presentationShapeKinds.filter(shape => !selected.content.connection || shape === "arrow" || shape === "doubleArrow" || shape === "line").map((shape) => (
              <Button
                key={shape}
                type="button"
                variant={selected.content.shape === shape ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  updateElement(selected.id, (element) =>
                    element.type === "shape" ? { ...element, content: { ...element.content, shape } } : element,
                  )
                }
              >
                {t(`presentations.shapeKinds.${shape}`)}
              </Button>
            ))}
          </div>
          {!isLinearShape(selected) && colorField(t("presentations.fill"), selected.content.fill, (fill) =>
            updateElement(selected.id, (element) =>
              element.type === "shape" ? { ...element, content: { ...element.content, fill } } : element,
            ),
          )}
          {colorField(t("presentations.stroke"), selected.content.stroke, (stroke) =>
            updateElement(selected.id, (element) =>
              element.type === "shape" ? { ...element, content: { ...element.content, stroke } } : element,
            ),
          )}
          <label className="block text-xs text-muted-foreground">
            {t("presentations.strokeWidth")}
            <DraftInput
              type="number"
              min={0}
              max={200}
              className="mt-1 h-8"
              key={`${selected.id}-stroke-width`}
              value={String(selected.content.strokeWidth)}
              normalise={(raw) => String(parseNumberInput(raw, 0, 200) ?? selected.content.strokeWidth)}
              onCommit={(next) =>
                updateElement(selected.id, (element) =>
                  element.type === "shape" ? { ...element, content: { ...element.content, strokeWidth: Number(next) } } : element,
                )
              }
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            {t("presentations.opacity")}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              className="mt-1 w-full"
              value={selected.content.opacity}
              onChange={(event) => {
                const opacity = Number(event.target.value);
                updateElement(selected.id, (element) =>
                  element.type === "shape" ? { ...element, content: { ...element.content, opacity } } : element,
                );
              }}
            />
          </label>
        </div>
      )}
      </fieldset>
    </details>
  );
}
