"use client";
// Shape Format → Shape Styles (Theme Styles and Presets) and WordArt Styles galleries, each a
// grid of previews drawn from the values read back from PowerPoint (lib/powerpoint-quick-styles).
import { useTranslations } from "next-intl";
import { QUICK_STYLES, QUICK_STYLE_COLUMNS, QUICK_STYLE_ROWS, QUICK_STYLE_THEME_ROWS, WORDART_STYLES, type QuickStyle } from "../../../lib/powerpoint-quick-styles";
import { gradientPreview, wordArtCss } from "../../../lib/presentation-text-style";

function QuickStyleSwatch({ style }: { style: QuickStyle }) {
  const background = style.gradient ? gradientPreview(style.gradient.stops.map(([color, position]) => ({ color, position })), style.gradient.angle)
    : style.fill ? style.fill : "transparent";
  return <span className="flex h-8 w-11 items-center justify-center rounded-[2px] text-[11px]" style={{
    background, opacity: style.fillTransparency ? 1 - style.fillTransparency / 2 : undefined, color: style.text,
    border: style.line ? `${Math.max(1, Math.min(2, style.lineWidth ?? 1))}px solid ${style.line}` : "1px dashed rgb(0 0 0 / 0.15)",
    boxShadow: style.shadow ? `0 ${style.shadow.distance}px ${style.shadow.blur}px rgb(0 0 0 / ${1 - style.shadow.transparency})` : undefined,
  }}>Abc</span>;
}

export function QuickStylesGallery({ onPick }: { onPick: (style: QuickStyle) => void }) {
  const t = useTranslations("wiki.presentations.formatPane.quickStyles");
  const tc = useTranslations("wiki.presentations.formatPane.colors.theme");
  const rows = QUICK_STYLE_ROWS.map((row, r) => ({ row, styles: QUICK_STYLES.slice(r * 7, r * 7 + 7) }));
  const section = (title: string, list: typeof rows) => <div className="space-y-1">
    <p className="text-xs font-semibold">{title}</p>
    {list.map(({ row, styles }) => <div key={row} className="flex gap-1">
      {styles.map((style, i) => {
        const label = t("name", { style: t(`rows.${row}`), color: tc(QUICK_STYLE_COLUMNS[i]) });
        return <button key={style.id} type="button" title={label} aria-label={label} data-testid={`quick-style-${style.id}`} className="rounded p-0.5 hover:outline hover:outline-2 hover:outline-amber-500" onClick={() => onPick(style)}><QuickStyleSwatch style={style} /></button>;
      })}
    </div>)}
  </div>;
  return <div className="max-h-[70vh] space-y-3 overflow-y-auto" data-testid="quick-styles-gallery">
    {section(t("theme"), rows.slice(0, QUICK_STYLE_THEME_ROWS))}
    {section(t("presets"), rows.slice(QUICK_STYLE_THEME_ROWS))}
  </div>;
}

export function WordArtGallery({ onPick, current }: { onPick: (index: number) => void; current?: number }) {
  const t = useTranslations("wiki.presentations.formatPane.wordArt");
  return <div className="grid grid-cols-5 gap-1" data-testid="wordart-gallery">
    {WORDART_STYLES.map((style, i) => <button key={i} type="button" title={t(`styles.${i}`)} aria-label={t(`styles.${i}`)} aria-pressed={current === i} data-testid={`wordart-${i}`}
      className="flex size-11 items-center justify-center rounded border bg-white text-3xl font-bold hover:outline hover:outline-2 hover:outline-amber-500" onClick={() => onPick(i)}>
      <span style={{ fontFamily: "Aptos, 'Segoe UI', system-ui, sans-serif", color: "#000", ...wordArtCss(style) }}>A</span>
    </button>)}
  </div>;
}
