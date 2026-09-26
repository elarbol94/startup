"use client";
// Double-Shift command search of the presentation editor: opening it, and restoring focus and
// the rich-text selection when it closes. Used by presentation-editor.tsx.
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { createDoubleShiftDetector } from "../../lib/command-search";

/**
 * The editor's selection as the browser shows it. ProseMirror reads caret moves made by
 * native keys (End, arrows) on the next selectionchange, so right after such a key its
 * model can still hold the previous selection.
 */
function domTextSelection(editor: TiptapEditor, range: Range | null) {
  const { from, to } = editor.state.selection;
  if (!range || !editor.view.dom.contains(range.startContainer) || !editor.view.dom.contains(range.endContainer)) return { from, to };
  try {
    return { from: editor.view.posAtDOM(range.startContainer, range.startOffset), to: editor.view.posAtDOM(range.endContainer, range.endOffset) };
  } catch { return { from, to }; }
}

export function usePresentationCommandPalette(commandRoot: RefObject<HTMLDivElement | null>) {
  const commandFocus = useRef<HTMLElement | null>(null);
  const commandRange = useRef<Range | null>(null);
  const commandTextSelection = useRef<{ editor: TiptapEditor; from: number; to: number } | null>(null);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const openCommands = () => {
    commandFocus.current = document.activeElement as HTMLElement | null;
    const selection = window.getSelection();
    commandRange.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const richEditor = (commandFocus.current as (HTMLElement & { editor?: TiptapEditor }) | null)?.editor;
    commandTextSelection.current = richEditor && !richEditor.isDestroyed
      ? { editor: richEditor, ...domTextSelection(richEditor, commandRange.current) }
      : null;
    setCommandsOpen(true);
  };
  const openCommandsFromKeyboard = useEffectEvent(openCommands);
  const restoreCommandFocus = () => {
    const target = commandFocus.current;
    const textSelection = commandTextSelection.current;
    if (textSelection && !textSelection.editor.isDestroyed && target?.isConnected) {
      // Restore the editor model as well as browser focus. A DOM Range alone can
      // be overwritten by ProseMirror's selection on the next keystroke.
      textSelection.editor.commands.setTextSelection({ from: textSelection.from, to: textSelection.to });
      textSelection.editor.view.focus();
      return;
    }
    (target?.isConnected ? target : commandRoot.current)?.focus({ preventScroll: true });
    const range = commandRange.current;
    if (range?.startContainer.isConnected && commandRoot.current?.contains(range.startContainer)) {
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    }
  };
  useEffect(() => {
    const detector = createDoubleShiftDetector();
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || !commandRoot.current?.contains(target) || target.closest?.('input, textarea, select, [role=dialog], [role=menu], [data-shortcut-recorder]') || document.querySelector('[aria-modal="true"]')) { detector.reset(); return; }
      if (detector.handle(event, performance.now())) { event.preventDefault(); openCommandsFromKeyboard(); }
    };
    window.addEventListener("keydown", handle, true); window.addEventListener("keyup", handle, true);
    const interruptions = ["blur", "pointerdown", "focusin", "compositionstart", "visibilitychange"] as const;
    for (const type of interruptions) window.addEventListener(type, detector.reset, true);
    return () => {
      window.removeEventListener("keydown", handle, true); window.removeEventListener("keyup", handle, true);
      for (const type of interruptions) window.removeEventListener(type, detector.reset, true);
    };
  }, [commandRoot]);
  return { commandsOpen, setCommandsOpen, openCommands, restoreCommandFocus };
}
