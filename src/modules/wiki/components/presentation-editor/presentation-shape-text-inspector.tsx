"use client";
// Typography of the text inside a closed shape: size, bold, alignment and colour. The text
// itself is typed on the canvas. Used by presentation-appearance-inspector.tsx.
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PresentationElement } from "../../lib/presentation";
import { shapeTextContent } from "../../lib/presentation-text-host";
import { DraftInput } from "./draft-fields";
import { parseNumberInput } from "./presentation-editor-utils";

type Shape = Extract<PresentationElement, { type: "shape" }>;

export function PresentationShapeTextInspector({ selected, updateElement, colorSwatches }: {
  selected: Shape;
  updateElement: (id: string, update: (element: PresentationElement) => PresentationElement) => void;
  colorSwatches: (value: string, onPick: (color: string) => void) => ReactNode;
}) {
  const t = useTranslations("wiki");
  const text = shapeTextContent(selected.content);
  const set = (patch: Partial<Shape["content"]>) =>
    updateElement(selected.id, (element) => element.type === "shape" ? { ...element, content: { ...element.content, ...patch } } : element);
  return (
    <div className="mt-3 space-y-2" data-testid="presentation-shape-text">
      <h3 className="text-xs font-semibold text-muted-foreground">{t("presentations.textContent")}</h3>
      <label className="block text-xs text-muted-foreground">
        {t("presentations.fontSize")}
        <DraftInput type="number" min={8} max={400} className="mt-1 h-8" key={`${selected.id}-shape-size`} value={String(text.fontSize)}
          normalise={(raw) => String(Math.round(parseNumberInput(raw, 8, 400) ?? text.fontSize))}
          onCommit={(next) => set({ fontSize: Number(next) })} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant={text.bold ? "default" : "outline"} onClick={() => set({ bold: !text.bold })}>{t("presentations.bold")}</Button>
        {(["left", "center", "right"] as const).map((align) => (
          <Button key={align} type="button" size="sm" variant={text.align === align ? "default" : "outline"} onClick={() => set({ align })}>{t(`presentations.align.${align}`)}</Button>
        ))}
      </div>
      {colorSwatches(text.color, (color) => set({ color }))}
    </div>
  );
}
