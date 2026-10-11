import { describe, expect, it } from "vitest";
import { endOfNextWeek, groupTasksByBucket, openTaskBucket } from "./task-buckets";

describe("task buckets", () => {
  it("ends next week on the Sunday after the current week", () => {
    expect(endOfNextWeek("2026-10-11")).toBe("2026-10-18"); // Sunday
    expect(endOfNextWeek("2026-10-12")).toBe("2026-10-25"); // Monday
    expect(endOfNextWeek("2026-12-30")).toBe("2027-01-10");
  });

  it("buckets open tasks by due date", () => {
    const today = "2026-10-14"; // Wednesday
    expect(openTaskBucket("2026-10-13", today)).toBe("overdue");
    expect(openTaskBucket(today, today)).toBe("soon");
    expect(openTaskBucket("2026-10-25", today)).toBe("soon");
    expect(openTaskBucket("2026-10-26", today)).toBe("later");
    expect(openTaskBucket(null, today)).toBe("later");
  });

  it("groups in display order, sorts by date then priority and skips empty buckets", () => {
    const tasks = [
      { id: "a", dueDate: null, priority: "high" as const, done: false },
      { id: "b", dueDate: "2026-10-20", priority: "low" as const, done: false },
      { id: "c", dueDate: "2026-10-20", priority: "high" as const, done: false },
      { id: "d", dueDate: "2026-11-30", priority: "medium" as const, done: false },
      { id: "e", dueDate: "2026-10-01", priority: "medium" as const, done: true },
    ];
    const groups = groupTasksByBucket(tasks, "2026-10-14", (task) => task.done);
    expect(groups.map((group) => [group.bucket, group.tasks.map((task) => task.id)])).toEqual([
      ["soon", ["c", "b"]],
      ["later", ["d", "a"]],
      ["done", ["e"]],
    ]);
  });
});
