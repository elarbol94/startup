"use client";
// Format Shape → Fill & Line: No/Solid/Gradient/Picture/Pattern fill and the line's colour,
// width, compound type, dash, cap, join and arrowheads, as in PowerPoint's pane.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PresentationElement } from "../../../lib/presentation";
import { arrowHeads, arrowSizes, gradientKinds, lineCaps, lineCompounds, lineDashes, type PresentationGradient } from "../../../lib/presentation-format-model";
import { isLinearShape } from "../../../lib/presentation-interactions";
import { POWERPOINT_PATTERNS, patternTilePath, type PowerPointPattern } from "../../../lib/powerpoint-patterns";
import { defaultGradient } from "../../../lib/powerpoint-theme";
import { gradientPreview } from "../../../lib/presentation-text-style";
import { CheckField, FormatRow, FormatSection, NumberField, PercentField, RadioList, SelectField } from "./format-controls";
import { ThemeColorPicker } from "./theme-color-picker";

type Shape = Extract<PresentationElement, { type: "shape" }>;
type Content = Shape["content"];
export type FormatTabProps = {
  element: Shape; set: (update: (content: Content) => Content) => void; disabled?: boolean;
  onEyedropper?: () => Promise<string | null>; uploadPicture?: (file: File) => Promise<string | null>;
};
type FillKind = "none" | "solid" | "gradient" | "picture" | "pattern";

export function fillKind(c: Content): FillKind {
  if (c.fillStyle) return c.fillStyle.type;
  return c.fill ? "solid" : "none";
}

export function FillLineTab({ element, set, disabled, onEyedropper, uploadPicture }: FormatTabProps) {
  const t = useTranslations("wiki.presentations.formatPane");
  const c = element.content, linear = isLinearShape(element);
  return <div>
    {!linear && <FillSection c={c} set={set} disabled={disabled} onEyedropper={onEyedropper} uploadPicture={uploadPicture} />}
    <FormatSection title={t("line.title")} open testId="format-line">
      <RadioList name={`line-${element.id}`} disabled={disabled} value={c.strokeWidth > 0 && c.stroke !== "transparent" ? "solid" : "none"}
        options={[{ value: "none", label: t("line.none") }, { value: "solid", label: t("line.solid") }]}
        onChange={(kind) => set((x) => kind === "none" ? { ...x, strokeWidth: 0 } : { ...x, strokeWidth: x.strokeWidth || 1.5, stroke: x.stroke || "#156082" })} />
      <FormatRow label={t("color")}><ThemeColorPicker label={t("line.color")} value={c.stroke} onChange={(stroke) => set((x) => ({ ...x, stroke, strokeWidth: x.strokeWidth || 1.5 }))} onEyedropper={onEyedropper} disabled={disabled} testId="format-line-color" /></FormatRow>
      <PercentField label={t("transparency")} value={c.lineTransparency ?? 0} onChange={(v) => set((x) => ({ ...x, lineTransparency: v || undefined }))} disabled={disabled} />
      <NumberField label={t("line.width")} ariaLabel={t("line.widthLabel")} value={c.strokeWidth} min={0} max={200} step={0.25} unit="pt" onChange={(strokeWidth) => set((x) => ({ ...x, strokeWidth }))} disabled={disabled} />
      <SelectField label={t("line.compound")} value={c.compound ?? "single"} disabled={disabled} testId="format-line-compound"
        options={lineCompounds.map((value) => ({ value, label: t(`line.compounds.${value}`) }))} onChange={(compound) => set((x) => ({ ...x, compound: compound === "single" ? undefined : compound }))} />
      <SelectField label={t("line.dash")} value={c.dash === "dot" ? "roundDot" : c.dash ?? "solid"} disabled={disabled} testId="format-line-dash"
        options={lineDashes.filter((d) => d !== "dot").map((value) => ({ value, label: t(`line.dashes.${value}`) }))} onChange={(dash) => set((x) => ({ ...x, dash: dash === "solid" ? undefined : dash }))} />
      <SelectField label={t("line.cap")} value={c.cap ?? "flat"} disabled={disabled}
        options={lineCaps.map((value) => ({ value, label: t(`line.caps.${value}`) }))} onChange={(cap) => set((x) => ({ ...x, cap: cap === "flat" ? undefined : cap }))} />
      <SelectField label={t("line.join")} value={c.join ?? "miter"} disabled={disabled}
        options={(["round", "bevel", "miter"] as const).map((value) => ({ value, label: t(`line.joins.${value}`) }))} onChange={(join) => set((x) => ({ ...x, join: join === "miter" ? undefined : join }))} />
      {linear && (["start", "end"] as const).map((end) => {
        const headKey = end === "start" ? "startHead" : "endHead", sizeKey = end === "start" ? "startSize" : "endSize";
        const head = c[headKey] ?? (end === "start" ? (c.shape === "doubleArrow" ? "triangle" : "none") : (c.shape === "line" ? "none" : "triangle"));
        const size = c[sizeKey] ?? { width: "med", length: "med" };
        return <div key={end} className="space-y-2">
          <SelectField label={t(`line.${end}Type`)} value={head} disabled={disabled} testId={`format-line-${end}-type`}
            options={arrowHeads.map((value) => ({ value, label: t(`line.heads.${value}`) }))} onChange={(next) => set((x) => ({ ...x, [headKey]: next }))} />
          <SelectField label={t(`line.${end}Size`)} value={`${size.width}-${size.length}`} disabled={disabled}
            options={arrowSizes.flatMap((w) => arrowSizes.map((l) => ({ value: `${w}-${l}`, label: t("line.size", { width: t(`line.sizes.${w}`), length: t(`line.sizes.${l}`) }) })))}
            onChange={(next) => { const [width, length] = next.split("-") as ["sm" | "med" | "lg", "sm" | "med" | "lg"]; set((x) => ({ ...x, [sizeKey]: { width, length }, headSize: undefined })); }} />
        </div>;
      })}
    </FormatSection>
  </div>;
}

