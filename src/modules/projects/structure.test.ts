import { describe, expect, it } from "vitest";
import { planStructureMove, type StructureRow } from "./structure";
const tasks = [
  { id: "a", projectId: "p", parentTaskId: null, isMilestone: false },
  { id: "b", projectId: "p", parentTaskId: null, isMilestone: false },
  { id: "child", projectId: "p", parentTaskId: "a", isMilestone: false },
  { id: "c", projectId: "p", parentTaskId: null, isMilestone: true },
];
const row = (id: string): StructureRow => ({ id, projectId: "p", kind: "task" });
describe("structure drop planning", () => {
 it("places a row after a sibling rather than after its collapsed children", () => {
  expect(planStructureMove(row("c"), row("a"), "after", tasks, ["p"], [])).toEqual({ kind: "task", taskId: "c", parentTaskId: null, beforeTaskId: "b" });
 });
 it("outdents a child after its parent", () => {
  expect(planStructureMove(row("child"), row("a"), "after", tasks, ["p"], [])).toMatchObject({ parentTaskId: null, beforeTaskId: "b" });
 });
 it("rejects descendant, milestone and dependency hierarchy drops", () => {
  expect(() => planStructureMove(row("a"), row("child"), "inside", tasks, ["p"], [])).toThrow();
  expect(() => planStructureMove(row("b"), row("c"), "inside", tasks, ["p"], [])).toThrow();
  expect(() => planStructureMove(row("b"), row("a"), "inside", tasks, ["p"], [{ predecessorTaskId: "a", successorTaskId: "b" }])).toThrow();
 });
 it("moves projects as a whole and rejects cross-project task drops", () => {
  expect(planStructureMove({ id: "project-p", projectId: "p", kind: "project" }, { id: "project-q", projectId: "q", kind: "project" }, "after", tasks, ["p", "q"], [])).toEqual({ kind: "project", projectId: "p", beforeProjectId: null });
  expect(() => planStructureMove(row("a"), { id: "project-q", projectId: "q", kind: "project" }, "inside", tasks, ["p", "q"], [])).toThrow();
 });
});

it("allows reordering when a legacy hierarchy conflict already exists elsewhere", () => {
  expect(planStructureMove(row("c"), row("b"), "before", tasks, ["p"], [{ predecessorTaskId: "a", successorTaskId: "child" }])).toMatchObject({ beforeTaskId: "b" });
});
