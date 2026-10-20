"use client";
// The contextual toolbar row shown while objects are selected, standing in for PowerPoint's
// Shape Format tab (Shape Styles, Shape Fill/Outline, WordArt, Edit Shape, Merge Shapes) and
// the Home tab's Paragraph and Font tools (bullets, numbering, list level, line spacing, text
// alignment and direction, columns, strikethrough, super/subscript, spacing, highlight).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDownUp, Baseline, Columns2, Combine, Highlighter, List, ListIndentDecrease, ListIndentIncrease, ListOrdered, PaintBucket, PanelRight, PenLine, Shapes, Space, Strikethrough, Subscript, Superscript, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PresentationElement } from "../../../lib/presentation";
import type { PresentationTextBody } from "../../../lib/presentation-format-model";
import { BULLET_GALLERY, NUMBERING_GALLERY, shiftLevel } from "../../../lib/presentation-paragraphs";
import { applyQuickStyle, WORDART_STYLES } from "../../../lib/powerpoint-quick-styles";
import type { PresetGalleryEntry } from "../../../lib/preset-shapes/preset-gallery";
import { PresentationShapeGallery } from "../presentation-shape-gallery";
import type { TextFormatApi } from "../use-text-format";
import { QuickStylesGallery, WordArtGallery } from "./style-galleries";
import { ThemeColorPicker } from "./theme-color-picker";

type Shape = Extract<PresentationElement, { type: "shape" }>;
type TextHost = Extract<PresentationElement, { type: "text" | "shape" }>;
export type MergeOperation = "union" | "combine" | "fragment" | "intersect" | "subtract";

const LINE_SPACINGS = [1, 1.5, 2, 2.5, 3];
const CHARACTER_SPACINGS = [["veryTight", -3], ["tight", -1.5], ["normal", 0], ["loose", 3], ["veryLoose", 6]] as const;

