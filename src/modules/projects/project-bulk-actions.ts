"use server";

import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { bulkIdsSchema, bulkOutcome, type BulkOutcome } from "@/lib/bulk";
import { deleteProjectRows, projectsImpact, revalidateProjectPaths, type ProjectImpact } from "./project-links";

const idsSchema = z.object({ ids: bulkIdsSchema });

function existing(ids: string[]) {
  const found = new Set(db.select({ id: projects.id }).from(projects).where(inArray(projects.id, ids)).all().map((row) => row.id));
  return {
    found: ids.filter((id) => found.has(id)),
    skipped: ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: "notFound" as const })),
  };
}

/** Counts shown in the bulk delete confirmation; links between selected projects count once. */
export async function getProjectsImpact(input: z.input<typeof idsSchema>): Promise<ProjectImpact> {
  await requireUserOrThrow();
  const { found } = existing(idsSchema.parse(input).ids);
  return projectsImpact(found);
}

const statusSchema = z.object({ ids: bulkIdsSchema, status: z.enum(["active", "archived"]) });

export async function setProjectsStatus(input: z.input<typeof statusSchema>): Promise<BulkOutcome> {
  await requireUserOrThrow();
  const data = statusSchema.parse(input);
  const { found, skipped } = existing(data.ids);
  if (found.length) db.update(projects).set({ status: data.status, updatedAt: new Date() }).where(inArray(projects.id, found)).run();
  revalidateProjectPaths(...found);
  return bulkOutcome(found, skipped);
}

/** Deletes projects with their columns, tasks and links, all in one transaction. */
export async function deleteProjects(input: z.input<typeof idsSchema>): Promise<BulkOutcome> {
  await requireUserOrThrow();
  const data = idsSchema.parse(input);
  const { found, skipped } = existing(data.ids);
  db.transaction((tx) => {
    for (const id of found) deleteProjectRows(tx, id);
  });
  revalidateProjectPaths(...found);
  return bulkOutcome(found, skipped);
}
