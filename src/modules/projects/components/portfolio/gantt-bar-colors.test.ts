import { describe, expect, it } from "vitest";
import { ganttBarColors } from "./portfolio-utils";

describe("ganttBarColors", () => {
  it("derives task bars from the project colour, dimmed", () => {
    const task = ganttBarColors("task", "#22c55e");
    expect(task.border).toContain("#22c55e");
    expect(task.background).toContain("#22c55e");
    expect(task.progress).toContain("#22c55e");
    expect(task.border).not.toBe("#22c55e");
  });

  it("gives project bars the full colour and a stronger fill than tasks", () => {
    const project = ganttBarColors("project", "#22c55e");
    expect(project.border).toBe("#22c55e");
    const pct = (value: string) => Number(/(\d+)%/.exec(value)![1]);
    expect(pct(project.background)).toBeGreaterThan(
      pct(ganttBarColors("task", "#22c55e").background),
    );
  });
});
