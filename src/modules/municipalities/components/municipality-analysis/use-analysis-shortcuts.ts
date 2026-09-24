"use client";

// Keyboard shortcuts of the analysis editor: Ctrl/Cmd+Z undo/redo, and double Shift or Ctrl/Cmd+K to open
// quick add, whose open state this hook owns. Used by analysis-editor.tsx.
import { useEffect, useState } from "react";

export function useAnalysisShortcuts({
  undoLastEdit,
  redoLastEdit,
}: {
  undoLastEdit: () => void;
  redoLastEdit: () => void;
}) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Ctrl/Cmd+Z anywhere on the page, except while typing into a field — a node's constant
  // and the analysis name both live in inputs with their own undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (event.shiftKey) redoLastEdit();
      else undoLastEdit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redoLastEdit, undoLastEdit]);

  useEffect(() => {
    let lastShift = 0;
    let shiftOnly = false;
    const editable = (event: KeyboardEvent) => (event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']");
    const onKeyDown = (event: KeyboardEvent) => {
      if (editable(event)) { lastShift = 0; shiftOnly = false; return; }
      if (event.key === "Shift" && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) { shiftOnly = true; return; }
      shiftOnly = false; lastShift = 0;
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault(); event.stopImmediatePropagation(); setQuickAddOpen(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift" || !shiftOnly || editable(event)) return;
      shiftOnly = false;
      const now = performance.now();
      if (lastShift && now - lastShift < 450) { lastShift = 0; setQuickAddOpen(true); }
      else lastShift = now;
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown, { capture: true }); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  return { quickAddOpen, setQuickAddOpen };
}
