"use client";
import { clientUUID } from "@/lib/client-uuid";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ReactFlow, ReactFlowProvider, getViewportForBounds, useReactFlow, useStore, useStoreApi, type NodeMouseHandler } from "@xyflow/react";
import { ChevronLeft, ChevronRight, CornerLeftUp, Maximize, Minimize, NotebookText, Pause, Play, Scan, Spotlight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  PRESENTATION_CAMERA_PADDING,
  presentationCameraBounds,
  elementClickAction,
  elementsWithinStep,
  presentationCameraEasingFns,
  resolveStepDuration,
  stepTarget,
  presentationHiddenIds,
  presentationDetails,
  presentationElementCaption,
  presentationSceneElements,
  presentationScenePosition,
  presentationStops,
  enterPresentationDetail,
  exitPresentationDetail,
  sceneOfStop,
  stepPresentationPosition,
  type PresentationBounds,
  type PresentationPosition,
  type PresentationStop,
} from "../lib/presentation";
import { PresentationDetailBadges } from "./presentation-detail-badges";
import { useDetailFlip } from "./presentation-player/use-detail-flip";
import { parsePresenterMessage, presenterChannelName } from "../lib/presenter";
import type { PresentationRecord } from "../presentation-queries";
import { elementsToNodes, presentationNodeTypes, type PresentationNode } from "./presentation-canvas";
import { PresentationFollowBadge, PresentationLiveControl, usePresentationFollower } from "./presentation-live";

/** Set when this player is a remote follower mirroring someone else's live session. */
type FollowSource = { code: string; hostName: string; hostUserId?: string; stepIndex?: number; live?: boolean };

// How long a free pan/zoom gesture is left alone before the camera snaps back to the
// current step's framing. Short enough that the view doesn't stay adrift, long enough
// that a pause mid-gesture (lifting fingers to reposition) doesn't get cut off.
const GESTURE_SNAP_BACK_MS = 900;

// How long leaving the player waits for the live session to be stopped before it navigates
// anyway. A hung request must not trap the presenter in the player; if the cap wins, the
// session's own 45s heartbeat staleness is what ends it.
const LIVE_STOP_TIMEOUT_MS = 2_000;

