// Predecessor option helpers of the project dialogs: building the choices from the
// portfolio schedule and the select value key. Used by project-dialog.tsx and its pieces.
import type { ProjectPredecessorOption } from "./project-dialog-types";

/** Predecessor choices (active projects and tasks) from the portfolio schedule. */
export function projectPredecessorOptions(schedule: {
  projects: Array<{ id: string; name: string; targetEndDate: string | null }>;
  tasks: Array<{ id: string; title: string; dueDate: string | null; projectId: string }>;
}): ProjectPredecessorOption[] {
  return [
    ...schedule.projects.map((project) => ({ id: project.id, title: project.name, dueDate: project.targetEndDate, type: "project" as const })),
    ...schedule.tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, type: "task" as const, projectId: task.projectId })),
  ];
}

export const optionKey = (option: { type: string; id: string }) => `${option.type}:${option.id}`;
