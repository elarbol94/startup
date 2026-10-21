"use client";
// What the player lays over the canvas: the spotlight/laser pointer, a black or white screen,
// and the stop number being typed. Used by presentation-player.tsx.
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

export type BlankScreen = "black" | "white" | null;

/**
 * Dims everything but a circle around the pointer, with a red dot at its centre. The pointer
 * position is written straight to the overlay's own CSS variables instead of React state so
 * mouse movement never triggers a render. The system cursor is hidden by the player meanwhile.
 */
export function SpotlightOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      ref.current?.style.setProperty("--spotlight-x", `${event.clientX}px`);
      ref.current?.style.setProperty("--spotlight-y", `${event.clientY}px`);
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      data-testid="presentation-spotlight"
      className="pointer-events-none fixed inset-0 z-40"
      style={{ background: "radial-gradient(circle 180px at var(--spotlight-x, 50%) var(--spotlight-y, 50%), transparent 0%, transparent 55%, rgb(0 0 0 / 0.55) 100%)" }}
    >
      <div
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_14px_4px_rgba(239,68,68,0.85)]"
        style={{ left: "var(--spotlight-x, 50%)", top: "var(--spotlight-y, 50%)" }}
      />
    </div>
  );
}

/** PowerPoint's B and W: the screen goes black or white until the presenter carries on. */
export function BlankScreenOverlay({ screen }: { screen: BlankScreen }) {
  const t = useTranslations("wiki");
  if (!screen) return null;
  return (
    <div
      data-testid="presentation-blank"
      data-screen={screen}
      role="img"
      aria-label={t(screen === "black" ? "presentations.blackScreen" : "presentations.whiteScreen")}
      className="fixed inset-0 z-40"
      style={{ backgroundColor: screen === "black" ? "#000" : "#fff" }}
    />
  );
}

/** The stop number typed so far, before Enter jumps to it. */
export function StopNumberBadge({ digits }: { digits: string }) {
  const t = useTranslations("wiki");
  if (!digits) return null;
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 rounded-lg border bg-background/90 px-3 py-1.5 text-sm tabular-nums shadow-sm backdrop-blur" role="status" data-testid="presentation-stop-number">
      {t("presentations.goToStop", { number: digits })}
    </div>
  );
}
