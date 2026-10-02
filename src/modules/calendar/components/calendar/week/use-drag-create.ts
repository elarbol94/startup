"use client";

// Drag-to-create on empty timeline slots. A vertical mouse/pen drag selects a range
// snapped to 15 minutes; a plain click (or tap / keyboard activation) proposes a
// 60-minute event, unless something is selected — then it only clears the selection.
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { DEFAULT_CREATE_MINUTES, SNAP_MINUTES, snapMinutes } from "./week-utils";

export type CreatePreview = { day: string; start: number; end: number };

type Gesture = { day: string; anchor: number; y: number; column: HTMLElement; moved: boolean };

const IGNORE_SELECTOR = "[data-calendar-event]";

function minutesAt(column: HTMLElement, clientY: number) {
  return clientY - column.getBoundingClientRect().top;
}

function rangeFrom(anchor: number, minutes: number) {
  const current = snapMinutes(minutes);
  return { start: Math.min(anchor, current), end: Math.max(anchor, current) + SNAP_MINUTES };
}

function anchorRect(column: HTMLElement, start: number, end: number) {
  const rect = column.getBoundingClientRect();
  return new DOMRect(rect.left + 2, rect.top + start, Math.max(0, rect.width - 4), end - start);
}

export function useDragCreate({
  hasSelection,
  onCreateRange,
  onBackgroundClick,
}: {
  hasSelection: boolean;
  onCreateRange: (day: string, startMinutes: number, endMinutes: number, anchor: DOMRect) => void;
  onBackgroundClick: () => void;
}) {
  const [preview, setPreview] = useState<CreatePreview | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);

  function clickAt(day: string, column: HTMLElement, minutes: number) {
    if (hasSelection) {
      onBackgroundClick();
      return;
    }
    const start = snapMinutes(minutes);
    const end = Math.min(1440, start + DEFAULT_CREATE_MINUTES);
    onCreateRange(day, start, end, anchorRect(column, start, end));
  }

  function handlersFor(day: string) {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0 || event.pointerType === "touch") return;
        if ((event.target as HTMLElement).closest(IGNORE_SELECTOR)) return;
        const column = event.currentTarget;
        gesture.current = { day, anchor: snapMinutes(minutesAt(column, event.clientY)), y: event.clientY, column, moved: false };
        suppressClick.current = false;
        column.setPointerCapture(event.pointerId);
        // Avoid text selection while dragging out a range.
        event.preventDefault();
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const state = gesture.current;
        if (!state) return;
        if (!state.moved && Math.abs(event.clientY - state.y) < 4) return;
        state.moved = true;
        const viewport = state.column.closest<HTMLElement>("[data-testid=calendar-week-scroll]");
        if (viewport) {
          const bounds = viewport.getBoundingClientRect();
          if (event.clientY > bounds.bottom - 24) viewport.scrollTop += 12;
          else if (event.clientY < bounds.top + 100) viewport.scrollTop -= 12;
        }
        setPreview({ day: state.day, ...rangeFrom(state.anchor, minutesAt(state.column, event.clientY)) });
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const state = gesture.current;
        if (!state) return;
        gesture.current = null;
        suppressClick.current = true;
        if (state.column.hasPointerCapture(event.pointerId)) state.column.releasePointerCapture(event.pointerId);
        setPreview(null);
        const minutes = minutesAt(state.column, event.clientY);
        // Open after the browser's follow-up click; otherwise a popover opened here
        // treats that click as an outside press and closes immediately.
        window.setTimeout(() => {
          if (!state.moved) {
            clickAt(state.day, state.column, minutes);
            return;
          }
          const range = rangeFrom(state.anchor, minutes);
          onCreateRange(state.day, range.start, range.end, anchorRect(state.column, range.start, range.end));
        }, 0);
      },
      onPointerCancel() {
        gesture.current = null;
        setPreview(null);
      },
      // Taps and keyboard activation of a slot arrive here without a pointer gesture.
      onClick(event: MouseEvent<HTMLElement>) {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        const target = event.target as HTMLElement;
        if (target.closest(IGNORE_SELECTOR)) return;
        const column = event.currentTarget;
        const slot = target.closest<HTMLElement>("[data-slot-hour]");
        const minutes = event.detail === 0 && slot ? Number(slot.dataset.slotHour) * 60 : minutesAt(column, event.clientY);
        clickAt(day, column, minutes);
      },
    };
  }

  return { preview, handlersFor };
}
