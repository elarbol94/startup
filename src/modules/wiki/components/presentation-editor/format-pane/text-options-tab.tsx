"use client";
// Format Shape → Text Options: Text Fill & Outline and Text Effects (WordArt), the Text Box
// section (anchor, direction, autofit, margins, wrap, columns), and the Paragraph and Font
// dialogs' options as pane sections.
import { useTranslations } from "next-intl";
import type { PresentationElement } from "../../../lib/presentation";
import { paragraphAligns, type PresentationTextBody, type PresentationTextStyle } from "../../../lib/presentation-format-model";
import { defaultGradient } from "../../../lib/powerpoint-theme";
import { textBodyDefaults } from "../../../lib/presentation-text-host";
import type { TextFormatApi } from "../use-text-format";
import { EffectsEditor } from "./effects-tab";
import { CheckField, FormatRow, FormatSection, NumberField, PercentField, RadioList, SelectField } from "./format-controls";
import { ThemeColorPicker } from "./theme-color-picker";

type TextHost = Extract<PresentationElement, { type: "text" | "shape" }>;
type Content = TextHost["content"];

export function TextFillTab({ element, set, disabled, onEyedropper }: { element: TextHost; set: (update: (c: Content) => Content) => void; disabled?: boolean; onEyedropper?: () => Promise<string | null> }) {
  const t = useTranslations("wiki.presentations.formatPane");
  const style = element.content.textStyle ?? {};
  const put = (patch: Partial<PresentationTextStyle>) => set((c) => {
    const next = { ...c.textStyle, ...patch, wordArt: undefined };
    for (const key of Object.keys(patch) as (keyof PresentationTextStyle)[]) if (patch[key] === undefined) delete next[key];
    return { ...c, textStyle: Object.values(next).some((v) => v !== undefined) ? next : undefined };
  });
  const color = element.content.color || "#000000";
  const kind = style.fill?.type ?? "solid";
  return <div>
    <FormatSection title={t("text.fill")} open testId="format-text-fill">
      <RadioList name={`text-fill-${element.id}`} value={kind} disabled={disabled} options={(["none", "solid", "gradient", "pattern"] as const).map((value) => ({ value, label: t(`fill.${value}`) }))}
        onChange={(next) => put({ fill: next === "none" ? { type: "none" } : next === "solid" ? undefined : next === "gradient" ? defaultGradient(color) : { type: "pattern", pattern: "pct50", foreground: color, background: "#FFFFFF" } })} />
      {kind === "solid" && <>
        <FormatRow label={t("color")}><ThemeColorPicker label={t("text.fillColor")} value={element.content.color ?? ""} noneLabel={t("colors.automatic")} onEyedropper={onEyedropper} disabled={disabled} testId="format-text-color"
          onChange={(next) => set((c) => ({ ...c, color: next, runs: c.runs?.map(({ color: _color, ...run }) => { void _color; return run; }) }))} /></FormatRow>
        <PercentField label={t("transparency")} value={style.fill?.type === "solid" ? style.fill.transparency ?? 0 : 0} disabled={disabled}
          onChange={(transparency) => put({ fill: transparency ? { type: "solid", color, transparency } : undefined })} />
      </>}
      {style.fill?.type === "gradient" && <p className="text-xs text-muted-foreground">{t("text.gradientHint")}</p>}
    </FormatSection>
    <FormatSection title={t("text.outline")} open={Boolean(style.outline)} testId="format-text-outline">
      <RadioList name={`text-outline-${element.id}`} value={style.outline ? "solid" : "none"} disabled={disabled} options={[{ value: "none", label: t("line.none") }, { value: "solid", label: t("line.solid") }]}
        onChange={(next) => put({ outline: next === "none" ? undefined : { color: "#156082", width: 0.75 } })} />
      {style.outline && <>
        <FormatRow label={t("color")}><ThemeColorPicker label={t("text.outlineColor")} value={style.outline.color} onChange={(next) => put({ outline: { ...style.outline!, color: next || "#000000" } })} onEyedropper={onEyedropper} disabled={disabled} /></FormatRow>
        <NumberField label={t("line.width")} ariaLabel={t("text.outlineWidth")} value={style.outline.width} min={0} max={100} step={0.25} unit="pt" onChange={(width) => put({ outline: { ...style.outline!, width } })} disabled={disabled} />
      </>}
    </FormatSection>
    <EffectsEditor text effects={style.effects} disabled={disabled} onEyedropper={onEyedropper} onChange={(effects) => put({ effects: effects as PresentationTextStyle["effects"] })} />
  </div>;
}

