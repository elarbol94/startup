"use client";
// Keeps task and deadline reference blocks in the document in sync with the live task and
// deadline data passed to the wiki editor. Used by wiki-editor.tsx.
import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import type { useFormatter } from "next-intl";
import { localDateValue } from "@/modules/tasks/deadline-utils";
import type { ContextDeadlineMarker, ContextTaskMarker } from "@/modules/tasks/types";

export function useContextReferenceSync({ editor, contextTasks, contextDeadlines, format }: {
  editor: Editor | null;
  contextTasks: ContextTaskMarker[];
  contextDeadlines: ContextDeadlineMarker[];
  format: ReturnType<typeof useFormatter>;
}) {
  useEffect(() => {
    if (!editor) return;
    const byId = new Map(contextTasks.map((task) => [task.id, task]));
    const transaction = editor.state.tr;
    let changed = false;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== "taskReference") return;
      const task = byId.get(String(node.attrs.taskId));
      if (!task) return;
      const nextAttrs = {
        ...node.attrs,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assigneeName: task.assigneeName ?? "",
        assignees: task.assignees,
      };
      if (JSON.stringify(nextAttrs) !== JSON.stringify(node.attrs)) {
        transaction.setNodeMarkup(position, undefined, nextAttrs);
        changed = true;
      }
    });
    if (changed) editor.view.dispatch(transaction);
  }, [contextTasks, editor]);

  useEffect(() => {
    if (!editor) return;
    const byId = new Map(contextDeadlines.map((deadline) => [deadline.id, deadline]));
    const transaction = editor.state.tr;
    let changed = false;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== "deadlineReference") return;
      const deadline = byId.get(String(node.attrs.deadlineId));
      if (!deadline) return;
      const localDate = localDateValue(deadline.deadlineDate);
      const dateLabel = localDate
        ? format.dateTime(localDate, { dateStyle: "medium" })
        : deadline.deadlineDate;
      const timeLabel = deadline.deadlineAt
        ? format.dateTime(new Date(deadline.deadlineAt), { timeStyle: "short" })
        : "";
      const nextAttrs = {
        ...node.attrs,
        title: deadline.title,
        description: deadline.description,
        status: deadline.status,
        assigneeName: deadline.assigneeName ?? "",
        assignees: deadline.assigneeId ? [{ id: deadline.assigneeId, name: deadline.assigneeName ?? "" }] : [],
        deadlineAt: [dateLabel, timeLabel].filter(Boolean).join(", "),
      };
      if (JSON.stringify(nextAttrs) !== JSON.stringify(node.attrs)) {
        transaction.setNodeMarkup(position, undefined, nextAttrs);
        changed = true;
      }
    });
    if (changed) editor.view.dispatch(transaction);
  }, [contextDeadlines, editor, format]);
}
