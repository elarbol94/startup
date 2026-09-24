import type { TimeWorkspaceData } from "../../queries";
import type { TimeEntryKind } from "../../constants";

export type WorkOptions = Pick<TimeWorkspaceData, "projects" | "tasks">;

export type Assignment = {
  projectId: string;
  taskId: string;
  kind: TimeEntryKind;
  note: string;
};

export const emptyAssignment: Assignment = { projectId: "", taskId: "", kind: "work", note: "" };

export function assignmentPayload(value: Assignment) {
  return {
    projectId: value.projectId || null,
    taskId: value.taskId || null,
    kind: value.kind,
    note: value.note,
  };
}
