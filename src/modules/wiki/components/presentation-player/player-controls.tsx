"use client";
// The presenter's control bar at the bottom of the player. Used by presentation-player.tsx.
import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, CornerLeftUp, Maximize, Minimize, NotebookText, Pause, Play, Scan, Spotlight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresentationLiveControl } from "../presentation-live";

export type PresenterTools = {
  presentationId: string;
  stepIndex: number;
  stopLive: RefObject<(() => Promise<void>) | null>;
  onOpenPresenterView: () => void;
};

/**
 * `hidden` fades the bar out while the mouse rests (see useIdle). It keeps its place, so the
 * camera's framing does not jump, and comes back when it holds keyboard focus.
 */
export function PlayerControls({ controlsRef, hidden, playing, canPlay, onPlay, sceneCaption, onCloseDetail, position, canPrevious, canNext, onMove,
  onOverview, spotlight, onSpotlight, fullscreen, onFullscreen, presenterTools, onExit }: {
  controlsRef: RefObject<HTMLDivElement | null>;
  hidden: boolean;
  playing: boolean;
  canPlay: boolean;
  onPlay: () => void;
  /** The open detail page's name, or null on the overview. */
  sceneCaption: string | null;
  onCloseDetail: () => void;
  position: { current: number; total: number };
  canPrevious: boolean;
  canNext: boolean;
  onMove: (delta: 1 | -1) => void;
  onOverview: () => void;
  spotlight: boolean;
  onSpotlight: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  /** Presenter view and live session, for people who may edit the presentation. */
  presenterTools: PresenterTools | null;
  onExit: () => void;
}) {
  const t = useTranslations("wiki");
  // Mouse users get the name (and key) on hover; screen readers read the same label.
  const label = (text: string, key?: string) => ({ "aria-label": text, title: key ? `${text} (${key})` : text });
  return (
    // The strip spans the whole viewport width, so it must stay transparent to pointers:
    // only the pill itself is a control, and only the pill may swallow a canvas click.
    <div ref={controlsRef} data-testid="presentation-controls" data-hidden={hidden || undefined} className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 p-4">
      <div
        // Hidden only to the eye: a tap on a touchscreen, which no hover announces, still
        // reaches the button under it instead of falling through to the slide.
        className={`pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border bg-background/90 px-2 py-1 shadow-sm backdrop-blur transition-opacity duration-300 sm:rounded-full ${hidden ? "opacity-0 focus-within:opacity-100" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <Button type="button" variant="ghost" size="icon-sm" {...label(playing ? t("presentations.pause") : t("presentations.play"))} disabled={!canPlay} onClick={onPlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        {sceneCaption !== null && <Button type="button" variant="ghost" size="sm" data-testid="presentation-detail-back" {...label(t("presentations.details.back"), "Esc")} onClick={onCloseDetail}>
          <CornerLeftUp className="size-4" /><span className="max-w-32 truncate text-xs">{sceneCaption}</span>
        </Button>}
        <Button type="button" variant="ghost" size="icon-sm" {...label(t("presentations.previousStep"), "←")} disabled={!canPrevious} onClick={() => onMove(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-16 text-center text-xs tabular-nums" role="status" aria-live="polite" title={t("presentations.jumpHint")}>
          {position.total ? `${position.current} / ${position.total}` : t("presentations.noSteps")}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" {...label(t("presentations.nextStep"), "→")} disabled={!canNext} onClick={() => onMove(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" variant="ghost" size="icon-sm" {...label(t("presentations.overview"), "Home · " + t("presentations.canvasGestureHint"))} onClick={onOverview}>
          <Scan className="size-4" />
        </Button>
        <Button type="button" variant={spotlight ? "secondary" : "ghost"} size="icon-sm" {...label(t("presentations.spotlight"))} aria-pressed={spotlight} onClick={onSpotlight}>
          <Spotlight className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" {...label(t("presentations.fullscreen"))} aria-pressed={fullscreen} onClick={onFullscreen}>
          {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </Button>
        {presenterTools && <>
          <Button type="button" variant="ghost" size="icon-sm" {...label(t("presentations.openPresenterView"))} onClick={presenterTools.onOpenPresenterView}>
            <NotebookText className="size-4" />
          </Button>
          <PresentationLiveControl presentationId={presenterTools.presentationId} stepIndex={presenterTools.stepIndex} stopRef={presenterTools.stopLive} />
        </>}
        <Button type="button" variant="ghost" size="icon-sm" {...label(t("presentations.exitPresent"), "Esc")} onClick={onExit}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
