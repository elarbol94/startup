// Width of the docked schedule inspector: pointer/keyboard resizing, persisted in localStorage.
// Used by portfolio-client.tsx.
"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export function useInspectorDockWidth() {
  const [inspectorWidth, setInspectorWidth] = useState(360);
  const inspectorResizeRef = useRef<{
    pointerId: number;
    startX: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = Number(window.localStorage.getItem("projects.inspectorWidth"));
      if (Number.isFinite(saved) && saved >= 320 && saved <= 520) {
        setInspectorWidth(saved);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function moveInspectorResize(event: PointerEvent) {
      const resize = inspectorResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      setInspectorWidth(
        Math.min(520, Math.max(320, resize.width + resize.startX - event.clientX)),
      );
    }
    function finishInspectorResize(event: PointerEvent) {
      const resize = inspectorResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      inspectorResizeRef.current = null;
      setInspectorWidth((width) => {
        window.localStorage.setItem("projects.inspectorWidth", String(width));
        return width;
      });
    }
    window.addEventListener("pointermove", moveInspectorResize);
    window.addEventListener("pointerup", finishInspectorResize);
    window.addEventListener("pointercancel", finishInspectorResize);
    return () => {
      window.removeEventListener("pointermove", moveInspectorResize);
      window.removeEventListener("pointerup", finishInspectorResize);
      window.removeEventListener("pointercancel", finishInspectorResize);
    };
  }, []);

  function onDockResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    inspectorResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      width: inspectorWidth,
    };
  }

  function onDockResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = Math.min(
      520,
      Math.max(
        320,
        inspectorWidth + (event.key === "ArrowLeft" ? 16 : -16),
      ),
    );
    setInspectorWidth(next);
    window.localStorage.setItem("projects.inspectorWidth", String(next));
  }

  return { inspectorWidth, onDockResizePointerDown, onDockResizeKeyDown };
}
