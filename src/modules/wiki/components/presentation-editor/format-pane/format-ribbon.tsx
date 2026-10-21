"use client";
// The ribbon's formatting groups, split the way PowerPoint splits them: Font and Paragraph sit
// on the Start tab (bold/italic/underline, size, strikethrough, super/subscript, spacing,
// highlight, colour; bullets, numbering, list level, alignment, line spacing, text alignment,
// direction and columns), Shape Styles, WordArt, Edit Shape and Merge Shapes on Formformat.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AArrowDown, AArrowUp, AlignCenter, AlignJustify, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDownUp, Baseline, Bold, Columns2, Combine, Highlighter, Italic, List, ListIndentDecrease, ListIndentIncrease, ListOrdered, PaintBucket, PenLine, Shapes, Space, Strikethrough, Subscript, Superscript, Type, Underline } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { presentationFonts, type PresentationElement } from "../../../lib/presentation";
import type { PresentationTextBody } from "../../../lib/presentation-format-model";
import type { TextFormatKey } from "../../../lib/presentation-keyboard-edits";
import { BULLET_GALLERY, NUMBERING_GALLERY, shiftLevel } from "../../../lib/presentation-paragraphs";
import { applyQuickStyle, WORDART_STYLES } from "../../../lib/powerpoint-quick-styles";
import type { PresetGalleryEntry } from "../../../lib/preset-shapes/preset-gallery";
import { PresentationShapeGallery } from "../presentation-shape-gallery";
import type { TextFormatApi } from "../use-text-format";
import { RibbonButton, RibbonGroup, RibbonRow, RibbonStack } from "../ribbon/ribbon-primitives";
import { QuickStylesGallery, WordArtGallery } from "./style-galleries";
import { ThemeColorPicker } from "./theme-color-picker";

type Shape = Extract<PresentationElement, { type: "shape" }>;
type TextHost = Extract<PresentationElement, { type: "text" | "shape" }>;
export type MergeOperation = "union" | "combine" | "fragment" | "intersect" | "subtract";

const LINE_SPACINGS = [1, 1.5, 2, 2.5, 3];
const CHARACTER_SPACINGS = [["veryTight", -3], ["tight", -1.5], ["normal", 0], ["loose", 3], ["veryLoose", 6]] as const;
const PARAGRAPH_ALIGNS = [["left", AlignLeft, "alignLeft"], ["center", AlignCenter, "alignCenter"], ["right", AlignRight, "alignRight"], ["justify", AlignJustify, undefined]] as const;

export type FormatRibbonProps = {
  shapes: Shape[]; texts: TextHost[]; format: TextFormatApi | null;
  updateShapes: (change: (content: Shape["content"]) => Shape["content"]) => void;
  updateTexts: (change: (content: TextHost["content"]) => TextHost["content"]) => void;
  onOpenPane: (group: "shape" | "text") => void; onEyedropper?: () => Promise<string | null>; disabled?: boolean;
};

