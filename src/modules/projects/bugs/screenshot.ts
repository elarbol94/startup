"use client";

export type Area = { x: number; y: number; width: number; height: number };

/** Renders a viewport-relative area of the page, skipping the selector itself. */
export async function renderArea(area: Area, signal: AbortSignal) {
  const { default: html2canvas } = await import("html2canvas-pro");
  signal.throwIfAborted();
  return html2canvas(document.documentElement, {
    x: window.scrollX + area.x, y: window.scrollY + area.y,
    width: area.width, height: area.height,
    scrollX: window.scrollX, scrollY: window.scrollY,
    windowWidth: window.innerWidth, windowHeight: window.innerHeight,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    logging: false, allowTaint: false, useCORS: false, imageTimeout: 3000,
    signal,
    ignoreElements: element => element.hasAttribute("data-html2canvas-ignore") || element.tagName === "NEXTJS-PORTAL",
    onclone: document => {
      document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ""; });
    },
  });
}

/** Freezes the visible screen so short-lived popups and errors stay selectable. */
export function freezeViewport(signal: AbortSignal) {
  return renderArea({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }, signal);
}

/** Crops a viewport-relative area out of a frozen viewport snapshot. */
export function cropSnapshot(snapshot: HTMLCanvasElement, area: Area) {
  const scale = snapshot.width / window.innerWidth;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width * scale); canvas.height = Math.round(area.height * scale);
  canvas.getContext("2d")!.drawImage(snapshot, area.x * scale, area.y * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
