// Shared types of the project dialogs: the project row, members and predecessor choices.
// Used by project-dialog.tsx and the pieces in components/project-dialog/.
import type { projects as projectsTable } from "@/modules/projects/schema";

export type ProjectRecord = typeof projectsTable.$inferSelect;
export type ProjectMember = { id: string; name: string };
export type ProjectPredecessorOption = {
  id: string;
  title: string;
  dueDate: string | null;
  type: "project" | "task";
  /** Owning project of a task option; used to hide the project's own tasks. */
  projectId?: string | null;
};
