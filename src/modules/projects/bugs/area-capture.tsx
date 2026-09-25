"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Point = { x: number; y: number };
type Area = { x: number; y: number; width: number; height: number };
const minimum = 16;

export function AreaCapture({ onCapture, onCancel, onError }: {
  onCapture: (file: File) => void; onCancel: () => void; onError: () => void;
}) {
  const t = useTranslations("bugReports");
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<Point | null>(null);
  const capturing = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = root.current;
    element?.focus();
    // The closing report dialog restores focus after unmount. Keep that handoff
    // inside the selector so keyboard input never reaches the underlying page.
    const keepFocus = (event: FocusEvent) => { if (!element?.contains(event.target as Node)) element?.focus(); };
    document.addEventListener("focusin", keepFocus);
    const focusFrame = requestAnimationFrame(() => element?.focus());
    const preventScroll = (event: Event) => event.preventDefault();
    element?.addEventListener("wheel", preventScroll, { passive: false });
    const resize = () => {
      if (capturing.current) { controller.current?.abort(); onCancel(); }
      else { start.current = null; setArea(null); }
    };
    window.addEventListener("resize", resize);
    return () => { controller.current?.abort(); cancelAnimationFrame(focusFrame); document.removeEventListener("focusin", keepFocus); element?.removeEventListener("wheel", preventScroll); window.removeEventListener("resize", resize); };
  }, [onCancel]);

  function point(event: React.PointerEvent): Point {
    return { x: Math.max(0, Math.min(window.innerWidth, event.clientX)), y: Math.max(0, Math.min(window.innerHeight, event.clientY)) };
  }
  function update(event: React.PointerEvent) {
    if (!start.current) return;
    const end = point(event);
    setArea({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.abs(end.x - start.current.x), height: Math.abs(end.y - start.current.y) });
  }
  async function capture() {
    if (!area || area.width < minimum || area.height < minimum || capturing.current) return;
    capturing.current = true; setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      if (abort.signal.aborted) return;
      const canvas = await html2canvas(document.documentElement, {
        x: window.scrollX + area.x, y: window.scrollY + area.y,
        width: area.width, height: area.height,
        scrollX: window.scrollX, scrollY: window.scrollY,
        windowWidth: window.innerWidth, windowHeight: window.innerHeight,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        logging: false, allowTaint: false, useCORS: false, imageTimeout: 3000,
        signal: abort.signal,
        ignoreElements: element => element.hasAttribute("data-html2canvas-ignore") || element.tagName === "NEXTJS-PORTAL",
        onclone: document => {
          document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ""; });
        },
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      canvas.width = 0; canvas.height = 0;
      if (abort.signal.aborted) return;
      if (!blob || blob.size > 10 * 1024 * 1024) throw new Error("Screenshot unavailable or too large");
      onCapture(new File([blob], `bug-area-${Date.now()}.png`, { type: "image/png" }));
    } catch { if (!abort.signal.aborted) onError(); }
  }

  return createPortal(<div ref={root} role="dialog" aria-modal="true" aria-label={t("selectArea")} aria-describedby="capture-instructions"
    tabIndex={-1} data-testid="bug-area-selector" data-html2canvas-ignore="true"
    className="fixed inset-0 z-[100] touch-none select-none outline-none"
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); controller.current?.abort(); onCancel(); return; }
      if (event.key === "Tab") {
        const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (buttons.length) { event.preventDefault(); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus(); }
      }
      if (busy) return;
      if (event.key === "Enter" && event.target === root.current) { event.preventDefault(); void capture(); }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const current = area ?? { x: window.innerWidth * .25, y: window.innerHeight * .25, width: window.innerWidth * .5, height: window.innerHeight * .5 };
        const dx = event.key === "ArrowLeft" ? -10 : event.key === "ArrowRight" ? 10 : 0;
        const dy = event.key === "ArrowUp" ? -10 : event.key === "ArrowDown" ? 10 : 0;
        setArea(event.shiftKey ? { ...current, width: Math.max(minimum, Math.min(window.innerWidth - current.x, current.width + dx)), height: Math.max(minimum, Math.min(window.innerHeight - current.y, current.height + dy)) }
          : { ...current, x: Math.max(0, Math.min(window.innerWidth - current.width, current.x + dx)), y: Math.max(0, Math.min(window.innerHeight - current.height, current.y + dy)) });
      }
    }}>
    <div className={`absolute inset-0 ${busy ? "cursor-wait" : "cursor-crosshair"}`} data-testid="bug-area-surface"
      onPointerDown={event => { if (busy || !event.isPrimary || event.button !== 0) return; event.preventDefault(); root.current?.focus(); start.current = point(event); setArea(null); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={update}
      onPointerUp={event => { update(event); start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { start.current = null; setArea(null); }}>
      {area ? <div data-testid="bug-area-rectangle" className="pointer-events-none absolute border-2 border-white ring-1 ring-black" style={{ left: area.x, top: area.y, width: area.width, height: area.height, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)" }} /> : <div className="pointer-events-none absolute inset-0 bg-black/40" />}
    </div>
    <div className="absolute inset-x-3 top-3 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-xl border bg-background p-3 shadow-xl" role="group" aria-label={t("captureControls")}>
      <p id="capture-instructions" className="w-full text-sm">{busy ? t("capturing") : t("selectHint")}</p>
      <p className="text-xs text-muted-foreground">{t("keyboardHint")}</p>
      <div className="ml-auto flex gap-2"><Button type="button" variant="outline" onClick={() => { controller.current?.abort(); onCancel(); }}>{t("cancelCapture")}</Button><Button type="button" disabled={busy || !area || area.width < minimum || area.height < minimum} onClick={() => void capture()}>{t("useArea")}</Button></div>
    </div>
  </div>, document.body);
}
