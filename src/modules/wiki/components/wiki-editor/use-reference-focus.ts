"use client";
// Scrolls to and focuses the task or deadline reference named in the URL, falling back to
// the task's text anchor. Used by wiki-editor.tsx.
import { useEffect, type RefObject } from "react";
import type { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { resolveTaskOrigin } from "../../lib/task-origin";
import type { ContextTaskMarker } from "@/modules/tasks/types";

export function useReferenceFocus({ editor, focusTaskId, focusDeadlineId, contextTasks, tTasks, tDeadlines, editorRootRef }: {
  editor: Editor | null;
  focusTaskId?: string;
  focusDeadlineId?: string;
  contextTasks: ContextTaskMarker[];
  tTasks: ReturnType<typeof useTranslations<"tasks">>;
  tDeadlines: ReturnType<typeof useTranslations<"deadlines">>;
  editorRootRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (!editor || !focusTaskId) return;
    const timeout = window.setTimeout(() => {
      const marker = editorRootRef.current?.querySelector<HTMLElement>(
        `[data-task-reference="${CSS.escape(focusTaskId)}"]`,
      );
      if (marker) {
        marker.scrollIntoView({ behavior: "smooth", block: "center" });
        marker.focus({ preventScroll: true });
      } else {
        const task = contextTasks.find((candidate) => candidate.id === focusTaskId);
        const range = task ? resolveTaskOrigin(editor.state.doc, task.anchorJson) : null;
        if (range) editor.chain().setTextSelection(range).scrollIntoView().run();
        else toast.info(tTasks("sourceFallback"));
      }
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [editor, focusTaskId, contextTasks, tTasks, editorRootRef]);

  useEffect(() => {
    if (!editor || !focusDeadlineId) return;
    const timeout = window.setTimeout(() => {
      const marker = editorRootRef.current?.querySelector<HTMLElement>(
        `[data-deadline-reference="${CSS.escape(focusDeadlineId)}"]`,
      );
      if (marker) {
        marker.scrollIntoView({ behavior: "smooth", block: "center" });
        marker.focus({ preventScroll: true });
      } else {
        toast.info(tDeadlines("sourceFallback"));
      }
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [editor, focusDeadlineId, tDeadlines, editorRootRef]);
}
