import { assertDependencyEndpoints, taskDescendants } from "./schedule";

type Task = { id: string; projectId: string; parentTaskId: string | null; isMilestone: boolean };
export type StructureRow = { id: string; projectId: string; kind: "project" | "task" | "subtask" };
export type DropPlacement = "before" | "inside" | "after";
export type StructureMove = { kind: "project"; projectId: string; beforeProjectId: string | null } | { kind: "task"; taskId: string; parentTaskId: string | null; beforeTaskId: string | null };

/** Resolve row gestures against the full hierarchy, including collapsed children. */
export function planStructureMove(source: StructureRow, target: StructureRow, placement: DropPlacement,
  tasks: Task[], projectIds: string[], dependencies: { predecessorTaskId: string; successorTaskId: string }[]): StructureMove {
  if (source.id === target.id) throw new Error("self");
  if (source.kind === "project") {
    if (target.kind !== "project" || placement === "inside") throw new Error("project");
    const others = projectIds.filter(id => id !== source.projectId);
    const index = others.indexOf(target.projectId);
    if (index < 0) throw new Error("missing");
    return { kind: "project", projectId: source.projectId, beforeProjectId: placement === "before" ? target.projectId : others[index + 1] ?? null };
  }
  if (source.projectId !== target.projectId) throw new Error("project");
  const task = tasks.find(t => t.id === source.id);
  const destination = tasks.find(t => t.id === target.id);
  if (!task || (target.kind !== "project" && !destination)) throw new Error("missing");
  if (target.kind === "project" && placement !== "inside") throw new Error("project");
  if (placement === "inside" && destination?.isMilestone) throw new Error("milestone");
  const parentTaskId = target.kind === "project" ? null : placement === "inside" ? target.id : destination!.parentTaskId;
  if (parentTaskId === task.id || taskDescendants(tasks, task.id).some(t => t.id === parentTaskId || t.id === target.id)) throw new Error("cycle");
  const siblings = tasks.filter(t => t.projectId === task.projectId && t.parentTaskId === parentTaskId && t.id !== task.id);
  const index = siblings.findIndex(t => t.id === target.id);
  const beforeTaskId = placement === "inside" ? null : placement === "before" ? target.id : siblings[index + 1]?.id ?? null;
  const next = tasks.map(t => t.id === task.id ? { ...t, parentTaskId } : t);
  for (const dependency of dependencies) {
    // Existing legacy conflicts elsewhere must not block a valid move.
    try { assertDependencyEndpoints(tasks, dependency); } catch { continue; }
    assertDependencyEndpoints(next, dependency);
  }
  return { kind: "task", taskId: task.id, parentTaskId, beforeTaskId };
}

/** Equal, predictable zones: the middle third nests, outer thirds reorder. */
export function structureDropPlacement(source: StructureRow["kind"], target: StructureRow["kind"], fraction: number): DropPlacement {
  if (source === "project") return fraction < 0.5 ? "before" : "after";
  if (target === "project") return "inside";
  return fraction < 1 / 3 ? "before" : fraction > 2 / 3 ? "after" : "inside";
}
