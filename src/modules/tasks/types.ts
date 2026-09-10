export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "done";
export type TaskKind = "task" | "deadline";
export type TaskContextType = "wikiPage" | "wikiSource" | "pdf" | "app";

export type TaskOrigin = {
  type: TaskContextType;
  entityId: string;
  route: string;
  label: string;
  anchor?: Record<string, unknown>;
};

export type EditableTask = {
  id: string;
  title: string;
  assigneeIds: string[];
  assignees: Array<{ id: string; name: string }>;
  priority: TaskPriority;
  dueDate: string | null;
  status: TaskStatus;
  projectId: string | null;
};

export type ContextTaskMarker = {
  id: string;
  projectId: string | null;
  title: string;
  assigneeIds: string[];
  assignees: Array<{ id: string; name: string }>;
  assigneeName: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  route: string;
  label: string;
  anchorJson: string;
};

export type EditableDeadline = {
  id: string;
  title: string;
  description: string;
  assigneeId: string | null;
  deadlineDate: string;
  deadlineAt: string | null;
  status: TaskStatus;
};

export type ContextDeadlineMarker = {
  id: string;
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string | null;
  deadlineDate: string;
  deadlineAt: string | null;
  status: TaskStatus;
  route: string;
  label: string;
  anchorJson: string;
};

export type DeadlineWithContext = EditableDeadline & {
  contextType: TaskContextType | null;
  contextEntityId: string | null;
  contextRoute: string | null;
  contextLabel: string | null;
  contextAnchorJson: string | null;
};
