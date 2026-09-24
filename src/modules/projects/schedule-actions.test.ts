import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ requireUserOrThrow: vi.fn(async () => ({ id: "actor" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});

import { db, sqlite } from "@/db";
import {
  projectColumns,
  projectDependencies,
  projectTaskDependencies,
  projects,
  taskDependencies,
  tasks,
  user,
} from "@/db/schema";
import { reparentTask } from "./task-actions";
import { deleteTaskDependency, upsertTaskDependency } from "./dependency-actions";
import { applyPortfolioScheduleChange } from "./schedule-change-actions";
import {
  reapplyPortfolioScheduleChange,
  revertPortfolioScheduleChange,
} from "./schedule-history-actions";
import { deleteTaskKeepChildren } from "./delete-actions";

function task(id: string) {
  return db.select().from(tasks).where(eq(tasks.id, id)).get()!;
}
function project(id: string) {
  return db.select().from(projects).where(eq(projects.id, id)).get()!;
}

beforeEach(() => {
  sqlite.exec(
    "DELETE FROM schedule_change_items; DELETE FROM project_schedule_change_items; DELETE FROM schedule_change_sets;" +
      " DELETE FROM project_task_dependencies; DELETE FROM project_dependencies; DELETE FROM task_dependencies;" +
      " DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;",
  );
  db.insert(user)
    .values({ id: "actor", name: "Actor", email: "actor@example.com", createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoNothing()
    .run();
  db.insert(projects).values([
    { id: "p", name: "P", createdBy: "actor", plannedStartDate: "2026-09-01", targetEndDate: "2026-09-10" },
    { id: "q", name: "Q", createdBy: "actor", plannedStartDate: "2026-09-12", targetEndDate: "2026-09-20" },
  ]).run();
  db.insert(projectColumns).values([
    { id: "col-p", name: "Open", projectId: "p" },
    { id: "col-q", name: "Open", projectId: "q" },
  ]).run();
  db.insert(tasks).values([
    { id: "a", title: "a", projectId: "p", columnId: "col-p", createdBy: "actor", sortOrder: 1000, startDate: "2026-09-01", dueDate: "2026-09-05" },
    { id: "b", title: "b", projectId: "p", columnId: "col-p", createdBy: "actor", sortOrder: 2000, startDate: "2026-09-06", dueDate: "2026-09-10" },
    { id: "q1", title: "q1", projectId: "q", columnId: "col-q", createdBy: "actor", sortOrder: 1000, startDate: "2026-09-12", dueDate: "2026-09-15" },
  ]).run();
});

describe("typed schedule action results", () => {
  it("reports a dependency cycle as a code instead of throwing", async () => {
    const first = await upsertTaskDependency({ predecessorTaskId: "a", successorTaskId: "b" });
    expect(first.ok).toBe(true);
    await expect(upsertTaskDependency({ predecessorTaskId: "b", successorTaskId: "a" }))
      .resolves.toEqual({ ok: false, code: "cycle" });
  });

  it("returns the deleted link so it can be restored, and not-found afterwards", async () => {
    const saved = await upsertTaskDependency({ predecessorTaskId: "a", successorTaskId: "b", lagDays: 2 });
    if (!saved.ok) throw new Error("setup");
    const deleted = await deleteTaskDependency(saved.dependency.id);
    expect(deleted).toMatchObject({ ok: true, dependency: { predecessorTaskId: "a", successorTaskId: "b", lagDays: 2 } });
    await expect(deleteTaskDependency(saved.dependency.id)).resolves.toEqual({ ok: false, code: "not-found" });
  });

  it("reports a stale preview and a missing change set as codes", async () => {
    await expect(applyPortfolioScheduleChange({
      entityType: "task",
      entityId: "a",
      operation: "move",
      startDate: "2026-09-02",
      dueDate: "2026-09-06",
      expectedPreview: { changes: [] },
    })).resolves.toEqual({ ok: false, code: "stale" });
    await expect(revertPortfolioScheduleChange("missing")).resolves.toEqual({ ok: false, code: "unavailable" });
    await expect(reapplyPortfolioScheduleChange("missing")).resolves.toEqual({ ok: false, code: "unavailable" });
  });

  it("reports an invalid fit and a blocked undo as codes", async () => {
    const applied = await applyPortfolioScheduleChange({ entityType: "task", entityId: "b", operation: "fit" })
      .catch(() => null);
    expect(applied).toEqual({ ok: false, code: "invalid" });
    const moved = await applyPortfolioScheduleChange({
      entityType: "task",
      entityId: "q1",
      operation: "move",
      startDate: "2026-09-13",
      dueDate: "2026-09-16",
      expectedPreview: {
        changes: [{
          entityType: "task", entityId: "q1",
          beforeStartDate: "2026-09-12", beforeDueDate: "2026-09-15",
          afterStartDate: "2026-09-13", afterDueDate: "2026-09-16",
        }],
      },
    });
    if (!moved.ok || !moved.changeSetId) throw new Error("setup");
    db.update(tasks).set({ startDate: "2026-09-14" }).where(eq(tasks.id, "q1")).run();
    await expect(revertPortfolioScheduleChange(moved.changeSetId)).resolves.toEqual({ ok: false, code: "blocked" });
  });

  it("reports nesting under a milestone as a hierarchy code", async () => {
    db.update(tasks).set({ isMilestone: true }).where(eq(tasks.id, "a")).run();
    await expect(reparentTask({ taskId: "b", parentTaskId: "a" })).resolves.toEqual({ ok: false, code: "hierarchy" });
  });
});

describe("project-level successors in the timeline apply path", () => {
  const moveA = {
    entityType: "task" as const,
    entityId: "a",
    operation: "move" as const,
    startDate: "2026-09-08",
    dueDate: "2026-09-12",
  };
  const coreChanges = [
    { entityType: "task" as const, entityId: "a", beforeStartDate: "2026-09-01", beforeDueDate: "2026-09-05", afterStartDate: "2026-09-08", afterDueDate: "2026-09-12" },
    { entityType: "project" as const, entityId: "p", beforeStartDate: "2026-09-01", beforeDueDate: "2026-09-10", afterStartDate: "2026-09-01", afterDueDate: "2026-09-12" },
  ];

  it("pushes a successor project, records it in the change set, and undoes and redoes it", async () => {
    db.insert(projectDependencies).values({ predecessorType: "project", predecessorId: "p", successorProjectId: "q" }).run();
    // The timeline previews without project links; the server accepts that
    // expectation and adds the pushed successor on top.
    const result = await applyPortfolioScheduleChange({ ...moveA, expectedPreview: { changes: coreChanges } });
    if (!result.ok || !result.changeSetId) throw new Error(`apply failed: ${JSON.stringify(result)}`);
    expect(project("p").targetEndDate).toBe("2026-09-12");
    expect(project("q")).toMatchObject({ plannedStartDate: "2026-09-13", targetEndDate: "2026-09-21" });
    expect(task("q1")).toMatchObject({ startDate: "2026-09-13", dueDate: "2026-09-16" });
    expect(result.changes.map((change) => `${change.entityType}:${change.entityId}`).sort())
      .toEqual(["project:p", "project:q", "task:a", "task:q1"]);

    await expect(revertPortfolioScheduleChange(result.changeSetId)).resolves.toEqual({ ok: true });
    expect(project("q")).toMatchObject({ plannedStartDate: "2026-09-12", targetEndDate: "2026-09-20" });
    expect(task("q1")).toMatchObject({ startDate: "2026-09-12", dueDate: "2026-09-15" });

    await expect(reapplyPortfolioScheduleChange(result.changeSetId)).resolves.toEqual({ ok: true });
    expect(task("q1")).toMatchObject({ startDate: "2026-09-13", dueDate: "2026-09-16" });
  });

  it("pushes a task that follows a project", async () => {
    db.insert(projectTaskDependencies).values({ predecessorProjectId: "p", successorTaskId: "q1" }).run();
    const result = await applyPortfolioScheduleChange({ ...moveA, expectedPreview: { changes: coreChanges } });
    if (!result.ok) throw new Error(`apply failed: ${JSON.stringify(result)}`);
    expect(task("q1")).toMatchObject({ startDate: "2026-09-13", dueDate: "2026-09-16" });
    expect(project("q").targetEndDate).toBe("2026-09-20");
  });

  it("leaves successors with enough slack alone", async () => {
    db.insert(projectDependencies).values({ predecessorType: "project", predecessorId: "p", successorProjectId: "q" }).run();
    const result = await applyPortfolioScheduleChange({
      ...moveA,
      startDate: "2026-09-02",
      dueDate: "2026-09-06",
      expectedPreview: {
        changes: [{ entityType: "task", entityId: "a", beforeStartDate: "2026-09-01", beforeDueDate: "2026-09-05", afterStartDate: "2026-09-02", afterDueDate: "2026-09-06" }],
      },
    });
    expect(result.ok).toBe(true);
    expect(project("q").plannedStartDate).toBe("2026-09-12");
  });
});

describe("deleteTaskKeepChildren", () => {
  beforeEach(() => {
    db.insert(tasks).values([
      { id: "c1", title: "c1", projectId: "p", columnId: "col-p", parentTaskId: "b", createdBy: "actor", sortOrder: 1000, startDate: "2026-09-06", dueDate: "2026-09-07" },
      { id: "c2", title: "c2", projectId: "p", columnId: "col-p", parentTaskId: "b", createdBy: "actor", sortOrder: 2000, startDate: "2026-09-08", dueDate: "2026-09-10" },
      { id: "z", title: "z", projectId: "p", columnId: "col-p", createdBy: "actor", sortOrder: 3000 },
    ]).run();
  });

  it("lifts the children into the deleted task's place in one step", async () => {
    await expect(deleteTaskKeepChildren("b")).resolves.toEqual({ ok: true, movedChildIds: ["c1", "c2"] });
    expect(db.select().from(tasks).where(eq(tasks.id, "b")).get()).toBeUndefined();
    const roots = db.select().from(tasks).where(eq(tasks.projectId, "p")).all()
      .filter((row) => row.parentTaskId === null)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((row) => row.id);
    expect(roots).toEqual(["a", "c1", "c2", "z"]);
    expect(task("c1").startDate).toBe("2026-09-06");
  });

  it("keeps links of the lifted children and reports a missing task", async () => {
    db.insert(taskDependencies).values({ predecessorTaskId: "a", successorTaskId: "c1" }).run();
    await deleteTaskKeepChildren("b");
    expect(db.select().from(taskDependencies).all()).toHaveLength(1);
    await expect(deleteTaskKeepChildren("b")).resolves.toEqual({ ok: false, code: "not-found" });
  });
});
