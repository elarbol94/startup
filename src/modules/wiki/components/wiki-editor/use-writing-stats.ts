"use client";
// Word/character counts for the editor footer. They follow every document
// change, including remote Yjs updates and large pastes, but are recomputed at
// most once per WRITING_STATS_DELAY instead of on each keystroke, because
// counting walks the whole document text.
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { calculateWritingStats, sameWritingStats, type WritingStats } from "../../lib/editor-writing";

export const WRITING_STATS_DELAY = 300;
const EMPTY_STATS: WritingStats = { words: 0, characters: 0, selectedWords: 0, readingMinutes: 0 };

export function useWritingStats(editor: Editor | null, delay = WRITING_STATS_DELAY): WritingStats {
  const [stats, setStats] = useState<WritingStats>(EMPTY_STATS);
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recompute = () => {
      timer = null;
      if (editor.isDestroyed) return;
      const next = calculateWritingStats(editor.state.doc, editor.state.selection);
      // Only a changed value re-renders the editor shell.
      setStats((current) => sameWritingStats(current, next) ? current : next);
    };
    const schedule = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged && !transaction.selectionSet) return;
      // Not pushed back by further edits, so a long typing burst still updates.
      if (!timer) timer = setTimeout(recompute, delay);
    };
    timer = setTimeout(recompute, 0);
    editor.on("transaction", schedule);
    return () => {
      editor.off("transaction", schedule);
      if (timer) clearTimeout(timer);
    };
  }, [delay, editor]);
  return stats;
}
