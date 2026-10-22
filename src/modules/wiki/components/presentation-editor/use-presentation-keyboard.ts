"use client";
// The editor's keyboard: shortcuts to commands, Escape (cancel, close, climb out of a group),
// Tab through the objects, and the PowerPoint arrow keys (move, resize, turn).
// Used by presentation-editor.tsx.
import { useEffect, useEffectEvent, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { PresentationBridge } from "../../collaboration/presentation-bridge";
import { presentationAncestors, type PresentationCanvasAction, type PresentationElement } from "../../lib/presentation";
import { ROTATE_STEP, formatTextHosts, keyboardResize, nudge, type ArrowKey } from "../../lib/presentation-keyboard-edits";
import { parentSelection } from "../../lib/presentation-selection";
import { isTextHost, textHostContent } from "../../lib/presentation-text-host";
import type { PresetGalleryEntry } from "../../lib/preset-shapes/preset-gallery";
import { isControlKey, isModifierShortcut, presentationKeyScope } from "./presentation-keyboard-scope";
import { formatShortcut, rotateElementsIndividually, textFormatKey, toolShortcut } from "./presentation-shortcuts";
import type { useDetailScene } from "./use-detail-scene";
import type { usePresentationFormatting } from "./use-presentation-formatting";
import type { usePresentationTextEditing } from "./use-presentation-text-editing";
import type { usePresentationViewSettings } from "./use-presentation-view-settings";

export function usePresentationKeyboard({
  drawTool, commandRoot, canvasRef, formatting, view, textEditing, commandsOpen, shortcutHelp, pendingElement, setPendingElement, placePending, viewportCenter,
  canMutate, selectedRoots, selected, selectedLocked, selectedIds, setSelectedIds, elements, detail, dispatch, commitElements, executeCommand, setContextPosition, dragCancel: dragCancelRef, cancelledGesture: cancelledGestureRef, bridge,
}: {
  drawTool: PresetGalleryEntry | null;
  commandRoot: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  formatting: ReturnType<typeof usePresentationFormatting>;
  view: ReturnType<typeof usePresentationViewSettings>;
  textEditing: ReturnType<typeof usePresentationTextEditing>;
  commandsOpen: boolean;
  shortcutHelp: boolean;
  pendingElement: PresentationElement | null;
  setPendingElement: Dispatch<SetStateAction<PresentationElement | null>>;
  placePending: (point: { x: number; y: number }, keyboard?: boolean) => void;
  viewportCenter: () => { x: number; y: number };
  canMutate: boolean;
  selectedRoots: PresentationElement[];
  selected: PresentationElement | null;
  selectedLocked: boolean;
  selectedIds: string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  elements: PresentationElement[];
  detail: ReturnType<typeof useDetailScene>;
  dispatch: (action: PresentationCanvasAction) => void;
  commitElements: (update: (current: PresentationElement[]) => PresentationElement[]) => void;
  executeCommand: (id: string) => void;
  setContextPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  dragCancel: RefObject<(() => void) | null>;
  cancelledGesture: RefObject<boolean>;
  bridge: PresentationBridge;
}) {
  const handleKeyboard = useEffectEvent((event: KeyboardEvent) => {
    // An armed drawing tool owns the keyboard (Escape cancels it, Enter finishes a freeform).
    if (drawTool) return;
    const scope = presentationKeyScope(event, commandRoot.current);
    if (!scope) return;
    if (formatting.picking && event.key === "Escape") { event.preventDefault(); formatting.finishPick(null); return; }
    // Edit Points owns Escape, Delete and the arrows while it is on.
    if (formatting.editPointsElement) return;
    const { target, typing } = scope;
    if (!typing && view.onKeyDown(event)) return;
    const mod = isModifierShortcut(event), key = event.key.toLowerCase();
    // Only plain Mod+S saves: Mod+Shift+S stays strikethrough in the text editor.
    if (mod && key === "s" && !event.shiftKey && !event.altKey) { event.preventDefault(); executeCommand("save"); return; }
    if (!typing && textEditing.captureKey(event)) return;
    if (typing || commandsOpen || shortcutHelp) return;
    if (pendingElement && (key === "escape" || key === "enter")) { event.preventDefault(); if (key === "escape") setPendingElement(null); else placePending(viewportCenter(), true); return; }
    // A focused button or link keeps its own Enter, Space and arrows; shortcuts, Delete and Escape stay the canvas's.
    if (scope.onControl && isControlKey(event)) return;
    let id: string | undefined;
    // Mod+Shift+A/D stay the app-wide "Neue Aufgabe"/"Neue Deadline".
    // PowerPoint's text keys on a selected box or shape format all of its text.
    const textFormat = mod && !event.altKey ? textFormatKey(event) : undefined;
    if (textFormat) { event.preventDefault(); event.stopPropagation(); if (canMutate && selectedRoots.length) dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => formatTextHosts(current, new Set(selectedRoots.map(e => e.id)), textFormat) }); return; }
    if (mod) id = formatShortcut(event) ?? ({ a: event.shiftKey ? "" : "selectAll", c: event.shiftKey ? "" : "copy", x: "cut", v: event.shiftKey ? "" : "paste", d: event.shiftKey ? "" : "duplicateSelection", g: event.shiftKey ? "ungroup" : "group", z: event.shiftKey ? "redo" : "undo", y: "redo", "}": "front", "{": "back" } as Record<string, string>)[key];
    else if (key === "delete" || key === "backspace") id = "deleteSelection";
    else if (key === "enter") id = "editText";
    else if (key === "f2") {
      // F2 toggles text editing, entering with all text selected.
      event.preventDefault(); if (canMutate && isTextHost(selected) && !selectedLocked) textEditing.startEditing(selected.id); return;
    }
    else if (!pendingElement && canMutate && isTextHost(selected) && !selectedLocked && event.key.length === 1 && !event.altKey && key !== " ") {
      // Typing on a selected text box or shape adds to its text, like PowerPoint: edit mode
      // opens with the caret at the end and this key is buffered for the editor.
      textEditing.startEditing(selected.id, "end", textHostContent(selected).text); textEditing.captureKey(event); return;
    }
    else if (!pendingElement) id = toolShortcut(event);
    if (id === "copy" || id === "cut" || id === "paste") return; // handled in the clipboard events these keys fire
    if (id) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) executeCommand(id); return; }
    if (event.shiftKey && event.key === "F10") { event.preventDefault(); const box = canvasRef.current?.getBoundingClientRect(); if (box) setContextPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }); return; }
    if (key === "escape") { if (dragCancelRef.current) dragCancelRef.current(); else if (bridge.cancelGesture()) { cancelledGestureRef.current = true; window.dispatchEvent(new Event("presentation-cancel-gesture")); } else if (!selectedIds.length && detail.sceneId) detail.close(); else { setContextPosition(null); setSelectedIds(current => parentSelection(elements, current)); commandRoot.current?.focus(); } return; }
    if (key === "tab" && canvasRef.current?.contains(target)) {
      const roots = detail.elements.filter(e => !presentationAncestors(elements, e.id).some(parent => parent.type === "frame" && parent.content.isGroup)); if (!roots.length) return;
      event.preventDefault(); const current = roots.findIndex(e => selectedIds.includes(e.id));
      setSelectedIds([roots[(current + (event.shiftKey ? -1 : 1) + roots.length) % roots.length].id]); return;
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key) && canMutate) {
      event.preventDefault(); event.stopPropagation();
      const arrow = key as ArrowKey, targets = selectedRoots.filter(e => !(e.type === "shape" && e.content.connection));
      if (!targets.length) return;
      // PowerPoint: Alt+Left/Right turns by 15°, Shift(+Ctrl)+Arrow resizes by 10 % (1 %), Arrow moves.
      if (event.altKey) { if (arrow === "arrowleft" || arrow === "arrowright") commitElements(current => rotateElementsIndividually(current, targets.map(e => e.id), arrow === "arrowright" ? ROTATE_STEP : -ROTATE_STEP)); return; }
      const changes = event.shiftKey ? keyboardResize(targets, arrow, mod) : nudge(targets, arrow);
      dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: false, membership: targets.map(e => e.id), changes });
    }
  });
  useEffect(() => { const key = (event: KeyboardEvent) => handleKeyboard(event); window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true); }, []);
}
