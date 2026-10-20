"use client";
// PowerPoint's Insert > Shapes gallery for the presentation canvas: "Recently Used Shapes"
// and the eight categories in PowerPoint's order, each entry drawn by the same DrawingML
// engine that renders the shape. Picking an entry arms the drawing tool. Used by
// presentation-editor.tsx and the shape inspector ("Change shape").
import { useState } from "react";
import { useTranslations } from "next-intl";
import { presetPaths } from "../../lib/preset-shapes/preset-geometry";
import { presetGallery, type PresetGalleryEntry } from "../../lib/preset-shapes/preset-gallery";

const RECENT_KEY = "presentation-recent-shapes";
const RECENT_LIMIT = 18;
const entries = new Map(presetGallery.flatMap((group) => group.entries).map((entry) => [entry.id, entry]));

function readRecent(): PresetGalleryEntry[] {
  try {
    const ids = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(ids) ? ids.map((id) => entries.get(String(id))).filter((entry): entry is PresetGalleryEntry => Boolean(entry)) : [];
  } catch { return []; }
}

/** Remembers a picked entry at the front of this browser's "Recently Used Shapes". */
export function rememberShape(id: string) {
  try {
    const next = [id, ...readRecent().map((entry) => entry.id).filter((other) => other !== id)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage unavailable: the gallery simply shows no recent row */ }
}

const TOOL_ICONS: Record<string, string> = {
  textBox: "M3 4h16v14H3z M8 15l3-8 3 8 M9.2 12.5h3.6",
  line: "M4 18 18 4",
  lineArrow: "M4 18 18 4 M12 4h6v6",
  lineDoubleArrow: "M4 18 18 4 M12 4h6v6 M4 12v6h6",
  elbowConnector: "M3 17h8V5h8",
  elbowArrowConnector: "M3 17h8V5h8 M15 2l4 3-4 3",
  elbowDoubleArrowConnector: "M3 17h8V5h8 M15 2l4 3-4 3 M7 14l-4 3 4 3",
  curvedConnector: "M3 18C11 18 11 4 19 4",
  curvedArrowConnector: "M3 18C11 18 11 4 19 4 M15 1.5 19 4l-4 2.5",
  curvedDoubleArrowConnector: "M3 18C11 18 11 4 19 4 M15 1.5 19 4l-4 2.5 M7 15.5 3 18l4 2.5",
  curve: "M3 15C6 3 10 3 11 11s5 8 8-4",
  freeform: "M4 17 7 6l6 4 2-6 4 13z",
  scribble: "M3 14c3-9 5 6 7-2s3-7 5 1 2 6 4-3",
};

/** The gallery icon of an entry: its outline, like PowerPoint's. */
export function ShapeGalleryIcon({ entry, size = 22 }: { entry: PresetGalleryEntry; size?: number }) {
  if (entry.tool) {
    return <svg viewBox="0 0 22 22" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={TOOL_ICONS[entry.id]} /></svg>;
  }
  // The default proportions, fitted into the icon with a little room for the stroke.
  const scale = (size - 4) / Math.max(entry.width, entry.height);
  const w = entry.width * scale, h = entry.height * scale;
  return <svg viewBox={`${-(size - w) / 2} ${-(size - h) / 2} ${size} ${size}`} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1} aria-hidden>
    {presetPaths(entry.id, w, h).map((path, index) => <path key={index} d={path.d} />)}
  </svg>;
}

/** The gallery itself: categories of icon buttons, labelled like PowerPoint's tooltips. */
export function PresentationShapeGallery({ onPick, includeTools = true, allowLock = false }: { onPick: (entry: PresetGalleryEntry, options?: { lock?: boolean }) => void; includeTools?: boolean; allowLock?: boolean }) {
  const t = useTranslations("wiki.presentations.shapeGallery");
  // Right-click on an entry offers PowerPoint's "Lock Drawing Mode": the tool stays armed until Escape.
  const [menu, setMenu] = useState<{ entry: PresetGalleryEntry; x: number; y: number } | null>(null);
  // Read once when the gallery opens; picking updates it for the next opening.
  const [recent] = useState(readRecent);
  const groups = [
    ...(recent.length ? [{ category: "recent", entries: recent }] : []),
    ...presetGallery,
  ].map((group) => ({ ...group, entries: group.entries.filter((entry) => includeTools || !entry.tool) })).filter((group) => group.entries.length);
  return (
    <div className="relative max-h-[min(70vh,34rem)] w-[19rem] overflow-y-auto pr-1" data-testid="presentation-shape-gallery" onClick={() => setMenu(null)}>
      {menu && <div role="menu" className="absolute z-10 rounded-md border bg-popover p-1 text-xs shadow-md" style={{ left: menu.x, top: menu.y }}>
        <button type="button" role="menuitem" data-testid="lock-drawing-mode" className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
          onClick={(event) => { event.stopPropagation(); rememberShape(menu.entry.id); onPick(menu.entry, { lock: true }); setMenu(null); }}>{t("lockDrawingMode")}</button>
      </div>}
      {groups.map((group) => (
        <section key={group.category} aria-label={t(group.category)} className="mb-2 last:mb-0">
          <h3 className="mb-1 px-0.5 text-xs font-semibold">{t(group.category)}</h3>
          <div className="grid grid-cols-10 gap-px">
            {group.entries.map((entry) => {
              const label = t(`shapes.${entry.id}`);
              return (
                <button key={`${group.category}-${entry.id}`} type="button" title={label} aria-label={label} data-shape-entry={entry.id}
                  className="grid size-7 place-items-center rounded-sm text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => { rememberShape(entry.id); onPick(entry); }}
                  onContextMenu={(event) => {
                    if (!allowLock) return;
                    event.preventDefault();
                    const box = event.currentTarget.closest("[data-testid=presentation-shape-gallery]")!.getBoundingClientRect();
                    setMenu({ entry, x: event.clientX - box.left, y: event.clientY - box.top + (event.currentTarget.closest("[data-testid=presentation-shape-gallery]") as HTMLElement).scrollTop });
                  }}>
                  <ShapeGalleryIcon entry={entry} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
