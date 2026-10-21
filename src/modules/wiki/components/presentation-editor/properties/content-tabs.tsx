"use client";
// The Eigenschaften tabs that belong to one kind of object: Text (content, font, PowerPoint's
// Text Options), Picture, Chart, Icon, Media and Frame. Each shows its fields as pane sections
// with the label on the left, as PowerPoint's Format pane does.
import { useTranslations } from "next-intl";
import { AlignCenter, AlignLeft, AlignRight, Bold } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import type { useCollaborationContext } from "../../../collaboration/ui";
import { presentationFonts, presentationFrameShapes, presentationIconNames, type PresentationElement } from "../../../lib/presentation";
import { presentationTextFits } from "../../../lib/presentation-layout";
import { shapeTextContent } from "../../../lib/presentation-text-host";
import { PresentationRichText } from "../../presentation-rich-text";
import { DraftInput, DraftTextarea } from "../draft-fields";
import { EffectsEditor } from "../format-pane/effects-tab";
import { CheckField, FormatRow, FormatSection, SelectField } from "../format-pane/format-controls";
import { TextBoxTab, TextFillTab } from "../format-pane/text-options-tab";
import { ThemeColorPicker } from "../format-pane/theme-color-picker";
import type { TextFormatApi } from "../use-text-format";

type TextHost = Extract<PresentationElement, { type: "text" | "shape" }>;
type Update = (id: string, update: (element: PresentationElement) => PresentationElement) => void;
type ContentOf<T extends PresentationElement["type"]> = Extract<PresentationElement, { type: T }>["content"];

/** Patches one object's content; ignores an object of another type. */
function patcher<T extends PresentationElement["type"]>(updateElement: Update, element: Extract<PresentationElement, { type: T }>) {
  return (patch: Partial<ContentOf<T>>) => updateElement(element.id, (current) => current.type === element.type ? { ...current, content: { ...current.content, ...patch } } as PresentationElement : current);
}

/** Behind charts, icons, pictures, text boxes and frames: the colour of the object's box. */
function BackgroundRow({ element, updateElement }: { element: PresentationElement; updateElement: Update }) {
  const t = useTranslations("wiki.presentations");
  return <FormatRow label={t("elementBackground")}>
    <ColorPicker aria-label={t("elementBackground")} value={element.background ?? ""} clearLabel={t("clearColor")} onChange={(background) => updateElement(element.id, (current) => ({ ...current, background }))} />
  </FormatRow>;
}

