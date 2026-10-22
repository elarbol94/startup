"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useViewport } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, Underline, List, ListOrdered, Baseline, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presentationCameraBounds, presentationFonts, type PresentationElement } from "../../lib/presentation";
import { ThemeColorPicker } from "./format-pane/theme-color-picker";
import type { TextFormatApi } from "./use-text-format";

type TextHost = Extract<PresentationElement, { type: "text" | "shape" }>;

/** An overlay in screen units: it follows the selected text but never scales with the canvas. */
export function FloatingTextToolbar({ element, format, canvasRef, updateText, onMore }: {
  element: TextHost;
  format: TextFormatApi;
  canvasRef: RefObject<HTMLDivElement | null>;
  updateText: (change: (content: TextHost["content"]) => TextHost["content"]) => void;
  onMore: () => void;
}) {
  const t = useTranslations("wiki.presentations.formatPane");
  const r = useTranslations("wiki.presentations.ribbon");
  const f = useTranslations("wiki.presentations.floatingText");
  const viewport = useViewport();
  const ref = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [size, setSize] = useState({ width: 360, height: 82, canvasWidth: 0, canvasHeight: 0 });
  useLayoutEffect(() => {
    const toolbar = ref.current, canvas = canvasRef.current;
    if (!toolbar || !canvas) return;
    const measure = () => setSize({ width: toolbar.offsetWidth, height: toolbar.offsetHeight, canvasWidth: canvas.clientWidth, canvasHeight: canvas.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar); observer.observe(canvas); measure();
    return () => observer.disconnect();
  }, [canvasRef]);
  if (dismissed) return null;
  const bounds = presentationCameraBounds(element);
  const edge = 8, gap = 12;
  const left = Math.max(edge, Math.min(bounds.x * viewport.zoom + viewport.x, size.canvasWidth - size.width - edge));
  const above = bounds.y * viewport.zoom + viewport.y - size.height - gap;
  const below = (bounds.y + bounds.height) * viewport.zoom + viewport.y + gap;
  const top = Math.max(edge, Math.min(above >= edge ? above : below, size.canvasHeight - size.height - edge));
  const { run, paragraph } = format;
  const fontSize = run.size ?? element.content.fontSize ?? 32;
  const icon = (label: string, active: boolean | undefined, action: () => void, child: ReactNode, testId?: string) =>
    <Button type="button" size="icon-sm" variant={active ? "secondary" : "ghost"} aria-label={label} title={label}
      aria-pressed={active} onClick={action} data-testid={testId} className="size-8 shrink-0">{child}</Button>;
  const inputClass = "h-8 min-w-0 rounded-md border bg-background px-1.5 text-xs";
  return <div ref={ref} role="toolbar" aria-label={f("title")} data-presentation-overlay data-presentation-text-toolbar data-testid="floating-text-toolbar"
    className="nodrag nopan nowheel absolute z-50 flex max-w-[calc(100%-16px)] flex-col gap-1 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-md"
    style={{ left, top }}
    onPointerDown={event => event.stopPropagation()}
    onMouseDown={event => { event.stopPropagation(); if ((event.target as HTMLElement).closest("button")) event.preventDefault(); }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); setDismissed(true); canvasRef.current?.focus(); } }}>
    <div className="flex flex-wrap items-center gap-1">
      <select aria-label={t("text.font")} title={t("text.font")} value={element.content.font ?? "sans"} className={inputClass + " w-28"}
        onChange={event => updateText(content => ({ ...content, font: event.target.value as (typeof presentationFonts)[number] }))}>
        {presentationFonts.map(font => <option key={font} value={font}>{r(`fonts.${font}`)}</option>)}
      </select>
      <input key={fontSize} type="number" min={8} max={400} step={1} aria-label={f("fontSize")} defaultValue={fontSize}
        className={inputClass + " w-14"} onBlur={event => {
          const value = Number(event.target.value);
          if (Number.isInteger(value) && value >= 8 && value <= 400) { if (value !== fontSize) format.setRun({ size: value }); }
          else event.target.value = String(fontSize);
        }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
      {icon(r("bold"), !!run.bold, () => format.setRun({ bold: !run.bold }), <Bold className="size-4" />, "floating-text-bold")}
      {icon(r("italic"), !!run.italic, () => format.setRun({ italic: !run.italic }), <Italic className="size-4" />)}
      {icon(r("underline"), !!run.underline, () => format.setRun({ underline: !run.underline }), <Underline className="size-4" />)}
      <ThemeColorPicker textToolbar label={t("text.fillColor")} value={run.color ?? element.content.color ?? ""} noneLabel={t("colors.automatic")}
        icon={<Baseline className="size-4" />} onChange={color => format.setRun({ color: color || undefined })} testId="floating-text-color" />
      {icon(f("close"), undefined, () => setDismissed(true), <X className="size-4" />)}
    </div>
    <div className="flex flex-wrap items-center gap-1">
      {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight], ["justify", AlignJustify]] as const).map(([align, Icon]) =>
        <span key={align}>{icon(t(`text.aligns.${align}`), (paragraph.align ?? element.content.align ?? "left") === align,
          () => format.setParagraph(p => ({ ...p, align })), <Icon className="size-4" />, `floating-text-align-${align}`)}</span>)}
      {icon(t("text.bullets"), paragraph.bullet?.kind === "char", () => format.setParagraph(p => ({ ...p, bullet: p.bullet?.kind === "char" ? undefined : { kind: "char", char: "•" } })), <List className="size-4" />)}
      {icon(t("text.numbering"), paragraph.bullet?.kind === "number", () => format.setParagraph(p => ({ ...p, bullet: p.bullet?.kind === "number" ? undefined : { kind: "number", scheme: "arabicPeriod" } })), <ListOrdered className="size-4" />)}
      <select className={inputClass + " w-16"} aria-label={t("text.lineSpacing")} title={t("text.lineSpacing")}
        value={paragraph.lineSpacing?.rule === "multiple" ? paragraph.lineSpacing.value : ""}
        onChange={event => format.setParagraph(p => ({ ...p, lineSpacing: event.target.value ? { rule: "multiple", value: Number(event.target.value) } : undefined }))}>
        <option value="">—</option>{[1, 1.15, 1.5, 2, 2.5, 3].map(value => <option key={value} value={value}>{value.toLocaleString()}×</option>)}
      </select>
      {icon(f("more"), undefined, onMore, <Settings2 className="size-4" />)}
    </div>
  </div>;
}
