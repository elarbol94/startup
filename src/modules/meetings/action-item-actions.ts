"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { createTaskInTransaction } from "@/modules/projects/task-domain";
import { syncProjectBounds } from "@/modules/projects/task-sync";
import { revalidateTaskViews } from "@/modules/projects/project-action-helpers";
import { fail, revalidateMeeting, type MeetingActionResult } from "./action-helpers";
import { meetingFor } from "./access";
import { audit } from "./processing/store";
import { parseProtocolContent } from "./protocol-content";
import { meetingActionItemDecisions, meetingProtocols, meetings } from "./schema";

const decisionSchema = z.object({
  meetingId: z.string().min(1),
  /** The approved version the person looked at. */
  protocolId: z.string().min(1),
  itemKey: z.string().min(1).max(40),
  accept: z.boolean(),
  /** The person's explicit choices for the task, validated like any task input. */
  task: z.object({
    title: z.string().trim().min(1).max(300),
    projectId: z.string().min(1).nullable(),
    assigneeIds: z.array(z.string().min(1)).max(20),
    dueDate: z.iso.date().nullable(),
  }).optional(),
});

/**
 * Accepts (creating a task) or rejects an action item of the approved
 * protocol. The decision row is unique per item, so a repeated or concurrent
 * call returns the existing decision instead of a second task.
 */
export async function decideActionItem(input: z.input<typeof decisionSchema>): Promise<MeetingActionResult<{ taskId: string | null }>> {
  const viewer = await requireUserOrThrow();
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success || (parsed.data.accept && !parsed.data.task)) return fail("invalid");
  const data = parsed.data;
  const access = meetingFor(data.meetingId, viewer, "contribute");
  if (!access.ok) return fail(access.error);
  const meetingId = access.meeting.id;
  let projectId: string | null = null;
  const result = db.transaction((tx) => {
    const existing = tx.select().from(meetingActionItemDecisions)
      .where(and(eq(meetingActionItemDecisions.meetingId, meetingId), eq(meetingActionItemDecisions.itemKey, data.itemKey))).get();
    if (existing) return { ok: true as const, taskId: existing.taskId };
    const meeting = tx.select().from(meetings).where(eq(meetings.id, meetingId)).get()!;
    if (!meeting.approvedProtocolId || meeting.approvedProtocolId !== data.protocolId) return fail("notApproved");
    const protocol = tx.select().from(meetingProtocols).where(eq(meetingProtocols.id, data.protocolId)).get();
    const item = protocol && parseProtocolContent(protocol.content).actionItems.find((candidate) => candidate.itemKey === data.itemKey);
    if (!item) return fail("unknownItem");
    let taskId: string | null = null;
    if (data.accept && data.task) {
      const task = createTaskInTransaction(tx, {
        title: data.task.title,
        description: item.text,
        projectId: data.task.projectId,
        assigneeIds: data.task.assigneeIds,
        dueDate: data.task.dueDate,
        origin: { route: `/meetings/${meetingId}`, label: meeting.title, entityId: meetingId },
      }, viewer.id);
      taskId = task.id;
      projectId = task.projectId;
    }
    tx.insert(meetingActionItemDecisions).values({
      meetingId, itemKey: data.itemKey, protocolId: data.protocolId, status: data.accept ? "accepted" : "rejected", taskId,
      snapshot: JSON.stringify({ item, task: data.task ?? null }), decidedBy: viewer.id,
    }).run();
    audit(tx, meetingId, viewer.id, data.accept ? "actionItem.accepted" : "actionItem.rejected", { itemKey: data.itemKey, taskId });
    return { ok: true as const, taskId };
  }, { behavior: "immediate" });
  if (!result.ok) return result;
  if (projectId) syncProjectBounds(projectId);
  if (result.taskId) revalidateTaskViews(projectId);
  revalidateMeeting(meetingId);
  return result;
}