export function FormatRibbon({ shapes, texts, format, updateShapes, updateTexts, onOpenPane, onChangeShape, onEditPoints, onMerge, canMerge, onEyedropper, disabled }: {
  shapes: Shape[]; texts: TextHost[]; format: TextFormatApi | null;
  updateShapes: (change: (content: Shape["content"]) => Shape["content"]) => void;
  updateTexts: (change: (content: TextHost["content"]) => TextHost["content"]) => void;
  onOpenPane: (group: "shape" | "text") => void; onChangeShape: (entry: PresetGalleryEntry) => void; onEditPoints?: () => void;
  onMerge: (op: MergeOperation) => void; canMerge: boolean; onEyedropper?: () => Promise<string | null>; disabled?: boolean;
}) {
  const t = useTranslations("wiki.presentations.formatPane");
  const [stylesOpen, setStylesOpen] = useState(false), [wordArtOpen, setWordArtOpen] = useState(false), [changeOpen, setChangeOpen] = useState(false);
  const first = shapes[0], text = texts[0];
  const p = format?.paragraph ?? {}, run = format?.run ?? {};
  const body = (patch: Partial<PresentationTextBody>) => updateTexts((c) => ({ ...c, body: { ...c.body, ...patch } }));
  const icon = (label: string, active: boolean | undefined, onClick: () => void, child: React.ReactNode, testId?: string) =>
    <Button type="button" size="icon-sm" variant={active ? "secondary" : "ghost"} aria-label={label} title={label} aria-pressed={active} disabled={disabled} data-testid={testId} onClick={onClick}>{child}</Button>;
  return <div role="toolbar" aria-label={t("ribbon")} data-testid="presentation-format-ribbon" className="flex h-full items-center gap-1 overflow-x-auto px-3 whitespace-nowrap">
    {first && <>
      <Popover open={stylesOpen} onOpenChange={setStylesOpen}>
        <PopoverTrigger render={<Button type="button" size="sm" variant="ghost" disabled={disabled} data-testid="quick-styles-button" />}><Shapes className="size-3.5" />{t("quickStyles.title")}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto"><QuickStylesGallery onPick={(style) => { setStylesOpen(false); updateShapes((c) => applyQuickStyle(c, style)); }} /></PopoverContent>
      </Popover>
      <ThemeColorPicker label={t("fill.shapeFill")} value={first.content.fillStyle ? "" : first.content.fill} noneLabel={t("fill.noFill")} onEyedropper={onEyedropper} disabled={disabled} testId="ribbon-shape-fill"
        icon={<PaintBucket className="size-3.5" />} onChange={(fill) => updateShapes((c) => { const { fillStyle: _f, ...rest } = c; void _f; return { ...rest, fill }; })} />
      <ThemeColorPicker label={t("line.shapeOutline")} value={first.content.strokeWidth ? first.content.stroke : ""} noneLabel={t("line.noOutline")} onEyedropper={onEyedropper} disabled={disabled} testId="ribbon-shape-outline"
        icon={<PenLine className="size-3.5" />} onChange={(stroke) => updateShapes((c) => stroke ? { ...c, stroke, strokeWidth: c.strokeWidth || 1.5 } : { ...c, strokeWidth: 0 })} />
      <Popover open={changeOpen} onOpenChange={setChangeOpen}>
        <PopoverTrigger render={<Button type="button" size="sm" variant="ghost" disabled={disabled} data-testid="change-shape-button" />}>{t("editShape.changeShape")}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto"><PresentationShapeGallery includeTools={false} onPick={(entry) => { setChangeOpen(false); onChangeShape(entry); }} /></PopoverContent>
      </Popover>
      {onEditPoints && <Button type="button" size="sm" variant="ghost" disabled={disabled} data-testid="edit-points-button" onClick={onEditPoints}>{t("editShape.editPoints")}</Button>}
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="sm" variant="ghost" disabled={disabled || !canMerge} data-testid="merge-shapes-button" />}><Combine className="size-3.5" />{t("merge.title")}</DropdownMenuTrigger>
        <DropdownMenuContent>{(["union", "combine", "fragment", "intersect", "subtract"] as const).map((op) => <DropdownMenuItem key={op} data-testid={`merge-${op}`} onClick={() => onMerge(op)}>{t(`merge.${op}`)}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
      <span className="mx-1 h-5 w-px bg-border/60" />
    </>}
    {text && <>
      <Popover open={wordArtOpen} onOpenChange={setWordArtOpen}>
        <PopoverTrigger render={<Button type="button" size="sm" variant="ghost" disabled={disabled} data-testid="wordart-button" />}><Type className="size-3.5" />{t("wordArt.title")}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto"><WordArtGallery current={text.content.textStyle?.wordArt} onPick={(index) => {
          setWordArtOpen(false);
          // A WordArt style replaces the text's fill, outline and effects, and its run colours.
          const fill = WORDART_STYLES[index].fill;
          updateTexts((c) => ({ ...c, textStyle: { ...WORDART_STYLES[index], wordArt: index }, ...(fill?.type === "solid" ? { color: fill.color } : {}), runs: c.runs?.map(({ color: _c, ...r }) => { void _c; return r; }) }));
        }} /></PopoverContent>
      </Popover>
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant={p.bullet?.kind === "char" ? "secondary" : "ghost"} aria-label={t("text.bullets")} title={t("text.bullets")} disabled={disabled || !format} data-testid="bullets-button" />}><List className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent className="grid grid-cols-4 gap-1 p-1">{BULLET_GALLERY.map((b) => <DropdownMenuItem key={b.id} data-testid={`bullet-${b.id}`} aria-label={t(`text.bulletStyles.${b.id}`)} title={t(`text.bulletStyles.${b.id}`)}
          className="flex size-12 items-center justify-center text-xl" onClick={() => format?.setParagraph((x) => ({ ...x, bullet: b.bullet.kind === "none" ? undefined : b.bullet, indent: undefined, special: undefined, by: undefined }))}>
          {b.bullet.kind === "char" ? <span style={{ fontFamily: b.bullet.font }}>{b.bullet.char}</span> : <span className="text-xs">{t("text.none")}</span>}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant={p.bullet?.kind === "number" ? "secondary" : "ghost"} aria-label={t("text.numbering")} title={t("text.numbering")} disabled={disabled || !format} data-testid="numbering-button" />}><ListOrdered className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent className="grid grid-cols-4 gap-1 p-1">{NUMBERING_GALLERY.map((n) => <DropdownMenuItem key={n.id} data-testid={`numbering-${n.id}`} aria-label={n.label || t("text.none")} title={n.label || t("text.none")}
          className="flex h-14 w-12 flex-col items-start justify-center text-[10px] leading-tight" onClick={() => format?.setParagraph((x) => ({ ...x, bullet: n.bullet.kind === "none" ? undefined : n.bullet, indent: undefined, special: undefined, by: undefined }))}>
          {n.label ? n.label.split(" ").map((label) => <span key={label}>{label} ―</span>) : <span>{t("text.none")}</span>}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
      {icon(t("text.decreaseLevel"), false, () => format?.setParagraph((x) => shiftLevel(x, -1)), <ListIndentDecrease className="size-4" />)}
      {icon(t("text.increaseLevel"), false, () => format?.setParagraph((x) => shiftLevel(x, 1)), <ListIndentIncrease className="size-4" />)}
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={t("text.lineSpacing")} title={t("text.lineSpacing")} disabled={disabled || !format} data-testid="line-spacing-button" />}><ArrowDownUp className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent>{LINE_SPACINGS.map((value) => <DropdownMenuItem key={value} data-testid={`line-spacing-${value}`} onClick={() => format?.setParagraph((x) => ({ ...x, lineSpacing: value === 1 ? undefined : { rule: "multiple", value } }))}>{value.toFixed(1)}</DropdownMenuItem>)}
          <DropdownMenuSeparator /><DropdownMenuItem onClick={() => onOpenPane("text")}>{t("text.lineSpacingOptions")}</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={t("text.alignText")} title={t("text.alignText")} disabled={disabled} data-testid="align-text-button" />}><AlignVerticalJustifyCenter className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem data-testid="align-text-top" onClick={() => body({ anchor: "top" })}><AlignVerticalJustifyStart />{t("text.anchors.top")}</DropdownMenuItem>
          <DropdownMenuItem data-testid="align-text-middle" onClick={() => body({ anchor: "middle" })}><AlignVerticalJustifyCenter />{t("text.anchors.middle")}</DropdownMenuItem>
          <DropdownMenuItem data-testid="align-text-bottom" onClick={() => body({ anchor: "bottom" })}><AlignVerticalJustifyEnd />{t("text.anchors.bottom")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub><DropdownMenuSubTrigger>{t("text.direction")}</DropdownMenuSubTrigger><DropdownMenuSubContent>
            {(["horizontal", "vertical", "vertical270", "stacked"] as const).map((direction) => <DropdownMenuItem key={direction} data-testid={`text-direction-${direction}`} onClick={() => body({ direction })}>{t(`text.directions.${direction}`)}</DropdownMenuItem>)}
          </DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuSub><DropdownMenuSubTrigger><Columns2 />{t("text.columns")}</DropdownMenuSubTrigger><DropdownMenuSubContent>
            {[1, 2, 3].map((columns) => <DropdownMenuItem key={columns} data-testid={`columns-${columns}`} onClick={() => body({ columns: columns > 1 ? columns : undefined, columnSpacing: columns > 1 ? 7.2 : undefined })}>{t("text.columnCount", { count: columns })}</DropdownMenuItem>)}
          </DropdownMenuSubContent></DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      {icon(t("text.strikethrough"), run.strike === "single", () => format?.setRun({ strike: run.strike === "single" ? undefined : "single" }), <Strikethrough className="size-4" />, "strikethrough-button")}
      {icon(t("text.superscript"), (run.baseline ?? 0) > 0, () => format?.setRun({ baseline: (run.baseline ?? 0) > 0 ? undefined : 30 }), <Superscript className="size-4" />, "superscript-button")}
      {icon(t("text.subscript"), (run.baseline ?? 0) < 0, () => format?.setRun({ baseline: (run.baseline ?? 0) < 0 ? undefined : -25 }), <Subscript className="size-4" />, "subscript-button")}
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={t("text.characterSpacing")} title={t("text.characterSpacing")} disabled={disabled || !format} />}><Space className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent>{CHARACTER_SPACINGS.map(([id, value]) => <DropdownMenuItem key={id} onClick={() => format?.setRun({ spacing: value || undefined })}>{t(`text.characterSpacings.${id}`)}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
      <ThemeColorPicker label={t("text.highlight")} value={run.highlight ?? ""} noneLabel={t("text.noHighlight")} disabled={disabled || !format} icon={<Highlighter className="size-3.5" />} onChange={(highlight) => format?.setRun({ highlight: highlight || undefined })} />
      <ThemeColorPicker label={t("text.fillColor")} value={text.content.color ?? ""} noneLabel={t("colors.automatic")} disabled={disabled} onEyedropper={onEyedropper} icon={<Baseline className="size-3.5" />}
        onChange={(color) => format ? format.setRun({ color: color || undefined }) : updateTexts((c) => ({ ...c, color }))} />
    </>}
    <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={disabled} data-testid="format-pane-button" onClick={() => onOpenPane(first ? "shape" : "text")}><PanelRight className="size-3.5" />{t("openPane")}</Button>
  </div>;
}