function Player({ presentation, follow }: { presentation: PresentationRecord; follow?: FollowSource }) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const reactFlow = useReactFlow<PresentationNode>();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const viewportSized = useStore((state) => state.width > 0 && state.height > 0);
  const { steps, settings } = presentation;
  const elements = presentation.elements;
  // Stops are the steps plus one for each detail page without its own; the player walks
  // the stops of the open scene and remembers where each open detail page was entered from.
  const stops = useMemo(() => presentationStops(elements, steps), [elements, steps]);
  const details = presentationDetails(elements);
  const [position, setPosition] = useState<PresentationPosition>(() => {
    const first = stops.findIndex((stop) => stop.sceneId === null);
    return { index: follow ? clampStop(follow.stepIndex ?? 0, stops) : Math.max(first, 0), returns: [] };
  });
  const index = position.index;
  const scene = sceneOfStop(stops, index);
  const sceneElements = useMemo(() => presentationSceneElements(elements, scene), [elements, scene]);
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [presenterSession] = useState(() => clientUUID());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [playing, setPlaying] = useState(false);

  const cameraDuration = reducedMotion ? 0 : settings.cameraTransitionMs;
  const cameraEase = presentationCameraEasingFns[settings.cameraEasing];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Elements that belong to the current step's target: what fades in as it arrives.
  // Derived straight from the index, so re-arriving at a step re-plays the entrance.
  const enteringIds = useMemo(() => {
    const step = stops[index]?.step;
    const target = step ? stepTarget(step, sceneElements) : null;
    return target ? new Set(elementsWithinStep(target, sceneElements).map((element) => element.id)) : new Set<string>();
  }, [index, stops, sceneElements]);

  const hiddenIds = useMemo(() => presentationHiddenIds(elements, steps, stops[index]?.stepIndex ?? -1), [elements, steps, stops, index]);
  const animationMs = reducedMotion ? 0 : stops[index]?.step.animationMs ?? 300;
  const nodes = useMemo(() => elementsToNodes(sceneElements, { editable: false, enteringIds: reducedMotion ? undefined : enteringIds, hiddenIds, animationMs, background: presentation.background }), [sceneElements,enteringIds, hiddenIds, animationMs, reducedMotion, presentation.background]);

  const overview = useCallback(
    (duration = cameraDuration) => void reactFlow.fitView({ padding: 0.15, duration, ease: cameraEase }),
    [reactFlow, cameraDuration, cameraEase],
  );

  /** Fits a stop with the usual padding, plus the control bar's height at the bottom so the
   * bar never covers it. */
  const store = useStoreApi<PresentationNode>();
  const fitStop = useCallback((bounds: PresentationBounds, duration: number) => {
    const { width, height, minZoom, maxZoom } = store.getState();
    const inset = Math.floor((height - height / (1 + PRESENTATION_CAMERA_PADDING)) / 2);
    const padding = { x: PRESENTATION_CAMERA_PADDING, top: `${inset}px`, bottom: `${inset + (controlsRef.current?.offsetHeight ?? 0)}px` } as const;
    void reactFlow.setViewport(getViewportForBounds(bounds, width, height, minZoom, maxZoom, padding), { duration, ease: cameraEase });
  }, [store, reactFlow, cameraEase]);

  /**
   * Every step is framed by fitting its element's bounds, so a small frame nested inside
   * a large one zooms all the way in — the camera never inherits the previous scale.
   */
  const flyTo = useCallback(
    (stepIndex: number, duration = cameraDuration) => {
      const step = cameraStop(stops, stepIndex);
      const target = step ? stepTarget(step, elements) : null;
      if (!target) return overview(duration);
      fitStop(presentationCameraBounds(target), duration);
    },
    [elements, overview, stops, cameraDuration, fitStop],
  );

  // Presenter-side pinch/wheel zoom and free pan: ReactFlow's own pane already implements
  // the pointer/touch gesture handling (zoomOnPinch, zoomOnScroll, panOnDrag below), so the
  // only piece left to build is "snap back once the presenter lets go" — a short idle timer
  // armed on every real user-driven viewport change and cleared by the next step's flight.
  const snapBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSnapBack = useCallback(() => {
    if (snapBackTimer.current) {
      clearTimeout(snapBackTimer.current);
      snapBackTimer.current = null;
    }
  }, []);
  const scheduleSnapBack = useCallback(() => {
    clearSnapBack();
    snapBackTimer.current = setTimeout(() => flyTo(index), GESTURE_SNAP_BACK_MS);
  }, [clearSnapBack, flyTo, index]);
  // An element click's own mouseup reaches the pane's onMoveEnd (with a populated event,
  // same as a real gesture) BEFORE the click's onNodeClick fires — @xyflow/system defers
  // that callback to a setTimeout(..., 0) queued during mouseup, which a same-task click
  // handler always runs ahead of. So a click can't clear a snap-back it hasn't armed yet;
  // it has to tell onGestureEnd to skip arming one at all, ordering-independent either way.
  const suppressSnapBack = useRef(false);
  // ReactFlow reports its own programmatic moves (flyTo/fitView) with a null event, and only
  // a real mouse/touch/wheel interaction with a populated one — exactly the distinction
  // needed to tell "the presenter is gesturing" from "we just flew the camera ourselves".
  const onGestureStart = useCallback(
    (event: MouseEvent | TouchEvent | null) => {
      if (event) {
        // Ctrl+click never starts a d3 gesture (createFilter rejects ctrlKey mousedowns), so
        // onMoveEnd never fires to consume a suppression flag set by that same click's
        // onNodeClick — left true, it would swallow the *next* real gesture's snap-back.
        // move-start always precedes node-click, so clearing it here is ordering-safe.
        suppressSnapBack.current = false;
        clearSnapBack();
      }
    },
    [clearSnapBack],
  );
  const onGestureEnd = useCallback(
    (event: MouseEvent | TouchEvent | null) => {
      if (!event) return;
      if (suppressSnapBack.current) {
        suppressSnapBack.current = false;
        return;
      }
      scheduleSnapBack();
    },
    [scheduleSnapBack],
  );
  // A step change already re-frames the camera (the flyTo effect below); any snap-back
  // still pending from a gesture on the previous step would otherwise fire later and fly
  // to a stale index.
  useEffect(() => clearSnapBack, [index, clearSnapBack]);


  // A follower's camera belongs to the presenter, so every local way to move — clicking the
  // canvas, the arrow keys, the control bar — routes through here and does nothing.
  const following = Boolean(follow);

  // Every change of position goes through here, so turning into or out of a detail page
  // looks the same whether the presenter, autoplay, the presenter view or a live host moved.
  const stageRef = useRef<HTMLDivElement>(null);
  const { flip, isFlipping } = useDetailFlip({ containerRef, stageRef, getZoom: reactFlow.getZoom, background: presentation.background,
    durationMs: reducedMotion ? 0 : Math.max(500, settings.cameraTransitionMs) });
  const positionRef = useRef(position);
  useEffect(() => { positionRef.current = position; }, [position]);
  const go = useCallback((next: PresentationPosition) => {
    if (isFlipping()) return;
    const from = sceneOfStop(stops, positionRef.current.index), to = sceneOfStop(stops, next.index);
    const commit = () => { positionRef.current = next; setPosition(next); };
    const opener = to ? details.boxByFrame.get(to) : undefined, closer = from ? details.boxByFrame.get(from) : undefined;
    if (to && opener && details.sceneOf(opener) === from) {
      setVisited((current) => new Set(current).add(opener));
      void flip("in", opener, commit);
    } else if (from && closer && details.sceneOf(closer) === to) void flip("out", closer, commit);
    else commit();
  }, [details, flip, isFlipping, stops]);

  // Autoplay: advance to the next stop after its effective duration elapses -- out of a
  // finished detail page too -- looping back to the start (or stopping) once the path runs out.
  useEffect(() => {
    if (!playing || !stops[index]) return;
    const duration = resolveStepDuration(stops[index].step, settings);
    const timer = setTimeout(() => {
      const next = stepPresentationPosition(elements, stops, positionRef.current, 1);
      const first = stops.findIndex((stop) => stop.sceneId === null);
      if (next.index !== positionRef.current.index) go(next);
      else if (settings.loop && first >= 0 && first !== positionRef.current.index) go({ index: first, returns: [] });
      else setPlaying(false);
    }, duration);
    return () => clearTimeout(timer);
  }, [playing, index, stops, settings, elements, go]);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (following) return;
      go(stepPresentationPosition(elements, stops, positionRef.current, delta));
    },
    [following, go, elements, stops],
  );
  const openDetail = useCallback((boxId: string) => {
    const frameId = details.frameByBox.get(boxId);
    const next = frameId ? enterPresentationDetail(stops, positionRef.current, frameId) : null;
    if (following || !next) return;
    setPlaying(false);
    go(next);
  }, [details, following, go, stops]);
  const closeDetail = useCallback(() => {
    if (following) return;
    const next = exitPresentationDetail(elements, stops, positionRef.current);
    if (next) go(next);
  }, [elements, following, go, stops]);

  // The Prezi "click anything, you're there" jump: an element that some step targets goes
  // through the normal setIndex path (status, notes, live broadcast, camera all follow); an
  // element no step targets just gets a free fly, leaving the step index untouched. A click
  // on the frame we are already looking inside is not a jump at all — see elementClickAction.
  const onElementClick = useCallback<NodeMouseHandler<PresentationNode>>(
    (event, node) => {
      if ((event.target as HTMLElement)?.closest?.("a,video,audio,summary,details")) return;
      // Never also register as the container's "click empty canvas" advance.
      event.stopPropagation();
      if (following) return;
      const target = node.data.element;
      // An element with a detail page turns over to it.
      if (details.frameByBox.has(target.id)) { suppressSnapBack.current = true; openDetail(target.id); return; }
      // Clicks resolve within the open scene: its stops, its elements.
      const local = stops.map((stop, at) => ({ stop, at })).filter(({ stop }) => stop.sceneId === scene);
      const action = elementClickAction(local.map(({ stop }) => stop.step), sceneElements, local.findIndex(({ at }) => at === index), target.id);
      // Clicking the frame that fills the screen is a click "on the slide", not on an
      // element: it advances exactly like empty canvas, which means no autoplay pause and
      // no snap-back suppression either — the container's own advance does neither.
      if (action.kind === "advance") {
        move(1);
        return;
      }
      // The pane's own onMoveEnd (populated event, same as any real gesture) still fires for
      // this same click's mouseup, and it fires AFTER this handler — @xyflow/system defers it
      // to a setTimeout(..., 0) queued during mouseup, which this same-task click handler runs
      // ahead of. Clearing snapBackTimer here would be clearing a timer that doesn't exist yet;
      // flip a flag instead, for onGestureEnd to consume whenever it does run.
      suppressSnapBack.current = true;
      setPlaying(false);
      if (action.kind === "jump") {
        const jump = local[action.index].at;
        setPosition((current) => ({ ...current, index: jump }));
        // Explicit, not left to the index-driven effect: clicking the CURRENT step's element
        // leaves index unchanged, so that effect would never re-run and the click would do
        // nothing visible.
        flyTo(jump);
        return;
      }
      fitStop(presentationCameraBounds(target), cameraDuration);
    },
    [following, details, openDetail, stops, scene, sceneElements, index, move, flyTo, cameraDuration, fitStop],
  );

  // Remote follow (polled live session); the presenter-notes window keeps its own
  // BroadcastChannel path below untouched.
  const applyRemoteStep = useCallback(
    (stepIndex: number) => { const next = clampStop(stepIndex, stops); if (next !== positionRef.current.index) go({ index: next, returns: [] }); },
    [go, stops],
  );
  const remoteLive = usePresentationFollower(follow?.code ?? null, applyRemoteStep, follow?.live);

  // Kept current without being an effect dependency, so the channel below is set up once
  // and can still answer a presenter window's "where are we" with the latest step.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const channelRef = useRef<BroadcastChannel | null>(null);

  // Presenter windows follow this player over BroadcastChannel: it broadcasts its own step
  // changes, and applies "goto" from a presenter window steering it back.
  useEffect(() => {
    if (following || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(presenterChannelName(presentation.id, presenterSession));
    channelRef.current = channel;
    channel.onmessage = (event) => {
      const message = parsePresenterMessage(event.data);
      if (!message) return;
      if (message.type === "goto") {
        setPlaying(false);
        go({ index: clampStop(message.index, stops), returns: [] });
      } else if (message.type === "request-step") {
        channel.postMessage({ type: "step", index: indexRef.current });
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [following, presentation.id, presenterSession, stops, go]);

  useEffect(() => {
    channelRef.current?.postMessage({ type: "step", index });
  }, [index]);

  // End the live session before navigating when possible. Its fixed endpoint can finish
  // after this bounded wait, so a slow connection does not trap the presenter. Browser
  // Back and closing the tab retain the session's 45s heartbeat staleness fallback.
  const stopLive = useRef<(() => Promise<void>) | null>(null);
  const exitPresent = useCallback(async () => {
    setPlaying(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    await Promise.race([
      stopLive.current?.() ?? Promise.resolve(),
      new Promise<void>((resolve) => setTimeout(resolve, LIVE_STOP_TIMEOUT_MS)),
    ]);
    router.push(`/wiki/presentations/${presentation.id}`);
  }, [presentation.id, router]);

  const openPresenterView = useCallback(() => {
    const popup = window.open(
      `/wiki/presentations/${presentation.id}/present/notes?session=${presenterSession}`,
      `presenter-${presentation.id}-${presenterSession}`,
      "width=960,height=680",
    );
    if (!popup) toast.error(t("presentations.popupBlocked"));
  }, [presentation.id, presenterSession, t]);

  // The first flight waits for a sized pane and lands instantly on the opening stop; there
  // is no fitView to race it. Later step changes animate.
  // A new scene is framed at once too: the card turn is its transition, not a camera flight.
  const firstFlight = useRef(true);
  const framedScene = useRef(scene);
  useEffect(() => {
    if (!viewportSized) return;
    const instant = firstFlight.current || framedScene.current !== scene;
    framedScene.current = scene;
    const frame = requestAnimationFrame(() => { flyTo(index, instant ? 0 : undefined); firstFlight.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [index, scene, flyTo, viewportSized]);

  // Entering fullscreen or resizing changes what "fits" means, so the current step is
  // re-framed instantly rather than left half off-screen.
  useEffect(() => {
    const reframe = () => flyTo(index, 0);
    const onFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      reframe();
    };
    window.addEventListener("resize", reframe);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("resize", reframe);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [flyTo, index]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      // Space activates a focused control; it must not also advance the presentation.
      if (event.key === " " && target?.closest("button, a, [role='button']")) return;
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Home" && !following) {
        // Followers are excluded: an overview here would stick until the presenter
        // happens to change step, since the poll only re-frames on a new step.
        event.preventDefault();
        overview();
      } else if ((event.key === "Escape" || event.key === "Backspace") && scene !== null && !following) {
        // Escape leaves the open detail page first; only on the overview does it end the show.
        event.preventDefault();
        closeDetail();
      } else if (event.key === "Escape" && !document.fullscreenElement) {
        // A follower has no business in the editor -- they were handed a code, not the
        // presentation. Send them back to the join screen, same as the badge's exit link,
        // and with no stop: the session is the presenter's, not theirs.
        if (following) router.push("/wiki/presentations/follow");
        else void exitPresent();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitPresent, following, move, overview, router, scene, closeDetail]);

  // Its own listener, kept separate from the step-navigation one above: zoom is
  // presenter-local camera state, unrelated to whichever step index is currently shown.
  useEffect(() => {
    const onZoomKeyDown = (event: KeyboardEvent) => {
      if (following || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!["+", "=", "-", "_"].includes(event.key)) return;
      event.preventDefault();
      const zooming = event.key === "-" || event.key === "_" ? reactFlow.zoomOut : reactFlow.zoomIn;
      void zooming({ duration: 150 });
      scheduleSnapBack();
    };
    window.addEventListener("keydown", onZoomKeyDown);
    return () => window.removeEventListener("keydown", onZoomKeyDown);
  }, [following, reactFlow, scheduleSnapBack]);

  // Spotlight/laser-pointer overlay: a presenter toggle, purely cosmetic. The pointer
  // position is written straight to the overlay's own CSS variables instead of React state
  // so mouse movement never triggers a render.
  const [spotlight, setSpotlight] = useState(false);
  const spotlightRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!spotlight) return;
    const onPointerMove = (event: PointerEvent) => {
      spotlightRef.current?.style.setProperty("--spotlight-x", `${event.clientX}px`);
      spotlightRef.current?.style.setProperty("--spotlight-y", `${event.clientY}px`);
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [spotlight]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (containerRef.current?.requestFullscreen) await containerRef.current.requestFullscreen();
      else toast.error(t("presentations.fullscreenUnavailable"));
    } catch {
      toast.error(t("presentations.fullscreenUnavailable"));
    }
  }, [t]);

  const scenePosition = presentationScenePosition(stops, index);
  const sceneFrame = scene ? elements.find((element) => element.id === scene) : undefined;
  const sceneCaption = (sceneFrame && presentationElementCaption(sceneFrame)) || t("presentations.details.group");
  return (
    <div
      ref={containerRef}
      data-scene={scene ?? "overview"}
      data-testid="presentation-player"
      // Covers the wiki rail and the app chrome: presenting owns the whole viewport.
      className="fixed inset-0 z-50 bg-background"
      style={presentation.background ? { backgroundColor: presentation.background } : undefined}
    >
      <div ref={stageRef} className="absolute inset-0" data-testid="presentation-stage" data-scene={scene ?? "overview"}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={presentationNodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        // With stops the opening camera is stop 1 (see the first flight above).
        fitView={!steps.length}
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.02}
        maxZoom={8}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        // Nodes stay unselectable/undraggable above; passing onNodeClick alone is what makes
        // them clickable at all (ReactFlow otherwise sets pointer-events: none on them).
        onNodeClick={onElementClick}
        onPaneClick={() => move(1)}
        // Free camera while presenting: drag to pan, wheel/pinch to zoom, both bounded by
        // minZoom/maxZoom above. onMoveStart/onMoveEnd arm the snap-back defined earlier —
        // ReactFlow itself already tells apart a real gesture from our own flyTo calls.
        panOnDrag={!following}
        panOnScroll={false}
        zoomOnScroll={!following}
        zoomOnPinch={!following}
        zoomOnDoubleClick={false}
        onMoveStart={onGestureStart}
        onMoveEnd={onGestureEnd}
        preventScrolling
        proOptions={{ hideAttribution: false }}
      >
        <PresentationDetailBadges elements={sceneElements} frameByBox={details.frameByBox} visited={visited} hiddenIds={hiddenIds}
          onOpen={following ? undefined : openDetail}
          openLabel={(box) => t(visited.has(box.id) ? "presentations.details.visitedNamed" : "presentations.details.openNamed", { name: presentationElementCaption(box) || t("presentations.details.group") })} />
      </ReactFlow>
      </div>

      {spotlight && (
        <div
          ref={spotlightRef}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40"
          style={{
            background:
              "radial-gradient(circle 180px at var(--spotlight-x, 50%) var(--spotlight-y, 50%), transparent 0%, transparent 55%, rgb(0 0 0 / 0.55) 100%)",
          }}
        >
          <div
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_14px_4px_rgba(239,68,68,0.85)]"
            style={{ left: "var(--spotlight-x, 50%)", top: "var(--spotlight-y, 50%)" }}
          />
        </div>
      )}

      {playing && stops[index] && (
        // Progress hint for the running step: a bar that fills over its effective duration.
        <div className="absolute inset-x-0 top-0 z-10 h-1 bg-foreground/10">
          <div
            key={`${index}-${playing}`}
            className="h-full origin-left bg-indigo-500"
            style={{ animation: `presentation-step-progress ${resolveStepDuration(stops[index].step, settings)}ms linear forwards` }}
          />
        </div>
      )}

      {following && <PresentationFollowBadge live={remoteLive} hostName={follow?.hostName ?? ""} hostUserId={follow?.hostUserId ?? null} />}

      {/* The strip spans the whole viewport width, so it must stay transparent to pointers:
          only the pill itself is a control, and only the pill may swallow a canvas click. */}
      {!following && (
      <div ref={controlsRef} data-testid="presentation-controls" className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-4">
        <div
          className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border bg-background/90 px-2 py-1 shadow-sm backdrop-blur sm:rounded-full"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={playing ? t("presentations.pause") : t("presentations.play")}
            disabled={!stops.length}
            onClick={() => {
              const first = stops.findIndex((stop) => stop.sceneId === null);
              if (!playing && scene === null && scenePosition.current >= scenePosition.total && first >= 0) go({ index: first, returns: [] });
              setPlaying((current) => !current);
            }}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          {scene !== null && <Button type="button" variant="ghost" size="sm" data-testid="presentation-detail-back" aria-label={t("presentations.details.back")} title={`${t("presentations.details.back")} (Esc)`} onClick={closeDetail}>
            <CornerLeftUp className="size-4" /><span className="max-w-32 truncate text-xs">{sceneCaption}</span>
          </Button>}
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.previousStep")} disabled={scene === null && scenePosition.current <= 1} onClick={() => move(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center text-xs tabular-nums" role="status" aria-live="polite">
            {scenePosition.total ? `${scenePosition.current} / ${scenePosition.total}` : t("presentations.noSteps")}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.nextStep")} disabled={scene === null && scenePosition.current >= scenePosition.total} onClick={() => move(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.overview")} onClick={() => overview()}>
            <Scan className="size-4" />
          </Button>
          <Button
            type="button"
            variant={spotlight ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label={t("presentations.spotlight")}
            aria-pressed={spotlight}
            onClick={() => setSpotlight((current) => !current)}
          >
            <Spotlight className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.fullscreen")} aria-pressed={fullscreen} onClick={() => void toggleFullscreen()}>
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </Button>
          {(presentation.role === "owner" || presentation.role === "edit") && <>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.openPresenterView")} onClick={openPresenterView}>
            <NotebookText className="size-4" />
          </Button>
          <PresentationLiveControl presentationId={presentation.id} stepIndex={Math.max(index, 0)} stopRef={stopLive} />
          </>}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("presentations.exitPresent")}
            onClick={() => void exitPresent()}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}

/** A stop index from outside (a live host, the presenter view), kept inside the path. */
function clampStop(index: number, stops: PresentationStop[]): number {
  return Math.min(Math.max(index, 0), Math.max(stops.length - 1, 0));
}

/** The camera stop at or before `index` within its scene; fade steps keep the camera where it was. */
function cameraStop(stops: PresentationStop[], index: number) {
  const scene = sceneOfStop(stops, index);
  for (let at = index; at >= 0; at--) {
    const stop = stops[at];
    if (stop?.sceneId === scene && (!stop.step.action || stop.step.action === "camera")) return stop.step;
  }
  // A detail page that opens on a fade still shows the page itself.
  return scene ? { id: `detail:${scene}`, elementId: scene } : undefined;
}

export function PresentationPlayer({
  presentation,
  follow,
}: {
  presentation: PresentationRecord;
  follow?: FollowSource;
}) {
  return (
    <ReactFlowProvider>
      <Player presentation={presentation} follow={follow} />
    </ReactFlowProvider>
  );
}
