"use client";
// Whether the collaborative (Yjs) undo manager has anything to undo or redo, so
// the toolbar can disable its history buttons. useSyncExternalStore compares a
// small bitmask snapshot, so the editor shell re-renders only when one of the
// two flags actually flips, never merely because a transaction or stack event
// happened.
import { useCallback, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { yUndoPluginKey } from "@tiptap/y-tiptap";

type StackEvent = "stack-item-added" | "stack-item-popped" | "stack-cleared";
type UndoManagerLike = {
  undoStack: readonly unknown[];
  redoStack: readonly unknown[];
  on(event: StackEvent, listener: () => void): void;
  off(event: StackEvent, listener: () => void): void;
};
const STACK_EVENTS: StackEvent[] = ["stack-item-added", "stack-item-popped", "stack-cleared"];
export const CAN_UNDO = 1;
export const CAN_REDO = 2;

export function undoManagerOf(state: EditorState): UndoManagerLike | null {
  return (yUndoPluginKey.getState(state) as { undoManager?: UndoManagerLike } | undefined)?.undoManager ?? null;
}

export function historyFlags(manager: Pick<UndoManagerLike, "undoStack" | "redoStack"> | null) {
  if (!manager) return 0;
  return (manager.undoStack.length > 0 ? CAN_UNDO : 0) | (manager.redoStack.length > 0 ? CAN_REDO : 0);
}

export function useHistoryAvailability(editor: Editor | null) {
  const subscribe = useCallback((notify: () => void) => {
    if (!editor) return () => {};
    let manager: UndoManagerLike | null = null;
    const follow = () => {
      const next = editor.isDestroyed ? null : undoManagerOf(editor.state);
      if (next === manager) return;
      STACK_EVENTS.forEach((event) => manager?.off(event, notify));
      manager = next;
      STACK_EVENTS.forEach((event) => manager?.on(event, notify));
    };
    // The plugin may hand out a new manager when the view is re-created.
    const onTransaction = () => { follow(); notify(); };
    follow();
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
      STACK_EVENTS.forEach((event) => manager?.off(event, notify));
      manager = null;
    };
  }, [editor]);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => editor && !editor.isDestroyed ? historyFlags(undoManagerOf(editor.state)) : 0,
    () => 0,
  );
  return { canUndo: (snapshot & CAN_UNDO) !== 0, canRedo: (snapshot & CAN_REDO) !== 0 };
}
