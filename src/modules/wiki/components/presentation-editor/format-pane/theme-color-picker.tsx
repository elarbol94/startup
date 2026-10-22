"use client";
// PowerPoint's colour menu: Theme Colors (base row plus five tint/shade rows), Standard Colors,
// Recent Colors, No Fill/Automatic, More Colors… and the Eyedropper. Colours are stored as hex.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Pipette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { STANDARD_COLORS, THEME_COLORS, THEME_COLUMNS, themeVariants, withBrightness } from "../../../lib/powerpoint-theme";

const RECENT_KEY = "presentation-recent-colors";
function readRecent(): string[] { try { return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]").filter((c: unknown) => typeof c === "string").slice(0, 10); } catch { return []; } }
function remember(color: string) { try { window.localStorage.setItem(RECENT_KEY, JSON.stringify([color, ...readRecent().filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, 10))); } catch { /* private mode */ } }

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/**
 * Picks a colour from the screen: the browser's EyeDropper where there is one (Chromium), or
 * the editor's own picker (a click on an object takes its colour), passed as `onEyedropper`.
 */
export async function pickScreenColor(fallback?: () => Promise<string | null>): Promise<string | null> {
  const Dropper = (globalThis as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  if (Dropper) { try { return (await new Dropper().open()).sRGBHex.toUpperCase(); } catch { return null; } }
  return fallback ? fallback() : null;
}

export function ThemeColorPicker({ value, onChange, label, noneLabel, onEyedropper, disabled, testId, icon, textToolbar }: {
  value: string; onChange: (color: string) => void; label: string;
  /** "No Fill" / "No Outline" / "Automatic": the empty value. Absent for colours that must be set. */
  noneLabel?: string; onEyedropper?: () => Promise<string | null>; disabled?: boolean; testId?: string;
  /** Ribbon style: an icon over a colour bar instead of a swatch. */
  icon?: React.ReactNode; textToolbar?: boolean;
}) {
  const t = useTranslations("wiki.presentations.formatPane.colors");
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const pick = (color: string) => { if (color) remember(color); onChange(color); setOpen(false); };
  const name = (key: (typeof THEME_COLUMNS)[number]["key"], variant?: number) => variant
    ? t("variant", { color: t(`theme.${key}`), direction: variant > 0 ? "lighter" : "darker", amount: Math.round(Math.abs(variant) * 100) })
    : t(`theme.${key}`);
  const swatch = (color: string, title: string, key?: string) => <button key={key ?? title} type="button" title={title} aria-label={title}
    className={cn("size-4 border border-black/10 outline-offset-1 hover:outline hover:outline-2 hover:outline-amber-500", value.toLowerCase() === color.toLowerCase() && "outline outline-2 outline-amber-600")}
    style={{ backgroundColor: color }} onClick={() => pick(color)} />;
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setRecent(readRecent()); }}>
    <PopoverTrigger render={<button type="button" aria-label={label} title={label} data-testid={testId} disabled={disabled}
      className="inline-flex h-7 items-center gap-0.5 rounded-md border bg-background px-1 disabled:opacity-50" />}>
      {icon ? <span className="flex flex-col items-center">{icon}<span className="h-1 w-4" style={{ backgroundColor: value || "transparent", outline: value ? undefined : "1px dashed currentColor" }} /></span>
        : <span className="size-4 rounded-sm border" style={{ background: value || "repeating-linear-gradient(45deg,#fff 0 3px,#ddd 3px 6px)" }} />}
      <ChevronDown className="size-3" />
    </PopoverTrigger>
    <PopoverContent data-text-toolbar-popup={textToolbar || undefined} align="start" className="w-auto space-y-2 p-2" data-testid={testId ? `${testId}-menu` : undefined}>
      {noneLabel && <button type="button" className="w-full rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => pick("")}>{noneLabel}</button>}
      <p className="text-xs font-semibold">{t("themeColors")}</p>
      <div className="grid grid-cols-10 gap-x-1">
        {THEME_COLUMNS.map((column) => swatch(THEME_COLORS[column.key], name(column.key), column.key))}
      </div>
      <div className="grid grid-cols-10 gap-x-1 gap-y-0.5">
        {[0, 1, 2, 3, 4].flatMap((row) => THEME_COLUMNS.map((column) => {
          const variant = themeVariants(column.key)[row];
          return swatch(withBrightness(THEME_COLORS[column.key], variant), name(column.key, variant), `${column.key}-${row}`);
        }))}
      </div>
      <p className="text-xs font-semibold">{t("standardColors")}</p>
      <div className="grid grid-cols-10 gap-x-1">{STANDARD_COLORS.map((c, i) => swatch(c.color, t(`standard.${i}`), c.color))}</div>
      {recent.length > 0 && <><p className="text-xs font-semibold">{t("recentColors")}</p><div className="grid grid-cols-10 gap-x-1">{recent.map((c) => swatch(c, c, `recent-${c}`))}</div></>}
      <label className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted">
        <span className="size-4 rounded-sm" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }} />{t("more")}
        <input type="color" className="sr-only" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(event) => pick(event.target.value.toUpperCase())} />
      </label>
      <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={async () => {
        setOpen(false);
        const color = await pickScreenColor(onEyedropper);
        if (color) pick(color);
      }}><Pipette className="size-4" />{t("eyedropper")}</button>
    </PopoverContent>
  </Popover>;
}