function FillSection({ c, set, disabled, onEyedropper, uploadPicture }: { c: Content; set: FormatTabProps["set"]; disabled?: boolean; onEyedropper?: FormatTabProps["onEyedropper"]; uploadPicture?: FormatTabProps["uploadPicture"] }) {
  const t = useTranslations("wiki.presentations.formatPane");
  const kind = fillKind(c);
  const choose = (next: FillKind) => set((x) => {
    const base = x.fillStyle?.type === "gradient" ? x.fillStyle.stops[0].color : x.fillStyle?.type === "pattern" ? x.fillStyle.foreground : x.fill || "#156082";
    const { fillStyle: _old, ...rest } = x;
    void _old;
    if (next === "none") return { ...rest, fill: "" };
    if (next === "solid") return { ...rest, fill: base };
    if (next === "gradient") return { ...rest, fill: base, fillStyle: defaultGradient(base) };
    if (next === "pattern") return { ...rest, fill: base, fillStyle: { type: "pattern", pattern: "pct5", foreground: base, background: "#FFFFFF" } };
    return x.fillStyle?.type === "picture" ? x : { ...rest, fill: base };
  });
  return <FormatSection title={t("fill.title")} open testId="format-fill">
    <RadioList name="fill" value={kind} disabled={disabled} onChange={choose}
      options={(["none", "solid", "gradient", "picture", "pattern"] as const).map((value) => ({ value, label: t(`fill.${value}`) }))} />
    {kind === "solid" && <>
      <FormatRow label={t("color")}><ThemeColorPicker label={t("fill.color")} value={c.fill} onChange={(fill) => set((x) => ({ ...x, fill }))} onEyedropper={onEyedropper} disabled={disabled} testId="format-fill-color" /></FormatRow>
      <PercentField label={t("transparency")} value={c.fillTransparency ?? 0} onChange={(v) => set((x) => ({ ...x, fillTransparency: v || undefined }))} disabled={disabled} />
    </>}
    {c.fillStyle?.type === "gradient" && <GradientEditor gradient={c.fillStyle} disabled={disabled} onEyedropper={onEyedropper} onChange={(fillStyle) => set((x) => ({ ...x, fillStyle, fill: fillStyle.stops[0].color }))} />}
    {c.fillStyle?.type === "pattern" && (() => {
      const pattern = c.fillStyle;
      return <>
        <div role="listbox" aria-label={t("fill.pattern")} className="grid grid-cols-8 gap-0.5" data-testid="format-patterns">
          {(Object.keys(POWERPOINT_PATTERNS) as PowerPointPattern[]).map((name) => <button key={name} type="button" role="option" aria-selected={pattern.pattern === name} title={t(`patterns.${name}`)} aria-label={t(`patterns.${name}`)} disabled={disabled}
            className={`size-6 border ${pattern.pattern === name ? "outline outline-2 outline-amber-600" : ""}`} onClick={() => set((x) => ({ ...x, fillStyle: { ...pattern, pattern: name } }))}>
            <svg viewBox="0 0 16 16" width="100%" height="100%" shapeRendering="crispEdges"><rect width="16" height="16" fill={pattern.background} />
              {[0, 8].flatMap((dx) => [0, 8].map((dy) => <path key={`${dx}${dy}`} d={patternTilePath(name)} transform={`translate(${dx} ${dy})`} fill={pattern.foreground} />))}</svg>
          </button>)}
        </div>
        <FormatRow label={t("fill.foreground")}><ThemeColorPicker label={t("fill.foreground")} value={pattern.foreground} onChange={(foreground) => set((x) => ({ ...x, fill: foreground, fillStyle: { ...pattern, foreground } }))} onEyedropper={onEyedropper} disabled={disabled} /></FormatRow>
        <FormatRow label={t("fill.background")}><ThemeColorPicker label={t("fill.background")} value={pattern.background} onChange={(background) => set((x) => ({ ...x, fillStyle: { ...pattern, background } }))} onEyedropper={onEyedropper} disabled={disabled} /></FormatRow>
      </>;
    })()}
    {kind === "picture" && <>
      <FormatRow label={t("fill.pictureSource")}>
        <label className="inline-flex h-7 cursor-pointer items-center rounded-md border px-2 text-xs">{t("fill.insert")}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={disabled || !uploadPicture} onChange={async (event) => {
            const file = event.target.files?.[0]; event.target.value = "";
            const attachmentId = file && uploadPicture ? await uploadPicture(file) : null;
            if (attachmentId) set((x) => ({ ...x, fillStyle: { type: "picture", attachmentId, tile: x.fillStyle?.type === "picture" ? x.fillStyle.tile : undefined } }));
          }} />
        </label>
      </FormatRow>
      {c.fillStyle?.type === "picture" && (() => {
        const picture = c.fillStyle;
        return <>
          <PercentField label={t("transparency")} value={picture.transparency ?? 0} onChange={(v) => set((x) => ({ ...x, fillStyle: { ...picture, transparency: v || undefined } }))} disabled={disabled} />
          <CheckField label={t("fill.tile")} checked={Boolean(picture.tile)} onChange={(tile) => set((x) => ({ ...x, fillStyle: { ...picture, tile: tile || undefined } }))} disabled={disabled} />
        </>;
      })()}
    </>}
  </FormatSection>;
}

