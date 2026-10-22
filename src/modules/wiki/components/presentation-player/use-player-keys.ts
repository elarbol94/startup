"use client";
// The player's keyboard: the keys a clicker sends, PowerPoint's slide show keys, and zoom.
// Used by presentation-player.tsx; every action it triggers lives there.
import { useEffect, useRef, useState } from "react";
import type { BlankScreen } from "./player-overlays";

/** How long a typed stop number waits for its Enter. */
const STOP_NUMBER_WAIT_MS = 3_000;

export type PlayerKeyActions = {
  /** A follower's camera belongs to the presenter: no key does anything. */
  following: boolean;
  inDetail: boolean;
  blank: BlankScreen;
  move: (delta: 1 | -1) => void;
  overview: () => void;
  zoom: (direction: "in" | "out") => void;
  /** Back to the current stop's framing after a zoom or the overview; false if already there. */
  restoreView: () => boolean;
  openCurrentDetail: () => boolean;
  closeDetail: () => void;
  setBlank: (screen: BlankScreen) => void;
  /** Goes to stop `number` (1-based) of the open scene; false if there is none. */
  jumpTo: (number: number) => boolean;
  exit: () => void;
};

/**
 * Escape undoes the most recent thing first: a blank screen, a half-typed stop number, a zoom
 * or overview, an open detail page -- and only then ends the show (outside fullscreen, where
 * the browser takes Escape for itself). Returns the stop number being typed, for its badge.
 */
export function usePlayerKeys(actions: PlayerKeyActions): string {
  const latest = useRef(actions);
  useEffect(() => { latest.current = actions; });
  const [digits, setDigits] = useState("");
  const digitsRef = useRef("");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const type = (next: string) => {
      digitsRef.current = next;
      setDigits(next);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (next) clearTimer.current = setTimeout(() => type(""), STOP_NUMBER_WAIT_MS);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const act = latest.current;
      if (act.following || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      // A key sent to the window or document (clicker software, an extension) has no element.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const onControl = Boolean(target?.closest("button, a, [role='button']"));
      // Space and Enter activate a focused control; they must not also move the presentation.
      if ((event.key === " " || event.key === "Enter") && onControl) return;
      const { key } = event;

      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        type((digitsRef.current + key).slice(-3));
        return;
      }
      if (digitsRef.current && (key === "Enter" || key === "Escape")) {
        event.preventDefault();
        if (key === "Enter") act.jumpTo(Number(digitsRef.current));
        type("");
        return;
      }
      if (key === "b" || key === "B" || key === ".") {
        event.preventDefault();
        act.setBlank(act.blank === "black" ? null : "black");
        return;
      }
      if (key === "w" || key === "W" || key === ",") {
        event.preventDefault();
        act.setBlank(act.blank === "white" ? null : "white");
        return;
      }
      if (key === "Escape" && act.blank) {
        event.preventDefault();
        act.setBlank(null);
        return;
      }
      // Carrying on lifts a blank screen, even where the key itself has nowhere to go (back
      // on the first stop); moving on to another stop lifts it in the player as well.
      if (act.blank && ["ArrowRight", " ", "PageDown", "ArrowLeft", "PageUp"].includes(key)) act.setBlank(null);
      if (key === "ArrowRight" || key === " " || key === "PageDown") {
        event.preventDefault();
        act.move(1);
      } else if (key === "ArrowLeft" || key === "PageUp") {
        event.preventDefault();
        act.move(-1);
      } else if (key === "Home") {
        event.preventDefault();
        act.overview();
      } else if (key === "+" || key === "=" || key === "-" || key === "_") {
        event.preventDefault();
        act.zoom(key === "-" || key === "_" ? "out" : "in");
      } else if (key === "ArrowDown" || key === "Enter") {
        // Opens the detail page of what the current stop shows, for keyboards and clickers.
        if (act.openCurrentDetail()) event.preventDefault();
      } else if (key === "Escape") {
        if (act.restoreView()) { event.preventDefault(); return; }
        if (act.inDetail) { event.preventDefault(); act.closeDetail(); return; }
        if (!document.fullscreenElement) act.exit();
      } else if ((key === "Backspace" || key === "ArrowUp") && act.inDetail) {
        event.preventDefault();
        act.closeDetail();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);
  return digits;
}