export function TextTab({ element, updateElement, updateContent, format, collaboration, disabled, onEyedropper, onTextChange, onRichTextChange }: {
  element: TextHost; updateElement: Update; updateContent: (id: string, change: (content: TextHost["content"]) => TextHost["content"]) => void;
  format: TextFormatApi | null; collaboration: ReturnType<typeof useCollaborationContext>; disabled: boolean;
  onEyedropper?: () => Promise<string | null>;
  onTextChange: (id: string, text: string) => void;
  onRichTextChange: (id: string, content: ContentOf<"text">) => void;
}) {
  const t = useTranslations("wiki.presentations");
  const studio = useTranslations("presentationStudio");
  const isText = element.type === "text";
  const typography = isText ? element.content : shapeTextContent(element.content);
  const size = isText ? element.content.autoFit?.maxFontSize ?? element.content.fontSize : typography.fontSize;
  const set = (patch: Partial<ContentOf<"text">>) => updateElement(element.id, (current) => current.type === "text" || current.type === "shape"
    ? { ...current, content: { ...current.content, ...patch } } as PresentationElement : current);
  const setText = (change: (content: TextHost["content"]) => TextHost["content"]) => updateContent(element.id, change);
  return <div>
    {isText && <FormatSection title={t("properties.sections.content")} open testId="properties-text-content">
      {collaboration ? <PresentationRichText key={element.id} elementId={element.id} content={element.content} onChange={(content) => onRichTextChange(element.id, content)}
        disabled={disabled} label={t("textContent")} />
        : <DraftTextarea key={element.id} aria-label={t("textContent")} value={element.content.text} maxLength={5_000} rows={4} onCommit={(text) => onTextChange(element.id, text)} />}
      {element.content.autoFit && !presentationTextFits(element) && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{t("layout.overcrowded")}</p>}
    </FormatSection>}
    <FormatSection title={t("properties.sections.typography")} open testId={isText ? "properties-typography" : "presentation-shape-text"}>
      <SelectField label={studio("font")} value={typography.font ?? "sans"} disabled={disabled} options={presentationFonts.map((font) => ({ value: font, label: studio(`fonts.${font}`) }))}
        onChange={(font) => set({ font })} />
      <FormatRow label={t("fontSize")}>
        <DraftInput aria-label={t("fontSize")} type="number" min={8} max={400} className="h-7 w-20 px-1.5 text-right text-xs" key={`${element.id}-size-${size}`} value={String(size)}
          normalise={(raw) => { const n = Math.round(Number(raw.replace(",", "."))); return String(Number.isFinite(n) ? Math.min(400, Math.max(8, n)) : size); }}
          onCommit={(next) => updateElement(element.id, (current) => current.type === "text"
            ? { ...current, content: { ...current.content, fontSize: Number(next), autoFit: current.content.autoFit ? { minFontSize: Math.min(current.content.autoFit.minFontSize, Number(next)), maxFontSize: Number(next) } : undefined } }
            : current.type === "shape" ? { ...current, content: { ...current.content, fontSize: Number(next) } } : current)} />
        <span className="w-5 text-muted-foreground">pt</span>
      </FormatRow>
      <div className="flex items-center gap-1">
        <Button type="button" size="icon-sm" variant={typography.bold ? "secondary" : "outline"} aria-pressed={typography.bold} aria-label={t("bold")} title={t("bold")} disabled={disabled} onClick={() => set({ bold: !typography.bold })}><Bold /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([align, Icon]) =>
          <Button key={align} type="button" size="icon-sm" variant={typography.align === align ? "secondary" : "outline"} aria-pressed={typography.align === align} aria-label={t(`align.${align}`)} title={t(`align.${align}`)} disabled={disabled} onClick={() => set({ align })}><Icon /></Button>)}
        <span className="flex-1" />
        <ThemeColorPicker label={t("formatPane.text.fillColor")} value={typography.color ?? ""} noneLabel={t("formatPane.colors.automatic")} disabled={disabled} onEyedropper={onEyedropper}
          onChange={(color) => format ? format.setRun({ color: color || undefined }) : set({ color })} />
      </div>
      {isText && <SelectField label={studio("listStyle")} value={element.content.list ?? "none"} disabled={disabled} options={(["none", "bullet", "number"] as const).map((list) => ({ value: list, label: studio(list) }))}
        onChange={(list) => set({ list })} />}
      {isText && <BackgroundRow element={element} updateElement={updateElement} />}
    </FormatSection>
    <TextBoxTab element={element} set={setText} format={format} disabled={disabled} />
    <FormatSection title={t("formatPane.tabs.textFill")}><TextFillTab element={element} set={setText} disabled={disabled} onEyedropper={onEyedropper} /></FormatSection>
    <FormatSection title={t("formatPane.tabs.textEffects")}>
      <EffectsEditor text effects={element.content.textStyle?.effects} disabled={disabled} onEyedropper={onEyedropper}
        onChange={(effects) => setText((c) => ({ ...c, textStyle: { ...c.textStyle, effects: effects as NonNullable<TextHost["content"]["textStyle"]>["effects"], wordArt: undefined } }))} />
    </FormatSection>
  </div>;
}

