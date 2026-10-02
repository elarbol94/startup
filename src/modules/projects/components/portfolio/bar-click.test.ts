import { describe, expect, it } from "vitest";
import type { PortfolioTask } from "@/modules/projects/queries";
import { barClickAction } from "./portfolio-utils";

const task = { id: "task-1", projectId: "project-1" } as PortfolioTask;
const projectRow = { kind: "project" as const, projectId: "project-1" };
const taskRow = { kind: "task" as const, projectId: "project-1", task };
const idle = { dragged: false, dependencySourceId: null };

describe("barClickAction", () => {
  it("expands or collapses a project's tasks when its bar is clicked (BUG-17)", () => {
    expect(barClickAction(projectRow, idle)).toEqual({ type: "toggleProject", projectId: "project-1" });
  });

  it("opens the inspector for a task bar", () => {
    expect(barClickAction(taskRow, idle)).toEqual({ type: "openTask", task });
  });

  it("ignores the click that ends a drag", () => {
    expect(barClickAction(projectRow, { ...idle, dragged: true })).toEqual({ type: "ignore" });
    expect(barClickAction(taskRow, { ...idle, dragged: true })).toEqual({ type: "ignore" });
  });

  it("links or cancels while drawing a dependency, leaving project bars alone", () => {
    expect(barClickAction(taskRow, { ...idle, dependencySourceId: "task-2" })).toEqual({ type: "link", targetId: "task-1" });
    expect(barClickAction(taskRow, { ...idle, dependencySourceId: "task-1" })).toEqual({ type: "cancelLink" });
    expect(barClickAction(projectRow, { ...idle, dependencySourceId: "task-2" })).toEqual({ type: "ignore" });
  });
});
