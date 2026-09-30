// Shared types for the Kanban board pieces. Used by board-client.tsx and the
// other files in board/.

export type ColumnDto = {
  id: string;
  name: string;
  sortOrder: number;
  isCompleted: boolean;
  workflowStage: "todo" | "in_progress";
};