/** Start › Schriftart and Absatz: shown always, available once a text box or shape with text is selected. */
export function TextRibbonGroups({ texts, format, updateTexts, onOpenPane, onEyedropper, disabled: locked, onTextKey, shortcuts }: FormatRibbonProps & {
  /** The keyboard's text formats (Ctrl+B, Ctrl+]...) on the selected objects. */
  onTextKey: (key: TextFormatKey) => void; shortcuts: Record<string, string>;
}) {
  const t = useTranslations("wiki.presentations.formatPane");
  const r = useTranslations("wiki.presentations.ribbon");
  const text = texts[0], disabled = locked || !text;
  const p = format?.paragraph ?? {}, run = format?.run ?? {};
  const body = (patch: Partial<PresentationTextBody>) => updateTexts((c) => ({ ...c, body: { ...c.body, ...patch } }));
  const icon = (label: string, active: boolean | undefined, onClick: () => void, child: React.ReactNode, testId?: string, shortcut?: string) =>
    <RibbonButton iconOnly label={label} shortcut={shortcut} icon={child} active={active === undefined ? undefined : Boolean(active)} disabled={disabled} data-testid={testId} onClick={onClick} />;
  const font = text?.content && "font" in text.content ? text.content.font ?? "sans" : "sans";
  return <>
    <RibbonGroup label={r("groups.font")} launcher={{ label: t("titleText"), disabled, onClick: () => onOpenPane("text") }}>
      <RibbonStack>
        <RibbonRow>
          <select aria-label={t("text.font")} title={t("text.font")} disabled={disabled} value={font} className="h-[22px] w-28 rounded-md border bg-background px-1 text-xs disabled:opacity-50"
            onChange={(event) => updateTexts((c) => ({ ...c, font: event.target.value as (typeof presentationFonts)[number] }))}>
            {presentationFonts.map((value) => <option key={value} value={value}>{r(`fonts.${value}`)}</option>)}
          </select>
          {icon(r("growFont"), undefined, () => onTextKey("fontBigger"), <AArrowUp />, "grow-font-button")}
          {icon(r("shrinkFont"), undefined, () => onTextKey("fontSmaller"), <AArrowDown />, "shrink-font-button")}
          <ThemeColorPicker label={t("text.highlight")} value={run.highlight ?? ""} noneLabel={t("text.noHighlight")} disabled={disabled || !format} icon={<Highlighter className="size-3.5" />} onChange={(highlight) => format?.setRun({ highlight: highlight || undefined })} />
          <ThemeColorPicker label={t("text.fillColor")} value={text?.content.color ?? ""} noneLabel={t("colors.automatic")} disabled={disabled} onEyedropper={onEyedropper} icon={<Baseline className="size-3.5" />}
            onChange={(color) => format ? format.setRun({ color: color || undefined }) : updateTexts((c) => ({ ...c, color }))} />
        </RibbonRow>
        <RibbonRow>
          {icon(r("bold"), run.bold, () => format?.setRun({ bold: !run.bold }), <Bold />, "bold-button", shortcuts.bold)}
          {icon(r("italic"), run.italic, () => format?.setRun({ italic: !run.italic }), <Italic />, "italic-button", shortcuts.italic)}
          {icon(r("underline"), run.underline, () => format?.setRun({ underline: !run.underline }), <Underline />, "underline-button", shortcuts.underline)}
          {icon(t("text.strikethrough"), run.strike === "single", () => format?.setRun({ strike: run.strike === "single" ? undefined : "single" }), <Strikethrough />, "strikethrough-button")}
          {icon(t("text.superscript"), (run.baseline ?? 0) > 0, () => format?.setRun({ baseline: (run.baseline ?? 0) > 0 ? undefined : 30 }), <Superscript />, "superscript-button")}
          {icon(t("text.subscript"), (run.baseline ?? 0) < 0, () => format?.setRun({ baseline: (run.baseline ?? 0) < 0 ? undefined : -25 }), <Subscript />, "subscript-button")}
          <DropdownMenu><DropdownMenuTrigger render={<RibbonButton iconOnly label={t("text.characterSpacing")} icon={<Space />} disabled={disabled || !format} />} />
            <DropdownMenuContent>{CHARACTER_SPACINGS.map(([id, value]) => <DropdownMenuItem key={id} onClick={() => format?.setRun({ spacing: value || undefined })}>{t(`text.characterSpacings.${id}`)}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
        </RibbonRow>
      </RibbonStack>
    </RibbonGroup>
    <RibbonGroup label={r("groups.paragraph")} launcher={{ label: t("text.paragraph"), disabled, onClick: () => onOpenPane("text") }}>
      <RibbonStack>
        <RibbonRow>
          <DropdownMenu><DropdownMenuTrigger render={<RibbonButton iconOnly label={t("text.bullets")} icon={<List />} active={p.bullet?.kind === "char"} disabled={disabled || !format} data-testid="bullets-button" />} />
            <DropdownMenuContent className="grid grid-cols-4 gap-1 p-1">{BULLET_GALLERY.map((b) => <DropdownMenuItem key={b.id} data-testid={`bullet-${b.id}`} aria-label={t(`text.bulletStyles.${b.id}`)} title={t(`text.bulletStyles.${b.id}`)}
              className="flex size-12 items-center justify-center text-xl" onClick={() => format?.setParagraph((x) => ({ ...x, bullet: b.bullet.kind === "none" ? undefined : b.bullet, indent: undefined, special: undefined, by: undefined }))}>
              {b.bullet.kind === "char" ? <span style={{ fontFamily: b.bullet.font }}>{b.bullet.char}</span> : <span className="text-xs">{t("text.none")}</span>}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger render={<RibbonButton iconOnly label={t("text.numbering")} icon={<ListOrdered />} active={p.bullet?.kind === "number"} disabled={disabled || !format} data-testid="numbering-button" />} />
            <DropdownMenuContent className="grid grid-cols-4 gap-1 p-1">{NUMBERING_GALLERY.map((n) => <DropdownMenuItem key={n.id} data-testid={`numbering-${n.id}`} aria-label={n.label || t("text.none")} title={n.label || t("text.none")}
              className="flex h-14 w-12 flex-col items-start justify-center text-[10px] leading-tight" onClick={() => format?.setParagraph((x) => ({ ...x, bullet: n.bullet.kind === "none" ? undefined : n.bullet, indent: undefined, special: undefined, by: undefined }))}>
              {n.label ? n.label.split(" ").map((label) => <span key={label}>{label} ―</span>) : <span>{t("text.none")}</span>}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          {icon(t("text.decreaseLevel"), undefined, () => format?.setParagraph((x) => shiftLevel(x, -1)), <ListIndentDecrease />)}
          {icon(t("text.increaseLevel"), undefined, () => format?.setParagraph((x) => shiftLevel(x, 1)), <ListIndentIncrease />)}
          <DropdownMenu><DropdownMenuTrigger render={<RibbonButton iconOnly label={t("text.lineSpacing")} icon={<ArrowDownUp />} disabled={disabled || !format} data-testid="line-spacing-button" />} />
            <DropdownMenuContent>{LINE_SPACINGS.map((value) => <DropdownMenuItem key={value} data-testid={`line-spacing-${value}`} onClick={() => format?.setParagraph((x) => ({ ...x, lineSpacing: value === 1 ? undefined : { rule: "multiple", value } }))}>{value.toFixed(1)}</DropdownMenuItem>)}
              <DropdownMenuSeparator /><DropdownMenuItem onClick={() => onOpenPane("text")}>{t("text.lineSpacingOptions")}</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </RibbonRow>
        <RibbonRow>
          {PARAGRAPH_ALIGNS.map(([align, Icon, key]) => <span key={align}>{icon(t(`text.aligns.${align}`), (p.align ?? "left") === align && Boolean(text), () => format?.setParagraph((x) => ({ ...x, align })), <Icon />, `paragraph-align-${align}`, key && shortcuts[key])}</span>)}
          <DropdownMenu><DropdownMenuTrigger render={<RibbonButton iconOnly label={t("text.alignText")} icon={<AlignVerticalJustifyCenter />} disabled={disabled} data-testid="align-text-button" />} />
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
        </RibbonRow>
      </RibbonStack>
    </RibbonGroup>
  </>;
}

/** Formformat › Formen einfügen, Formenarten and WordArt-Formate. */
export function ShapeRibbonGroups({ shapes, texts, updateShapes, updateTexts, onOpenPane, onEyedropper, disabled, onChangeShape, onEditPoints, onMerge, canMerge, insertShapes }: FormatRibbonProps & {
  onChangeShape: (entry: PresetGalleryEntry) => void; onEditPoints?: () => void; onMerge: (op: MergeOperation) => void; canMerge: boolean;
  /** The Shapes gallery that draws a new shape, shared with Start and Einfügen. */
  insertShapes: React.ReactNode;
}) {
  const t = useTranslations("wiki.presentations.formatPane");
  const r = useTranslations("wiki.presentations.ribbon");
  const [stylesOpen, setStylesOpen] = useState(false), [wordArtOpen, setWordArtOpen] = useState(false), [changeOpen, setChangeOpen] = useState(false);
  const first = shapes[0], text = texts[0];
  return <>
    <RibbonGroup label={r("groups.insertShapes")}>
      {insertShapes}
      <RibbonStack>
        <Popover open={changeOpen} onOpenChange={setChangeOpen}>
          <PopoverTrigger render={<RibbonButton label={t("editShape.changeShape")} icon={<Shapes />} caret disabled={disabled || !first} data-testid="change-shape-button" />} />
          <PopoverContent align="start" className="w-auto"><PresentationShapeGallery includeTools={false} onPick={(entry) => { setChangeOpen(false); onChangeShape(entry); }} /></PopoverContent>
        </Popover>
        <RibbonButton label={t("editShape.editPoints")} icon={<PenLine />} disabled={disabled || !onEditPoints} data-testid="edit-points-button" onClick={onEditPoints} />
        <DropdownMenu><DropdownMenuTrigger render={<RibbonButton label={t("merge.title")} icon={<Combine />} caret disabled={disabled || !canMerge} data-testid="merge-shapes-button" />} />
          <DropdownMenuContent>{(["union", "combine", "fragment", "intersect", "subtract"] as const).map((op) => <DropdownMenuItem key={op} data-testid={`merge-${op}`} onClick={() => onMerge(op)}>{t(`merge.${op}`)}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>
      </RibbonStack>
    </RibbonGroup>
    <RibbonGroup label={r("groups.shapeStyles")} launcher={{ label: t("title"), disabled: !first, onClick: () => onOpenPane("shape") }}>
      <Popover open={stylesOpen} onOpenChange={setStylesOpen}>
        <PopoverTrigger render={<RibbonButton large label={t("quickStyles.title")} icon={<Shapes />} caret disabled={disabled || !first} data-testid="quick-styles-button" />} />
        <PopoverContent align="start" className="w-auto"><QuickStylesGallery onPick={(style) => { setStylesOpen(false); updateShapes((c) => applyQuickStyle(c, style)); }} /></PopoverContent>
      </Popover>
      {first && <RibbonStack>
        <ThemeColorPicker label={t("fill.shapeFill")} value={first.content.fillStyle ? "" : first.content.fill} noneLabel={t("fill.noFill")} onEyedropper={onEyedropper} disabled={disabled} testId="ribbon-shape-fill"
          icon={<PaintBucket className="size-3.5" />} onChange={(fill) => updateShapes((c) => { const { fillStyle: _f, ...rest } = c; void _f; return { ...rest, fill }; })} />
        <ThemeColorPicker label={t("line.shapeOutline")} value={first.content.strokeWidth ? first.content.stroke : ""} noneLabel={t("line.noOutline")} onEyedropper={onEyedropper} disabled={disabled} testId="ribbon-shape-outline"
          icon={<PenLine className="size-3.5" />} onChange={(stroke) => updateShapes((c) => stroke ? { ...c, stroke, strokeWidth: c.strokeWidth || 1.5 } : { ...c, strokeWidth: 0 })} />
      </RibbonStack>}
    </RibbonGroup>
    <RibbonGroup label={t("wordArt.title")} launcher={{ label: t("titleText"), disabled: !text, onClick: () => onOpenPane("text") }}>
      <Popover open={wordArtOpen} onOpenChange={setWordArtOpen}>
        <PopoverTrigger render={<RibbonButton large label={r("wordArt")} icon={<Type />} caret disabled={disabled || !text} data-testid="wordart-button" />} />
        <PopoverContent align="start" className="w-auto">{text && <WordArtGallery current={text.content.textStyle?.wordArt} onPick={(index) => {
          setWordArtOpen(false);
          // A WordArt style replaces the text's fill, outline and effects, and its run colours.
          const fill = WORDART_STYLES[index].fill;
          updateTexts((c) => ({ ...c, textStyle: { ...WORDART_STYLES[index], wordArt: index }, ...(fill?.type === "solid" ? { color: fill.color } : {}), runs: c.runs?.map(({ color: _c, ...r }) => { void _c; return r; }) }));
        }} />}</PopoverContent>
      </Popover>
    </RibbonGroup>
  </>;
}
