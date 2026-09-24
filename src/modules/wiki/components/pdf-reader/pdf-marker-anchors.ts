// Parses the page anchors stored on context tasks and deadlines shown in the PDF reader.
// Used by pdf-reader.tsx and pdf-context-markers.tsx.
import type { ContextDeadlineMarker, ContextTaskMarker } from "@/modules/tasks/types";
import type { PdfTaskAnchor } from "./pdf-reader-types";

export function taskAnchor(task: ContextTaskMarker): PdfTaskAnchor {
  try {
    return JSON.parse(task.anchorJson) as PdfTaskAnchor;
  } catch {
    return {};
  }
}

export function taskAnchorPage(tasks: ContextTaskMarker[], taskId?: string) {
  if (!taskId) return null;
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) return null;
  const page = taskAnchor(task).pageNumber;
  return typeof page === "number" && Number.isInteger(page) && page > 0 ? page : null;
}

export function deadlineAnchor(deadline: ContextDeadlineMarker): PdfTaskAnchor {
  try {
    return JSON.parse(deadline.anchorJson) as PdfTaskAnchor;
  } catch {
    return {};
  }
}

export function deadlineAnchorPage(deadlines: ContextDeadlineMarker[], deadlineId?: string) {
  if (!deadlineId) return null;
  const deadline = deadlines.find((candidate) => candidate.id === deadlineId);
  if (!deadline) return null;
  const page = deadlineAnchor(deadline).pageNumber;
  return typeof page === "number" && Number.isInteger(page) && page > 0 ? page : null;
}
