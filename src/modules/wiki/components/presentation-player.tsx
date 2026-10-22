"use client";
import { clientUUID } from "@/lib/client-uuid";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ReactFlow, ReactFlowProvider, getViewportForBounds, useReactFlow, useStore, useStoreApi, type NodeMouseHandler } from "@xyflow/react";
import { toast } from "sonner";
import {
  PRESENTATION_CAMERA_PADDING,
  presentationCameraBounds,
  unionBounds,
  presentationAncestors,
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
  presentationStopDetail,
  presentationStopBounds,
  sceneOfStop,
  stepPresentationPosition,
  type PresentationBounds,
  type PresentationPosition,
  type PresentationStop,
} from "../lib/presentation";
import { PRESENTATION_DARK_INK, inkOn, presentationSurface } from "../lib/presentation-ink";
import { useDetailFlip } from "./presentation-player/use-detail-flip";
import { parsePresenterMessage, presenterChannelName } from "../lib/presenter";
import type { PresentationRecord } from "../presentation-queries";
import { elementsToNodes, presentationNodeTypes, type PresentationNode } from "./presentation-canvas";
import { PresentationFollowBadge, usePresentationFollower } from "./presentation-live";
import { PresentationDocumentTitle } from "./presentation-editor/presentation-document-title";
import { PlayerControls } from "./presentation-player/player-controls";
import { BlankScreenOverlay, SpotlightOverlay, StopNumberBadge, type BlankScreen } from "./presentation-player/player-overlays";
import { useIdle } from "./presentation-player/use-idle";
import { usePlayerKeys } from "./presentation-player/use-player-keys";
import { usePlayerFocus } from "./presentation-player/use-player-focus";
import { usePlayerLocation } from "./presentation-player/use-player-location";
import { usePlayerContextMenu } from "./presentation-player/use-player-context-menu";

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

// How long the mouse rests before the controls and the cursor leave the audience's view.
const IDLE_HIDE_MS = 2_500;

