import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

/** Thrown when a mutation targets tasks or columns of an archived project. */
export class ProjectArchivedError extends Error {
  readonly code = "project_archived";
  constructor(projectId: string) {
    super(`Project ${projectId} is archived`);
    this.name = "ProjectArchivedError";
  }
}

/**
 * Rejects board changes (tasks, columns) of an archived project. Unknown
 * projects pass through so callers keep their own "not found" handling.
 */
export function assertProjectEditable(projectId: string | null | undefined): void {
  if (!projectId) return;
  const project = db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (project?.status === "archived") throw new ProjectArchivedError(projectId);
}
