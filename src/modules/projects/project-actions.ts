"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectDependencies, projects } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import {
  cascadeProjectSuccessors,
  listProjectDependencyLinks,
  predecessorProjectId,
  projectImpact,
  projectLinkCreatesCycle,
  revalidateProjectPaths,
  type ProjectImpact,
  type ProjectLinkSummary,
} from "./project-links";

const projectIdSchema = z.string().min(1).max(128);

function requireProject(projectId: string) {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error("Project not found");
  return project;
}

/** Counts shown in the delete and archive confirmations. */
export async function getProjectImpact(projectId: string): Promise<ProjectImpact> {
  await requireUserOrThrow();
  const id = projectIdSchema.parse(projectId);
  requireProject(id);
  return projectImpact(id);
}

export async function getProjectLinks(projectId: string): Promise<ProjectLinkSummary> {
  await requireUserOrThrow();
  const id = projectIdSchema.parse(projectId);
  requireProject(id);
  return listProjectDependencyLinks(id);
}

const addPredecessorSchema = z.object({
  projectId: projectIdSchema,
  predecessor: z.object({
    type: z.enum(["project", "task"]),
    id: z.string().min(1).max(128),
  }),
});

export type AddProjectPredecessorResult =
  | {
      ok: true;
      links: ProjectLinkSummary;
      project: typeof projects.$inferSelect;
    }
  | { ok: false; code: "notFound" | "self" | "exists" | "cycle" };

/**
 * Makes a project wait for a project or task. The successor's start (and its
 * tasks) are moved after the predecessor's finish right away.
 */
export async function addProjectPredecessor(
  input: z.input<typeof addPredecessorSchema>,
): Promise<AddProjectPredecessorResult> {
  await requireUserOrThrow();
  const data = addPredecessorSchema.parse(input);
  const { projectId, predecessor } = data;

  const result = db.transaction((tx): AddProjectPredecessorResult | null => {
    if (!tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()) {
      return { ok: false, code: "notFound" };
    }
    const ownerProjectId = predecessorProjectId(predecessor, tx);
    if (!ownerProjectId) return { ok: false, code: "notFound" };
    if (ownerProjectId === projectId) return { ok: false, code: "self" };
    const existing = tx
      .select({ id: projectDependencies.id })
      .from(projectDependencies)
      .where(and(
        eq(projectDependencies.successorProjectId, projectId),
        eq(projectDependencies.predecessorType, predecessor.type),
        eq(projectDependencies.predecessorId, predecessor.id),
      ))
      .get();
    if (existing) return { ok: false, code: "exists" };
    if (projectLinkCreatesCycle(projectId, predecessor, tx)) return { ok: false, code: "cycle" };
    tx.insert(projectDependencies).values({
      predecessorType: predecessor.type,
      predecessorId: predecessor.id,
      successorProjectId: projectId,
    }).run();
    return null;
  });
  if (result) return result;

  cascadeProjectSuccessors(predecessor.type, predecessor.id);
  revalidateProjectPaths(projectId);
  return {
    ok: true,
    links: listProjectDependencyLinks(projectId),
    project: requireProject(projectId),
  };
}

const removeLinkSchema = z.object({ id: z.string().min(1).max(128) });

/** Removes a project dependency. Dates stay where they are. */
export async function removeProjectDependency(
  input: z.input<typeof removeLinkSchema>,
): Promise<{ ok: boolean }> {
  await requireUserOrThrow();
  const { id } = removeLinkSchema.parse(input);
  const link = db.select().from(projectDependencies).where(eq(projectDependencies.id, id)).get();
  if (!link) return { ok: false };
  db.delete(projectDependencies).where(eq(projectDependencies.id, id)).run();
  revalidateProjectPaths(
    link.successorProjectId,
    link.predecessorType === "project" ? link.predecessorId : null,
  );
  return { ok: true };
}
