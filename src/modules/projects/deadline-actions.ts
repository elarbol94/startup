"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskContexts, tasks } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import type { DeadlineWithContext } from "@/modules/tasks/types";

/** Loads one deadline for the edit dialog opened by a `?deadline=<id>` link. */
export async function getContextualDeadlineForEdit(id: string): Promise<DeadlineWithContext> {
  await requireUserOrThrow();
  const deadlineId = z.string().min(1).parse(id);
  const deadline = db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      assigneeId: tasks.assigneeId,
      deadlineDate: tasks.dueDate,
      deadlineAt: tasks.deadlineAt,
      status: tasks.status,
      contextType: taskContexts.type,
      contextEntityId: taskContexts.entityId,
      contextRoute: taskContexts.route,
      contextLabel: taskContexts.label,
      contextAnchorJson: taskContexts.anchorJson,
    })
    .from(tasks)
    .leftJoin(taskContexts, eq(tasks.id, taskContexts.taskId))
    .where(and(eq(tasks.id, deadlineId), eq(tasks.kind, "deadline")))
    .get();
  if (!deadline) throw new Error("Deadline not found");
  return {
    ...deadline,
    deadlineDate: deadline.deadlineDate ?? "",
    deadlineAt: deadline.deadlineAt?.toISOString() ?? null,
  };
}
