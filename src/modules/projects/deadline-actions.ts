"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { taskContexts, tasks } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import type { DeadlineWithContext } from "@/modules/tasks/types";
import {
  type ContextualTaskInput,
  upsertContextualTask,
} from "./contextual-task-actions";

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

export type ContextualDeadlineInput = Omit<
  ContextualTaskInput,
  "kind" | "priority" | "dueDate" | "projectId"
> & {
  deadlineAt: string | null;
  localDate: string;
};

export async function upsertContextualDeadline(
  input: ContextualDeadlineInput,
): Promise<{ id: string }> {
  return upsertContextualTask({
    ...input,
    kind: "deadline",
    priority: "medium",
    dueDate: input.localDate,
    projectId: null,
  });
}

const moveContextualDeadlineSchema = z.object({
  id: z.string().min(1),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deadlineAt: z.string().datetime().nullable(),
  expectedUpdatedAt: z.string().datetime(),
});

export async function moveContextualDeadline(
  input: z.input<typeof moveContextualDeadlineSchema>,
) {
  await requireUserOrThrow();
  const data = moveContextualDeadlineSchema.parse(input);
  const deadline = db.select().from(tasks).where(eq(tasks.id, data.id)).get();
  if (!deadline || deadline.kind !== "deadline") {
    return { ok: false as const, code: "not-found" as const };
  }
  if (deadline.updatedAt.toISOString() !== data.expectedUpdatedAt) {
    // Changed in another session.
    return { ok: false as const, code: "stale" as const };
  }
  const deadlineAt = data.deadlineAt ? new Date(data.deadlineAt) : null;
  const now = new Date();
  db.update(tasks)
    .set({
      startDate: data.deadlineDate,
      dueDate: data.deadlineDate,
      deadlineAt,
      updatedAt: now,
    })
    .where(eq(tasks.id, deadline.id))
    .run();
  revalidatePath("/projects");
  revalidatePath("/");
  return {
    ok: true as const,
    id: deadline.id,
    previous: {
      deadlineDate: deadline.dueDate ?? data.deadlineDate,
      deadlineAt: deadline.deadlineAt?.toISOString() ?? null,
      updatedAt: deadline.updatedAt.toISOString(),
    },
    current: {
      deadlineDate: data.deadlineDate,
      deadlineAt: deadlineAt?.toISOString() ?? null,
      updatedAt: now.toISOString(),
    },
  };
}