function Player({ presentation, follow, startStepId }: { presentation: PresentationRecord; follow?: FollowSource; startStepId?: string }) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const reactFlow = useReactFlow<PresentationNode>();
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const viewportSized = useStore((state) => state.width > 0 && state.height > 0);
  const { steps, settings } = presentation;
  const surface = presentationSurface(presentation.background);
  const elements = presentation.elements;
  // Stops are the steps plus one for each detail page without its own; the player walks
  // the stops of the open scene and remembers where each open detail page was entered from.
  const stops = useMemo(() => presentationStops(elements, steps), [elements, steps]);
  const details = presentationDetails(elements);
  const openerIds = useMemo(() => new Set(details.frameByBox.keys()), [details]);
  const { position, setPosition, freeMode, canvasView, canvasViewRef, showCanvas, showStop } = usePlayerLocation(elements, stops, startStepId, follow, settings.startMode);
  const index = position.index;
  const positionRef = useRef(position);
  useEffect(() => { positionRef.current = position; }, [position]);

  const scene = sceneOfStop(stops, index);
  const { elementId: focusedElementId, getFocused, push: pushFocus, pop: popFocus, clear: clearFocus } = usePlayerFocus(scene);
  const sceneElements = useMemo(() => presentationSceneElements(elements, scene), [elements, scene]);
  /** The stop a detail page turn landed on: its elements are already there, so they do not fade in again. */
  const [quietIndex, setQuietIndex] = useState<number | null>(null);
  const [presenterSession] = useState(() => clientUUID());
  const [systemReducedMotion, setReducedMotion] = useState(false);
  // The presenter's deck animates unless its settings defer to the system; a follower's own
  // device setting always wins, since that is the person who asked for less motion.
  const reducedMotion = systemReducedMotion && (Boolean(follow) || settings.motion === "system");
  const [fullscreen, setFullscreen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const heldView = useRef(false);

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
    if (quietIndex === index) return new Set<string>();
    const step = stops[index]?.step;
    const target = step ? stepTarget(step, sceneElements) : null;
    return target ? new Set(elementsWithinStep(target, sceneElements).map((element) => element.id)) : new Set<string>();
  }, [index, quietIndex, stops, sceneElements]);

  const hiddenIds = useMemo(() => presentationHiddenIds(elements, steps, stops[index]?.stepIndex ?? -1), [elements, steps, stops, index]);
  const animationMs = reducedMotion ? 0 : stops[index]?.step.animationMs ?? 300;
  const nodes = useMemo(() => elementsToNodes(sceneElements, { editable: false, enteringIds: reducedMotion ? undefined : enteringIds, hiddenIds, animationMs, background: surface, openerIds: follow ? undefined : openerIds }), [surface, sceneElements, enteringIds, hiddenIds, animationMs, reducedMotion, follow, openerIds]);

  /** Fits a stop with the usual padding, plus the control bar's height at the bottom so the
   * bar never covers it. */
  const store = useStoreApi<PresentationNode>();
  const fitStop = useCallback((bounds: PresentationBounds, duration: number, fill = false) => {
    const { width, height, minZoom, maxZoom } = store.getState();
    // `fill`: the element nearly fills the screen, the moment before a detail page turns over.
    const share = fill ? 0.04 : PRESENTATION_CAMERA_PADDING;
    const inset = Math.floor((height - height / (1 + share)) / 2);
    const padding = { x: share, top: `${inset}px`, bottom: `${inset + (fill ? 0 : controlsRef.current?.offsetHeight ?? 0)}px` } as const;
    return reactFlow.setViewport(getViewportForBounds(bounds, width, height, minZoom, maxZoom, padding), { duration, ease: cameraEase });
  }, [store, reactFlow, cameraEase]);

  // Work from the actual scene model, rather than transient React Flow node measurements.
  // Storage-band/orphan objects can make a valid scene much larger than the usual 2% zoom
  // limit; fitting below it keeps both ends visible instead of pushing the deck off-screen.
  const overview = useCallback((duration = cameraDuration) => {
    const current = positionRef.current.index;
    const visible = presentationSceneElements(elements, sceneOfStop(stops, current));
    const hidden = presentationHiddenIds(elements, steps, stops[current]?.stepIndex ?? -1);
    const bounds = unionBounds(visible.filter(element => !hidden.has(element.id)).map(presentationCameraBounds));
    return bounds ? fitStop(bounds, duration) : Promise.resolve(false);
  }, [elements, steps, stops, fitStop, cameraDuration]);

  /**
   * Every step is framed by fitting its element's bounds, so a small frame nested inside
   * a large one zooms all the way in — the camera never inherits the previous scale. A fade
   * that reveals something outside that view widens it, rather than happening off-screen.
   */
  const flyTo = useCallback(
    (stepIndex: number, duration = cameraDuration) => {
      const bounds = presentationStopBounds(elements, stops, stepIndex);
      if (!bounds) return overview(duration);
      return fitStop(bounds, duration);
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
    if (freeMode) return;
    snapBackTimer.current = setTimeout(() => {
      const id = getFocused(scene);
      const target = elements.find(element => element.id === id);
      if (target) void fitStop(presentationCameraBounds(target), cameraDuration);
      else void flyTo(index);
    }, GESTURE_SNAP_BACK_MS);
  }, [clearSnapBack, flyTo, index, getFocused, scene, elements, fitStop, cameraDuration, freeMode]);
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
  const focusElement = useCallback((id: string, duration: number) => {
    const element = elements.find((candidate) => candidate.id === id);
    return element ? fitStop(presentationCameraBounds(element), duration, true) : Promise.resolve(false);
  }, [elements, fitStop]);
  const frameCurrent = useCallback((duration: number) => {
    if (canvasViewRef.current) return overview(duration);
    const current = positionRef.current.index;
    const target = elements.find(element => element.id === getFocused(sceneOfStop(stops, current)));
    return target ? fitStop(presentationCameraBounds(target), duration) : flyTo(current, duration);
  }, [elements, getFocused, stops, fitStop, flyTo, canvasViewRef, overview]);
  // The stop whose camera has landed: a stop's autoplay time and progress bar start there, so
  // a long flight or card turn never eats into what the audience gets to see.
  const [arrivedAt, setArrivedAt] = useState<number | null>(null);
  const land = useCallback((flight: Promise<unknown>, duration: number, at: number) => {
    // An interrupted flight may never settle; the camera is there by then anyway.
    void Promise.race([flight, new Promise((resolve) => setTimeout(resolve, duration + 250))]).then(() => setArrivedAt(at));
  }, []);
  const { flip, isFlipping } = useDetailFlip({ containerRef, stageRef, surface, backdrop: inkOn(surface) === PRESENTATION_DARK_INK ? "#c3cad4" : "#020306",
    durationMs: reducedMotion ? 0 : Math.max(600, settings.cameraTransitionMs), focusElement, frameCurrent });
  /** False when a card turn is still running: the move is dropped and the caller decides what then. */
  const go = useCallback((next: PresentationPosition, preserveFocus = false) => {
    if (isFlipping()) return false;
    const from = sceneOfStop(stops, positionRef.current.index), to = sceneOfStop(stops, next.index);
    if (!preserveFocus) clearFocus(to);
    const commit = () => {
      if (freeMode && (preserveFocus || to !== from) && !getFocused(to)) showCanvas(); else showStop();
      positionRef.current = next; setPosition(next); setQuietIndex(to !== from ? next.index : null);
    };
    const opener = to ? details.boxByFrame.get(to) : undefined, closer = from ? details.boxByFrame.get(from) : undefined;
    const landed = () => setArrivedAt(positionRef.current.index);
    if (to && opener && details.sceneOf(opener) === from) void flip("in", opener, commit).then(landed);
    else if (from && closer && details.sceneOf(closer) === to) void flip("out", closer, commit).then(landed);
    else commit();
    return true;
  }, [details, flip, isFlipping, stops, clearFocus, setPosition, freeMode, getFocused, showCanvas, showStop]);

  // Autoplay: advance to the next stop after its effective duration elapses -- out of a
  // finished detail page too -- looping back to the start (or stopping) once the path runs out.
  // A card turn outlasts its scene switch (and a short stop), so a tick that lands during one
  // waits for it instead: go() would drop the move and nothing would ever re-arm the timer.
  useEffect(() => {
    if (!playing || !stops[index] || arrivedAt !== index) return;
    const duration = resolveStepDuration(stops[index].step, settings);
    let timer: ReturnType<typeof setTimeout>;
    const advance = () => {
      if (isFlipping()) { timer = setTimeout(advance, 100); return; }
      const next = stepPresentationPosition(elements, stops, positionRef.current, 1);
      const first = stops.findIndex((stop) => stop.sceneId === null);
      if (next.index !== positionRef.current.index) go(next);
      else if (settings.loop && first >= 0 && first !== positionRef.current.index) go({ index: first, returns: [] });
      else setPlaying(false);
    };
    timer = setTimeout(advance, duration);
    return () => clearTimeout(timer);
  }, [playing, index, arrivedAt, stops, settings, elements, go, isFlipping]);

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
    if (next) go(next, true);
  }, [elements, following, go, stops]);

  // Pointer navigation has explicit stages: focus a form, then flip its detail canvas.
  // Form layers representing an opener resolve to that opener; unlisted forms work too.
  const onElementClick = useCallback<NodeMouseHandler<PresentationNode>>(
    (event, node) => {
      if ((event.target as HTMLElement)?.closest?.("a,video,audio,summary,details")) return;
      event.stopPropagation();
      if (following || isFlipping()) return;
      const local = stops.map((stop, at) => ({ stop, at })).filter(({ stop }) => stop.sceneId === scene);
      const action = elementClickAction(local.map(({ stop }) => stop.step), sceneElements, local.findIndex(({ at }) => at === index), node.id, details.frameByBox);
      const id = action.kind === "open" ? action.boxId
        : action.kind === "jump" ? local[action.index].stop.step.elementId : node.id;
      clearSnapBack();
      suppressSnapBack.current = true;
      setPlaying(false);
      heldView.current = false;
      showStop();
      if (getFocused(scene) === id) {
        if (details.frameByBox.has(id)) openDetail(id);
        return;
      }
      pushFocus(scene, id, positionRef.current, presentationAncestors(elements, id).map(element => element.id));
      const stop = local.find(({ stop }) => stop.step.elementId === id && (!stop.step.action || stop.step.action === "camera"));
      if (stop) {
        const next = { ...positionRef.current, index: stop.at };
        positionRef.current = next;
        setPosition(next);
      }
    },
    [following, isFlipping, stops, scene, sceneElements, index, details, clearSnapBack, getFocused, pushFocus, openDetail, elements, setPosition, showStop],
  );

  // Remote follow (polled live session); the presenter-notes window keeps its own
  // BroadcastChannel path below untouched.
  const applyRemoteStep = useCallback(
    (stepIndex: number) => { const next = clampStop(stepIndex, stops); if (next !== positionRef.current.index) go({ index: next, returns: [] }); },
    [go, stops],
  );
  const remoteLive = usePresentationFollower(follow?.code ?? null, applyRemoteStep, follow?.live);

  const channelRef = useRef<BroadcastChannel | null>(null);

  // Presenter windows follow this player over BroadcastChannel: it broadcasts its own step
  // changes -- with the detail pages to come back out of, so the presenter view walks the
  // same path -- and applies "goto" from a presenter window steering it.
  useEffect(() => {
    if (following || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(presenterChannelName(presentation.id, presenterSession));
    channelRef.current = channel;
    const announce = () => channel.postMessage({ type: "step", index: positionRef.current.index, returns: positionRef.current.returns });
    channel.onmessage = (event) => {
      const message = parsePresenterMessage(event.data);
      if (!message) return;
      if (message.type === "goto") {
        setPlaying(false);
        // A move dropped during a card turn would leave the presenter view a stop ahead.
        if (!go({ index: clampStop(message.index, stops), returns: (message.returns ?? []).map((at) => clampStop(at, stops)) })) announce();
      } else if (message.type === "request-step") {
        announce();
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [following, presentation.id, presenterSession, stops, go]);

  useEffect(() => {
    channelRef.current?.postMessage({ type: "step", index: position.index, returns: position.returns });
  }, [position]);

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
    // A detail page turn frames the scenes itself, in step with the card.
    if (isFlipping()) return;
    const duration = instant ? 0 : cameraDuration;
    const frame = requestAnimationFrame(() => { land(frameCurrent(duration), duration, index); firstFlight.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [index, scene, focusedElementId, canvasView, frameCurrent, viewportSized, isFlipping, land, cameraDuration]);

  // Entering fullscreen or resizing changes what "fits" means, so the current step is
  // re-framed instantly rather than left half off-screen.
  useEffect(() => {
    const reframe = () => frameCurrent(0);
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
  }, [frameCurrent, index, focusedElementId]);

  // A view the presenter asked for -- the overview, a keyboard zoom -- stays until the next
  // stop or Escape, unlike a drag or pinch, which snaps back once let go.
  useEffect(() => { heldView.current = false; }, [index]);
  const holdView = useCallback(() => { clearSnapBack(); heldView.current = true; }, [clearSnapBack]);
  const restoreView = useCallback(() => {
    if (isFlipping()) return true;
    if (heldView.current) {
      heldView.current = false;
      showStop();
      void frameCurrent(cameraDuration);
      return true;
    }
    const previous = popFocus(sceneOfStop(stops, positionRef.current.index));
    if (!previous) return false;
    clearSnapBack();
    go(previous, true);
    return true;
  }, [isFlipping, frameCurrent, cameraDuration, popFocus, stops, clearSnapBack, go, showStop]);

  const showOverview = useCallback(() => {
    clearSnapBack();
    heldView.current = !freeMode;
    setPlaying(false);
    clearFocus(sceneOfStop(stops, positionRef.current.index));
    showCanvas();
    void overview();
  }, [clearSnapBack, freeMode, clearFocus, stops, showCanvas, overview]);

  const onContextMenu = usePlayerContextMenu({
    disabled: following, isFlipping,
    prepare: () => { clearSnapBack(); suppressSnapBack.current = true; setPlaying(false); },
    back: () => { if (!restoreView()) closeDetail(); },
    overview: () => { showOverview(); heldView.current = false; },
  });

  // PowerPoint's B and W. Autoplay waits behind a blank screen, and moving on lifts it.
  const [blank, setBlankState] = useState<BlankScreen>(null);
  const setBlank = useCallback((screen: BlankScreen) => { setBlankState(screen); if (screen) setPlaying(false); }, []);
  const [blankedAt, setBlankedAt] = useState(index);
  if (blankedAt !== index) { setBlankedAt(index); setBlankState(null); }

  const jumpTo = useCallback((number: number) => {
    const local = stops.map((stop, at) => ({ stop, at })).filter(({ stop }) => stop.sceneId === sceneOfStop(stops, positionRef.current.index));
    const target = local[number - 1];
    if (!target) return false;
    setPlaying(false);
    return go({ index: target.at, returns: positionRef.current.returns });
  }, [go, stops]);

  const stopNumber = usePlayerKeys({
    following, inDetail: scene !== null, blank, move, setBlank, jumpTo, restoreView, closeDetail,
    overview: showOverview,
    zoom: (direction) => { holdView(); void (direction === "in" ? reactFlow.zoomIn : reactFlow.zoomOut)({ duration: 150 }); },
    openCurrentDetail: () => {
      const frameId = presentationStopDetail(elements, stops, positionRef.current.index);
      const box = frameId ? details.boxByFrame.get(frameId) : undefined;
      if (box) openDetail(box);
      return Boolean(box);
    },
    exit: () => void exitPresent(),
  });

  // Spotlight/laser pointer: a presenter toggle, purely cosmetic (see SpotlightOverlay).
  const [spotlight, setSpotlight] = useState(false);
  // The controls and the cursor leave the audience's view while the mouse rests.
  const idle = useIdle(IDLE_HIDE_MS, !following);

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
  const progressing = playing && stops[index] && arrivedAt === index;
  return (
    <div
      ref={containerRef}
      data-scene={scene ?? "overview"}
      data-focused-element={focusedElementId ?? undefined}
      onContextMenu={onContextMenu}
      data-mode={freeMode ? "free" : "path"}
      data-view={canvasView ? "canvas" : "stop"}
      data-testid="presentation-player"
      data-idle={idle || undefined}
      // Covers the wiki rail and the app chrome: presenting owns the whole viewport. A resting
      // mouse, or the laser pointer's own dot, hides the system cursor.
      className={`fixed inset-0 z-50 bg-background ${idle || spotlight ? "cursor-none [&_*]:cursor-none!" : ""}`}
      // Depth for the detail page turn, which rotates the stage below in 3D.
      style={{ backgroundColor: surface, perspective: "2200px" }}
    >
      <PresentationDocumentTitle title={presentation.title} />
      <div ref={stageRef} className="absolute inset-0" data-testid="presentation-stage" data-scene={scene ?? "overview"}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={presentationNodeTypes}
        // The deck's own surface decides, not the app theme: a talk looks the same on any laptop.
        colorMode={inkOn(surface) === PRESENTATION_DARK_INK ? "light" : "dark"}
        style={{ backgroundColor: surface }}
        // With stops the opening camera is stop 1 (see the first flight above).
        fitView={false}
        minZoom={0.000001}
        maxZoom={8}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        // Nodes stay unselectable/undraggable above; passing onNodeClick alone is what makes
        // them clickable at all (ReactFlow otherwise sets pointer-events: none on them).
        onNodeClick={onElementClick}
        onPaneClick={() => { if (!freeMode) move(1); }}
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
        // The audience sees the deck, not the library drawing it (the editor keeps the credit).
        proOptions={{ hideAttribution: true }}
      />
      </div>

      {spotlight && <SpotlightOverlay />}
      <BlankScreenOverlay screen={blank} />
      <StopNumberBadge digits={stopNumber} />

      {progressing && (
        // Progress hint for the running step: a bar that fills over its effective duration,
        // from the moment the camera has landed.
        <div className="absolute inset-x-0 top-0 z-10 h-1 bg-foreground/10">
          <div
            key={`${index}-${playing}`}
            className="h-full origin-left bg-indigo-500"
            style={{ animation: `presentation-step-progress ${resolveStepDuration(stops[index].step, settings)}ms linear forwards` }}
          />
        </div>
      )}

      {/* A follower has no control bar; the badge takes its place, and its height is kept
          clear of the slide the same way. */}
      {following && <PresentationFollowBadge ref={controlsRef} live={remoteLive} hostName={follow?.hostName ?? ""} hostUserId={follow?.hostUserId ?? null} />}

      {!following && <PlayerControls
        controlsRef={controlsRef}
        hidden={idle}
        playing={playing}
        canPlay={stops.length > 0}
        onPlay={() => {
          if (!playing) showStop();
          const first = stops.findIndex((stop) => stop.sceneId === null);
          if (!playing && scene === null && scenePosition.current >= scenePosition.total && first >= 0) go({ index: first, returns: [] });
          setPlaying((current) => !current);
        }}
        sceneCaption={scene !== null ? sceneCaption : null}
        onCloseDetail={closeDetail}
        position={scenePosition}
        canPrevious={scene !== null || scenePosition.current > 1}
        canNext={scene !== null || scenePosition.current < scenePosition.total}
        onMove={move}
        onOverview={showOverview}
        spotlight={spotlight}
        onSpotlight={() => setSpotlight((current) => !current)}
        fullscreen={fullscreen}
        onFullscreen={() => void toggleFullscreen()}
        presenterTools={presentation.role === "owner" || presentation.role === "edit"
          ? { presentationId: presentation.id, stepIndex: Math.max(index, 0), stopLive, onOpenPresenterView: openPresenterView } : null}
        onExit={() => void exitPresent()}
      />}
    </div>
  );
}

/** A stop index from outside (a live host, the presenter view), kept inside the path. */
function clampStop(index: number, stops: PresentationStop[]): number {
  return Math.min(Math.max(index, 0), Math.max(stops.length - 1, 0));
}

export function PresentationPlayer({
  presentation,
  follow,
  startStepId,
}: {
  presentation: PresentationRecord;
  follow?: FollowSource;
  /** The stop to open on, for "from current stop"; the first stop otherwise. */
  startStepId?: string;
}) {
  return (
    <ReactFlowProvider>
      <Player presentation={presentation} follow={follow} startStepId={startStepId} />
    </ReactFlowProvider>
  );
}