function GradientEditor({ gradient, onChange, disabled, onEyedropper }: { gradient: PresentationGradient; onChange: (g: PresentationGradient) => void; disabled?: boolean; onEyedropper?: () => Promise<string | null> }) {
  const t = useTranslations("wiki.presentations.formatPane");
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, gradient.stops.length - 1), stop = gradient.stops[index];
  const setStop = (patch: Partial<typeof stop>) => onChange({ ...gradient, stops: gradient.stops.map((s, i) => i === index ? { ...s, ...patch } : s) });
  return <div className="space-y-2" data-testid="format-gradient">
    <SelectField label={t("gradient.type")} value={gradient.kind} disabled={disabled} options={gradientKinds.map((value) => ({ value, label: t(`gradient.kinds.${value}`) }))} onChange={(kind) => onChange({ ...gradient, kind })} />
    {gradient.kind === "linear" && <NumberField label={t("gradient.angle")} value={gradient.angle} min={0} max={359.9} step={1} unit="°" onChange={(angle) => onChange({ ...gradient, angle })} disabled={disabled} />}
    <p className="text-xs text-muted-foreground">{t("gradient.stops")}</p>
    <div className="relative h-5 rounded border" style={{ backgroundImage: gradientPreview(gradient.stops, 0) }}>
      {gradient.stops.map((s, i) => <button key={i} type="button" aria-label={t("gradient.stop", { index: i + 1, count: gradient.stops.length })} aria-pressed={i === index}
        className={`absolute top-full size-3 -translate-x-1/2 rotate-45 border ${i === index ? "border-amber-600 bg-amber-200" : "bg-background"}`} style={{ left: `${s.position * 100}%` }} onClick={() => setSelected(i)} />)}
    </div>
    <div className="flex justify-end gap-1 pt-2">
      <Button type="button" size="icon-sm" variant="outline" aria-label={t("gradient.add")} disabled={disabled || gradient.stops.length >= 10} onClick={() => {
        const next = gradient.stops[index + 1], position = next ? (stop.position + next.position) / 2 : Math.min(1, stop.position + 0.1);
        onChange({ ...gradient, stops: [...gradient.stops.slice(0, index + 1), { ...stop, position }, ...gradient.stops.slice(index + 1)] }); setSelected(index + 1);
      }}><Plus className="size-3.5" /></Button>
      <Button type="button" size="icon-sm" variant="outline" aria-label={t("gradient.remove")} disabled={disabled || gradient.stops.length <= 2} onClick={() => { onChange({ ...gradient, stops: gradient.stops.filter((_, i) => i !== index) }); setSelected(Math.max(0, index - 1)); }}><Minus className="size-3.5" /></Button>
    </div>
    <FormatRow label={t("color")}><ThemeColorPicker label={t("gradient.stopColor")} value={stop.color} onChange={(color) => setStop({ color: color || "#FFFFFF" })} onEyedropper={onEyedropper} disabled={disabled} /></FormatRow>
    <NumberField label={t("gradient.position")} value={stop.position * 100} min={0} max={100} unit="%" onChange={(v) => setStop({ position: v / 100 })} disabled={disabled} />
    <PercentField label={t("transparency")} value={stop.transparency ?? 0} onChange={(v) => setStop({ transparency: v || undefined })} disabled={disabled} />
    <CheckField label={t("gradient.rotateWithShape")} checked={gradient.rotateWithShape !== false} onChange={(rotateWithShape) => onChange({ ...gradient, rotateWithShape })} disabled={disabled} />
  </div>;
}
