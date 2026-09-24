// Timeline viewport of the portfolio Gantt: day width/zoom (incl. ctrl/cmd-wheel zoom around
// the pointer), work-breakdown width, viewport measurement and click-drag panning. Used by portfolio-client.tsx.
"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  HEADER_HEIGHT,
  LEFT_WIDTH,
  MAX_DAY_WIDTH,
  MIN_DAY_WIDTH,
  ZOOM_WHEEL_SENSITIVITY,
  ZOOM_WIDTH,
} from "./portfolio-constants";
import type { EmbeddedProjectPlanner, SetState, Zoom } from "./portfolio-types";
import { zoomModeForDayWidth } from "./portfolio-utils";

export function useTimelineViewport({
  view,
  focusedTaskId,
  embedded,
  dayWidthRef,
  cancelDependencyEditor,
  setDependencySourceId,
  setDependencyHoverId,
}: {
  view: "timeline" | "projects";
  focusedTaskId: string | null;
  embedded?: EmbeddedProjectPlanner;
  dayWidthRef: RefObject<number>;
  cancelDependencyEditor: () => void;
  setDependencySourceId: SetState<string | null>;
  setDependencyHoverId: SetState<string | null>;
}) {
  const [zoom, setZoom] = useState<Zoom>("month");
  const [dayWidth, setDayWidth] = useState(ZOOM_WIDTH.month);
  const [preferredTreeWidth, setTreeWidth] = useState(LEFT_WIDTH);
  const [ganttViewportWidth, setGanttViewportWidth] = useState(0);
  const treeWidth = embedded && ganttViewportWidth > 0 && ganttViewportWidth < 600
    ? Math.min(preferredTreeWidth, Math.max(140, Math.floor(ganttViewportWidth * 0.60)))
    : preferredTreeWidth;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewPanning, setViewPanning] = useState(false);
  const viewPan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const suppressPanClick = useRef(false);
  const zoomAnimation = useRef<{ frame: number; target: number; anchorDay: number; pointerX: number; lastTime: number } | null>(null);
  const zoomScrollLeft = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (zoomScrollLeft.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, zoomScrollLeft.current);
      zoomScrollLeft.current = null;
    }
  }, [dayWidth]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const cancel = () => {
      if (zoomAnimation.current) cancelAnimationFrame(zoomAnimation.current.frame);
      zoomAnimation.current = null;
    };
    const tick = (time: number) => {
      const animation = zoomAnimation.current;
      if (!animation) return;
      const elapsed = Math.min(64, time - animation.lastTime);
      animation.lastTime = time;
      const current = dayWidthRef.current;
      const next = Math.abs(animation.target - current) < 0.005
        ? animation.target : current + (animation.target - current) * (1 - Math.exp(-elapsed / 65));
      dayWidthRef.current = next;
      zoomScrollLeft.current = treeWidth + animation.anchorDay * next - animation.pointerX;
      setDayWidth(next);
      setZoom(zoomModeForDayWidth(next));
      if (next === animation.target) zoomAnimation.current = null;
      else animation.frame = requestAnimationFrame(tick);
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const pointerX = Math.max(treeWidth, event.clientX - container.getBoundingClientRect().left);
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      const previous = zoomAnimation.current;
      const target = Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH,
        (previous?.target ?? dayWidthRef.current) * Math.exp(-delta * ZOOM_WHEEL_SENSITIVITY)));
      const anchorDay = (container.scrollLeft + pointerX - treeWidth) / dayWidthRef.current;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        cancel();
        dayWidthRef.current = target;
        zoomScrollLeft.current = treeWidth + anchorDay * target - pointerX;
        setDayWidth(target);
        setZoom(zoomModeForDayWidth(target));
        return;
      }
      if (previous) Object.assign(previous, { target, anchorDay, pointerX });
      else zoomAnimation.current = { target, anchorDay, pointerX, lastTime: performance.now(), frame: requestAnimationFrame(tick) };
    };
    container.addEventListener("wheel", wheel, { passive: false });
    return () => { container.removeEventListener("wheel", wheel); cancel(); };
  }, [view, focusedTaskId, treeWidth, dayWidthRef]);
  const treeResizeRef = useRef<{ pointerId: number; startX: number; width: number } | null>(null);

  useEffect(() => {
    if (view !== "timeline") return;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const updateViewportWidth = () => {
      setGanttViewportWidth(scrollContainer.clientWidth);
    };
    updateViewportWidth();
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(scrollContainer);
    return () => observer.disconnect();
  }, [view, focusedTaskId]);

  function beginViewPan(event: ReactPointerEvent<HTMLDivElement>) {
    suppressPanClick.current = false;
    if (event.button !== 0 || event.pointerType === "touch") return;
    const container = event.currentTarget;
    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (x < treeWidth || y < HEADER_HEIGHT || x >= container.clientWidth || y >= container.clientHeight) return;
    if ((event.target as Element).closest('button, a, input, select, textarea, [role="button"], [role="slider"], [role="separator"], [data-task-bar], [data-structure-row]')) return;
    event.preventDefault();
    container.focus({ preventScroll: true });
    cancelDependencyEditor();
    setDependencySourceId(null);
    setDependencyHoverId(null);
    if (zoomAnimation.current) cancelAnimationFrame(zoomAnimation.current.frame);
    zoomAnimation.current = null;
    viewPan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop };
    container.setPointerCapture(event.pointerId);
  }

  function moveViewPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = viewPan.current;
    if (!pan || event.pointerId !== pan.pointerId) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!suppressPanClick.current && Math.hypot(dx, dy) < 4) return;
    suppressPanClick.current = true;
    setViewPanning(true);
    event.currentTarget.scrollLeft = pan.left - dx;
    event.currentTarget.scrollTop = pan.top - dy;
  }

  function endViewPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!viewPan.current || event.pointerId !== viewPan.current.pointerId) return;
    viewPan.current = null;
    setViewPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handlePanClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressPanClick.current) return;
    suppressPanClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function setTimelineDayWidth(nextDayWidth: number) {
    if (zoomAnimation.current) cancelAnimationFrame(zoomAnimation.current.frame);
    zoomAnimation.current = null;
    zoomScrollLeft.current = null;
    const clamped = Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, nextDayWidth));
    dayWidthRef.current = clamped;
    setDayWidth(clamped);
    setZoom(zoomModeForDayWidth(clamped));
  }

  function setTimelineZoom(nextZoom: Zoom) {
    setTimelineDayWidth(ZOOM_WIDTH[nextZoom]);
  }

  return {
    zoom, setZoom, dayWidth, setDayWidth, treeWidth, setTreeWidth, ganttViewportWidth, scrollRef,
    treeResizeRef, viewPanning, beginViewPan, moveViewPan, endViewPan, handlePanClickCapture,
    setTimelineDayWidth, setTimelineZoom,
  };
}