export function PictureTab({ element, updateElement, disabled }: { element: Extract<PresentationElement, { type: "image" }>; updateElement: Update; disabled: boolean }) {
  const t = useTranslations("wiki.presentations");
  const studio = useTranslations("presentationStudio");
  const set = patcher(updateElement, element);
  const { content } = element;
  return <fieldset disabled={disabled}>
    <FormatSection title={t("properties.sections.appearance")} open testId="properties-picture">
      <SelectField label={studio("imageFit")} value={content.fit ?? "contain"} options={(["contain", "cover"] as const).map((fit) => ({ value: fit, label: studio(fit) }))} onChange={(fit) => set({ fit })} />
      <SelectField label={studio("mask")} value={content.mask ?? "none"} options={(["none", "circle", "rounded", "diamond"] as const).map((mask) => ({ value: mask, label: studio(mask) }))} onChange={(mask) => set({ mask })} />
      <BackgroundRow element={element} updateElement={updateElement} />
    </FormatSection>
    <FormatSection title={t("properties.sections.crop")} open={Boolean(content.zoom && content.zoom > 1)}>
      {(["zoom", "cropX", "cropY"] as const).map((key) => <label key={key} className="block text-xs text-muted-foreground">{studio(key)}
        <input className="mt-1 w-full" type="range" min={key === "zoom" ? 1 : 0} max={key === "zoom" ? 5 : 100} step={key === "zoom" ? 0.1 : 1}
          value={content[key] ?? (key === "zoom" ? 1 : 50)} onChange={(event) => set({ [key]: Number(event.target.value) })} /></label>)}
      {(content.zoom ?? 1) <= 1 && <p className="text-xs text-muted-foreground">{t("properties.cropHint")}</p>}
    </FormatSection>
    <FormatSection title={t("altText")} open={!content.alt}>
      <DraftInput key={element.id} aria-label={t("altText")} className="h-8" value={content.alt} maxLength={500} placeholder={t("properties.altTextHint")} onCommit={(alt) => set({ alt })} />
    </FormatSection>
  </fieldset>;
}

export function ChartTab({ element, updateElement, disabled }: { element: Extract<PresentationElement, { type: "chart" }>; updateElement: Update; disabled: boolean }) {
  const t = useTranslations("wiki.presentations");
  const studio = useTranslations("presentationStudio");
  const set = patcher(updateElement, element);
  const { content } = element;
  return <fieldset disabled={disabled}>
    <FormatSection title={t("properties.sections.appearance")} open testId="properties-chart">
      <label className="block text-xs text-muted-foreground">{studio("chartTitle")}<Input className="mt-1 h-8" value={content.title} maxLength={200} onChange={(event) => set({ title: event.target.value })} /></label>
      <SelectField label={studio("chartType")} value={content.kind} options={(["bar", "line", "pie"] as const).map((kind) => ({ value: kind, label: studio(kind) }))} onChange={(kind) => set({ kind })} />
      {content.kind === "pie" && <p className="text-xs text-muted-foreground">{studio("pieHint")}</p>}
      <FormatRow label={studio("color")}><ColorPicker aria-label={studio("color")} value={content.color || "#6366f1"} onChange={(color) => set({ color })} /></FormatRow>
      <BackgroundRow element={element} updateElement={updateElement} />
    </FormatSection>
    <FormatSection title={t("properties.sections.data")} open>
      <div className="space-y-1">{content.data.map((point, index) => <div className="flex gap-1" key={index}>
        <Input aria-label={studio("dataLabel")} className="h-8" value={point.label} maxLength={100} onChange={(event) => set({ data: content.data.map((p, i) => i === index ? { ...p, label: event.target.value } : p) })} />
        <input className="h-8 w-20 rounded-md border bg-background px-2 text-right text-sm" aria-label={studio("dataValue")} type="number" defaultValue={point.value} key={`${element.id}-${index}-${point.value}`}
          onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && Math.abs(value) <= 1e12) set({ data: content.data.map((p, i) => i === index ? { ...p, value } : p) }); }} />
        <Button type="button" variant="ghost" size="icon-sm" aria-label={studio("removePoint")} disabled={content.data.length <= 1} onClick={() => set({ data: content.data.filter((_, i) => i !== index) })}>×</Button>
      </div>)}</div>
      <Button type="button" size="sm" variant="outline" className="w-full" disabled={content.data.length >= 50} onClick={() => set({ data: [...content.data, { label: studio("newPoint"), value: 0 }] })}>{studio("addPoint")}</Button>
    </FormatSection>
  </fieldset>;
}