export function TextBoxTab({ element, set, format, disabled }: { element: TextHost; set: (update: (c: Content) => Content) => void; format: TextFormatApi | null; disabled?: boolean }) {
  const t = useTranslations("wiki.presentations.formatPane.text");
  const body = element.content.body ?? {}, defaults = textBodyDefaults(element);
  const putBody = (patch: Partial<PresentationTextBody>) => set((c) => ({ ...c, body: { ...c.body, ...patch } }));
  const insets = body.insets ?? defaults.insets;
  const autofit = body.autofit ?? (element.type === "text" ? (element.content.autoFit ? "shrink" : "resize") : "none");
  const p = format?.paragraph ?? {}, run = format?.run ?? {};
  const lineRule = p.lineSpacing?.rule === "exactly" ? "exactly" : !p.lineSpacing || p.lineSpacing.value === 1 ? "single" : p.lineSpacing.value === 1.5 ? "onePointFive" : p.lineSpacing.value === 2 ? "double" : "multiple";
  return <div>
    <FormatSection title={t("box")} open testId="format-text-box">
      <SelectField label={t("anchor")} value={`${body.anchor ?? defaults.anchor}${body.anchorCenter ? "Centered" : ""}`} disabled={disabled} testId="format-text-anchor"
        options={(["top", "middle", "bottom", "topCentered", "middleCentered", "bottomCentered"] as const).map((value) => ({ value, label: t(`anchors.${value}`) }))}
        onChange={(value) => putBody({ anchor: value.replace("Centered", "") as "top" | "middle" | "bottom", anchorCenter: value.endsWith("Centered") || undefined })} />
      <SelectField label={t("direction")} value={body.direction ?? "horizontal"} disabled={disabled} testId="format-text-direction"
        options={(["horizontal", "vertical", "vertical270", "stacked"] as const).map((value) => ({ value, label: t(`directions.${value}`) }))} onChange={(direction) => putBody({ direction })} />
      <RadioList name={`autofit-${element.id}`} value={autofit} disabled={disabled} options={(["none", "shrink", "resize"] as const).map((value) => ({ value, label: t(`autofit.${value}`) }))}
        onChange={(next) => set((c) => {
          const text = element.type === "text" && "autoFit" in c ? { autoFit: next === "shrink" ? { minFontSize: Math.min(12, c.fontSize ?? 18), maxFontSize: c.fontSize ?? 18 } : undefined } : {};
          return { ...c, ...text, body: { ...c.body, autofit: next } };
        })} />
      {(["left", "right", "top", "bottom"] as const).map((side) => <NumberField key={side} label={t(`margins.${side}`)} value={insets[side] / 28.35} min={0} max={35} step={0.01} unit="cm" disabled={disabled}
        onChange={(cm) => putBody({ insets: { ...insets, [side]: Math.round(cm * 28.35 * 100) / 100 } })} />)}
      <CheckField label={t("wrap")} checked={body.wrap !== false} disabled={disabled} onChange={(wrap) => putBody({ wrap: wrap ? undefined : false })} />
      <NumberField label={t("columns")} value={body.columns ?? 1} min={1} max={16} disabled={disabled} onChange={(columns) => putBody({ columns: columns > 1 ? Math.round(columns) : undefined })} />
      {(body.columns ?? 1) > 1 && <NumberField label={t("columnSpacing")} value={(body.columnSpacing ?? 0) / 28.35} min={0} max={35} step={0.01} unit="cm" disabled={disabled} onChange={(cm) => putBody({ columnSpacing: cm * 28.35 })} />}
    </FormatSection>
    {format && <FormatSection title={t("paragraph")} testId="format-paragraph">
      <SelectField label={t("alignment")} value={p.align ?? (element.content.align ?? "left")} disabled={disabled} testId="format-paragraph-align"
        options={paragraphAligns.map((value) => ({ value, label: t(`aligns.${value}`) }))} onChange={(align) => format.setParagraph((x) => ({ ...x, align }))} />
      <NumberField label={t("beforeText")} value={(p.indent ?? 0) / 28.35} min={0} max={140} step={0.01} unit="cm" disabled={disabled} onChange={(cm) => format.setParagraph((x) => ({ ...x, indent: cm * 28.35 }))} />
      <SelectField label={t("special")} value={p.special ?? "none"} disabled={disabled} options={(["none", "firstLine", "hanging"] as const).map((value) => ({ value, label: t(`specials.${value}`) }))}
        onChange={(special) => format.setParagraph((x) => ({ ...x, special, by: special === "none" ? undefined : x.by ?? 18 }))} />
      {p.special && p.special !== "none" && <NumberField label={t("by")} value={(p.by ?? 0) / 28.35} min={0} max={140} step={0.01} unit="cm" disabled={disabled} onChange={(cm) => format.setParagraph((x) => ({ ...x, by: cm * 28.35 }))} />}
      <NumberField label={t("spaceBefore")} value={p.spaceBefore ?? 0} min={0} max={1584} unit="pt" disabled={disabled} onChange={(spaceBefore) => format.setParagraph((x) => ({ ...x, spaceBefore: spaceBefore || undefined }))} />
      <NumberField label={t("spaceAfter")} value={p.spaceAfter ?? 0} min={0} max={1584} unit="pt" disabled={disabled} onChange={(spaceAfter) => format.setParagraph((x) => ({ ...x, spaceAfter: spaceAfter || undefined }))} />
      <SelectField label={t("lineSpacing")} value={lineRule} disabled={disabled} testId="format-line-spacing"
        options={(["single", "onePointFive", "double", "exactly", "multiple"] as const).map((value) => ({ value, label: t(`lineSpacings.${value}`) }))}
        onChange={(rule) => format.setParagraph((x) => ({ ...x, lineSpacing: rule === "single" ? undefined : rule === "onePointFive" ? { rule: "multiple", value: 1.5 } : rule === "double" ? { rule: "multiple", value: 2 } : rule === "exactly" ? { rule: "exactly", value: 24 } : { rule: "multiple", value: 3 } }))} />
      {(lineRule === "exactly" || lineRule === "multiple") && p.lineSpacing && <NumberField label={t("at")} value={p.lineSpacing.value} min={0} max={1584} step={p.lineSpacing.rule === "exactly" ? 1 : 0.1} unit={p.lineSpacing.rule === "exactly" ? "pt" : ""} disabled={disabled}
        onChange={(value) => format.setParagraph((x) => ({ ...x, lineSpacing: { rule: p.lineSpacing!.rule, value } }))} />}
    </FormatSection>}
    {format && <FormatSection title={t("font")} testId="format-font">
      <CheckField label={t("strikethrough")} checked={run.strike === "single"} disabled={disabled} onChange={(on) => format.setRun({ strike: on ? "single" : undefined })} />
      <CheckField label={t("doubleStrikethrough")} checked={run.strike === "double"} disabled={disabled} onChange={(on) => format.setRun({ strike: on ? "double" : undefined })} />
      <CheckField label={t("superscript")} checked={(run.baseline ?? 0) > 0} disabled={disabled} onChange={(on) => format.setRun({ baseline: on ? 30 : undefined })} />
      <CheckField label={t("subscript")} checked={(run.baseline ?? 0) < 0} disabled={disabled} onChange={(on) => format.setRun({ baseline: on ? -25 : undefined })} />
      {run.baseline ? <NumberField label={t("offset")} value={run.baseline} min={-100} max={100} unit="%" disabled={disabled} onChange={(baseline) => format.setRun({ baseline: baseline || undefined })} /> : null}
      <CheckField label={t("smallCaps")} checked={run.caps === "small"} disabled={disabled} onChange={(on) => format.setRun({ caps: on ? "small" : undefined })} />
      <CheckField label={t("allCaps")} checked={run.caps === "all"} disabled={disabled} onChange={(on) => format.setRun({ caps: on ? "all" : undefined })} />
      <SelectField label={t("characterSpacing")} value={!run.spacing ? "normal" : run.spacing > 0 ? "expanded" : "condensed"} disabled={disabled}
        options={(["normal", "expanded", "condensed"] as const).map((value) => ({ value, label: t(`spacings.${value}`) }))}
        onChange={(kind) => format.setRun({ spacing: kind === "normal" ? undefined : kind === "expanded" ? 1 : -1 })} />
      {run.spacing ? <NumberField label={t("by")} value={Math.abs(run.spacing)} min={0} max={1584} step={0.1} unit="pt" disabled={disabled} onChange={(by) => format.setRun({ spacing: by ? Math.sign(run.spacing!) * by : undefined })} /> : null}
    </FormatSection>}
  </div>;
}
