// Shared types of the task dialog: the task and member DTOs the board passes in, the
// constraint kinds and the save failure codes. Used by task-dialog.tsx and components/task-dialog/.
import type { ReportKind } from "@/modules/projects/bugs/kinds";
import type { TaskDialogResult } from "@/modules/projects/task-dialog-actions";

export type ConstraintType = "asap" | "start_no_earlier_than" | "must_start_on";

export type MemberDto = { id: string; name: string };
export type BoardTaskDto = {
  id: string;
  projectId: string;
  columnId: string;
  parentTaskId: string | null;
  title: string;
  description: string;
  assigneeIds: string[];
  assignees: Array<{ id: string; name: string }>;
  assigneeName: string | null;
  dueDate: string | null;
  startDate: string | null;
  progress: number;
  isMilestone: boolean;
  constraintType?: ConstraintType;
  constraintDate?: string | null;
  priority: "low" | "medium" | "high";
  sortOrder: number;
  /** Bug reports only: when a coding agent last worked on it. */
  agentWorkedAt?: Date | null;
  /** Bug reports only: bug, feature request, improvement or other feedback. */
  reportKind?: ReportKind | null;
};

export type FailureCode = Extract<TaskDialogResult, { ok: false }>["code"];
