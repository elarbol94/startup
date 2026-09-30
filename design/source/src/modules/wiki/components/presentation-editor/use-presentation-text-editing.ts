"use client";
// On-canvas text editing for the presentation editor: which text element is in edit mode,
// entering it synchronously, and keeping keys typed before the inline editor has focus.
// Used by presentation-editor.tsx.
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import type { Editor } from "@tiptap/react";

/** Longest wait for the inline editor before buffered keys are given up. */
const READY_TIMEOUT = 1500;
const BUFFERED_KEYS = new Set(["Backspace", "Delete", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/** Keys that would otherwise reach canvas shortcuts (delete, nudge, pan) or be lost. */
function bufferable(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
  return event.key.length === 1 || BUFFERED_KEYS.has(event.key);
}

/** Applies keys typed during the hand-over as if they had been typed into the editor. */
function replayKeys(editor: Editor, keys: string[]) {
  for (const key of keys) {
    if (editor.isDestroyed) return;
    if (key.length === 1) editor.view.dispatch(editor.state.tr.insertText(key));
    else if (key === "Backspace" || key === "Delete" || key === "Enter") editor.commands.keyboardShortcut(key);
    else {
      const { from, to, empty } = editor.state.selection;
      const back = key === "ArrowLeft" || key === "ArrowUp";
      const position = back ? (empty ? from - 1 : from) : (empty ? to + 1 : to);
      editor.commands.setTextSelection(Math.max(0, Math.min(position, editor.state.doc.content.size)));
    }
  }
}

export function usePresentationTextEditing() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useRef<string | null>(null);
  /** Keys typed after entering edit mode and before the inline editor reported ready. */
  const pending = useRef<{ id: string; keys: string[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const clearPending = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);
  useEffect(() => clearPending, [clearPending]);

  /** Enters edit mode within the current event, so the editor mounts and focuses before the next key. */
  const startEditing = useCallback((id: string) => {
    if (editing.current === id) return;
    clearPending();
    editing.current = id;
    pending.current = { id, keys: [], timer: setTimeout(clearPending, READY_TIMEOUT) };
    flushSync(() => setEditingId(id));
  }, [clearPending]);

  const stopEditing = useCallback((id?: string) => {
    if (id !== undefined && editing.current !== id) return;
    clearPending();
    editing.current = null;
    setEditingId(null);
  }, [clearPending]);

  const onEditingChange = useCallback((id: string, value: boolean) => {
    if (value) startEditing(id); else stopEditing(id);
  }, [startEditing, stopEditing]);

  const onEditorReady = useCallback((id: string, editor: Editor) => {
    const buffer = pending.current;
    if (buffer?.id !== id) return;
    clearPending();
    replayKeys(editor, buffer.keys);
  }, [clearPending]);

  /**
   * Runs first in the canvas keyboard handler. While the inline editor is still mounting,
   * typed keys are held for it instead of running canvas shortcuts: Backspace must not
   * delete the element that is about to be edited. Escape leaves edit mode and keeps the
   * element selected.
   */
  const captureKey = useCallback((event: KeyboardEvent) => {
    if (!pending.current) return false;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); stopEditing(); return true; }
    if (!bufferable(event)) return false;
    event.preventDefault(); event.stopPropagation();
    pending.current.keys.push(event.key);
    return true;
  }, [stopEditing]);

  /**
   * Whether a pending element was placed since the last first click: the click that placed
   * it can be the first half of a double-click, which must not also create a text.
   */
  const placedInClick = useRef(false);
  useEffect(() => {
    // Mouse events carry the click count (pointer events report 0). The placing press
    // suppresses its own mousedown, so only a later first press clears the flag.
    const down = (event: globalThis.MouseEvent) => { if (event.detail <= 1) placedInClick.current = false; };
    window.addEventListener("mousedown", down, true);
    return () => window.removeEventListener("mousedown", down, true);
  }, []);
  /** After placing a pending element; a placed text opens with its placeholder selected, so typing replaces it. */
  const onPlaced = useCallback((element: { id: string; type: string }, added: boolean) => {
    placedInClick.current = true;
    if (added && element.type === "text") startEditing(element.id);
  }, [startEditing]);
  /** A double-click on empty canvas creates a text there, in edit mode. */
  const onCanvasDoubleClick = useCallback((event: MouseEvent, create: () => string) => {
    if (!(event.target as HTMLElement).classList.contains("react-flow__pane") || placedInClick.current) return;
    startEditing(create());
  }, [startEditing]);

  return { editingId, onPlaced, onCanvasDoubleClick, startEditing, stopEditing, onEditingChange, onEditorReady, captureKey };
}
