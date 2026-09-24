"use client";
// Colours each author highlight in the wiki editor with that author's mark colour.
// Used by wiki-editor.tsx.
import { useEffect, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { userMarkColorStyle, type UserMarkColor } from "@/lib/user-mark-colors";

export function useHighlightAuthorColors({ editor, editorRootRef, users, currentUserId }: {
  editor: Editor | null;
  editorRootRef: RefObject<HTMLDivElement | null>;
  users: Array<{ id: string; name: string; markColor: UserMarkColor }>;
  currentUserId: string;
}) {
  useEffect(() => {
    if (!editor) return;
    const applyColors = () => {
      const root = editorRootRef.current;
      if (!root) return;
      root.querySelectorAll<HTMLElement>("mark.wiki-highlight").forEach((mark) => {
        const author = users.find((person) => person.id === mark.dataset.highlightAuthor);
        if (!author) return;
        const style = userMarkColorStyle(author.markColor, author.id);
        for (const [property, value] of Object.entries(style)) mark.style.setProperty(property, String(value));
      });
    };
    const frame = requestAnimationFrame(applyColors);
    editor.on("update", applyColors);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("update", applyColors);
    };
  }, [currentUserId, editor, users, editorRootRef]);
}