export function IconTab({ element, updateElement, disabled }: { element: Extract<PresentationElement, { type: "icon" }>; updateElement: Update; disabled: boolean }) {
  const t = useTranslations("wiki.presentations");
  const studio = useTranslations("presentationStudio");
  const set = patcher(updateElement, element);
  return <fieldset disabled={disabled}>
    <FormatSection title={t("properties.sections.appearance")} open testId="properties-icon">
      <SelectField label={studio("icon")} value={element.content.name} options={presentationIconNames.map((name) => ({ value: name, label: studio(`icons.${name}`) }))} onChange={(name) => set({ name })} />
      <FormatRow label={studio("color")}><ColorPicker aria-label={studio("color")} value={element.content.color || "#6366f1"} onChange={(color) => set({ color })} /></FormatRow>
      <BackgroundRow element={element} updateElement={updateElement} />
    </FormatSection>
  </fieldset>;
}

export function MediaTab({ element, updateElement, disabled }: { element: Extract<PresentationElement, { type: "video" | "audio" }>; updateElement: Update; disabled: boolean }) {
  const t = useTranslations("wiki.presentations");
  const studio = useTranslations("presentationStudio");
  const set = (patch: Partial<ContentOf<"video">>) => updateElement(element.id, (current) => current.type === "video" || current.type === "audio" ? { ...current, content: { ...current.content, ...patch } } as PresentationElement : current);
  return <fieldset disabled={disabled}>
    <FormatSection title={t("properties.sections.playback")} open testId="properties-media">
      <label className="block text-xs text-muted-foreground">{studio("mediaTitle")}<Input className="mt-1 h-8" value={element.content.title} maxLength={500} onChange={(event) => set({ title: event.target.value })} /></label>
      <CheckField label={studio("loopMedia")} checked={Boolean(element.content.loop)} onChange={(loop) => set({ loop })} />
    </FormatSection>
  </fieldset>;
}

export function FrameTab({ element, updateElement, disabled, onUngroup }: {
  element: Extract<PresentationElement, { type: "frame" }>; updateElement: Update; disabled: boolean; onUngroup: () => void;
}) {
  const t = useTranslations("wiki.presentations");
  const studio = useTranslations("presentationStudio");
  const set = patcher(updateElement, element);
  const group = Boolean(element.content.isGroup);
  return <fieldset disabled={disabled}>
    <FormatSection title={t("properties.sections.appearance")} open testId="properties-frame">
      <label className="block text-xs text-muted-foreground">{t("frameLabel")}
        <DraftInput key={element.id} className="mt-1 h-8" value={element.content.label} data-linked-heading-title="" maxLength={200} placeholder={t("properties.frameLabelHint")} onCommit={(label) => set({ label })} />
      </label>
      {!group && <FormatRow label={t("properties.frameShape")}>
        <div role="radiogroup" aria-label={t("properties.frameShape")} className="flex gap-1">{presentationFrameShapes.map((shape) =>
          <Button key={shape} type="button" role="radio" aria-checked={element.content.shape === shape} size="xs" variant={element.content.shape === shape ? "secondary" : "outline"} onClick={() => set({ shape })}>{t(`frameShapes.${shape}`)}</Button>)}</div>
      </FormatRow>}
      {!group && <FormatRow label={t("properties.frameColor")}><ColorPicker aria-label={t("properties.frameColor")} value={element.content.color} clearLabel={t("colorDefault")} onChange={(color) => set({ color })} /></FormatRow>}
      <BackgroundRow element={element} updateElement={updateElement} />
      {group && <Button type="button" size="sm" variant="outline" className="w-full" onClick={onUngroup}>{studio("ungroup")}</Button>}
    </FormatSection>
  </fieldset>;
}

