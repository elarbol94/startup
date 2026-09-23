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
import { projectColumns, projects, taskDependencies, tasks, user } from "@/db/schema";
import { upsertContextualTask, upsertTask } from "./actions";
import {
  addTaskDependencyFromDialog,
  deleteTaskKeepingSubtasks,
  getTaskDialogDetails,
  moveTaskToProject,
  saveTaskFromDialog,
} from "./task-dialog-actions";

const task = (id: string) => db.select().from(tasks).where(eq(tasks.id, id)).get()!;

beforeEach(() => {
  sqlite.exec(
    "DELETE FROM task_dependencies; DELETE FROM project_task_dependencies; DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;",
  );
  db.insert(user).values({ id: "actor", name: "Actor", email: "actor@example.com", createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().run();
  db.insert(projects).values([
    { id: "p", name: "Source", createdBy: "actor" },
    { id: "q", name: "Target", createdBy: "actor" },
  ]).run();
  db.insert(projectColumns).values([
    { id: "p-todo", projectId: "p", name: "Open", sortOrder: 1, workflowStage: "todo" },
    { id: "p-doing", projectId: "p", name: "Doing", sortOrder: 2, workflowStage: "in_progress" },
    { id: "p-done", projectId: "p", name: "Done", sortOrder: 3, isCompleted: true },
    { id: "q-todo", projectId: "q", name: "Backlog", sortOrder: 1, workflowStage: "todo" },
    { id: "q-doing", projectId: "q", name: "Work", sortOrder: 2, workflowStage: "in_progress" },
    { id: "q-done", projectId: "q", name: "Finished", sortOrder: 3, isCompleted: true },
  ]).run();
  const base = { createdBy: "actor", projectId: "p" };
  db.insert(tasks).values([
    { ...base, id: "root", title: "Root", columnId: "p-doing", sortOrder: 1000, startDate: "2026-01-01", dueDate: "2026-01-20" },
    { ...base, id: "mid", title: "Mid", columnId: "p-doing", parentTaskId: "root", sortOrder: 1000, startDate: "2026-01-01", dueDate: "2026-01-20" },
    { ...base, id: "leaf-a", title: "Leaf A", columnId: "p-doing", parentTaskId: "mid", sortOrder: 1000, startDate: "2026-01-01", dueDate: "2026-01-10", progress: 50 },
    { ...base, id: "leaf-b", title: "Leaf B", columnId: "p-done", parentTaskId: "mid", sortOrder: 2000, startDate: "2026-01-11", dueDate: "2026-01-20", progress: 100, status: "done" },
    { ...base, id: "other", title: "Other", columnId: "p-todo", sortOrder: 2000, startDate: "2026-02-01", dueDate: "2026-02-05" },
    { ...base, id: "q-existing", projectId: "q", title: "Existing", columnId: "q-doing", sortOrder: 1000 },
  ]).run();
});

describe("upsertTask scheduling constraint", () => {
  it("keeps the stored constraint when an edit does not mention it", async () => {
    db.update(tasks).set({ constraintType: "must_start_on", constraintDate: "2026-02-01" }).where(eq(tasks.id, "other")).run();
    await upsertTask({
      id: "other", projectId: "p", columnId: "p-todo", title: "Renamed",
      startDate: "2026-02-01", dueDate: "2026-02-05",
    });
    expect(task("other")).toMatchObject({ title: "Renamed", constraintType: "must_start_on", constraintDate: "2026-02-01" });
  });

  it("still resets the constraint when the edit asks for it", async () => {
    db.update(tasks).set({ constraintType: "start_no_earlier_than", constraintDate: "2026-02-01" }).where(eq(tasks.id, "other")).run();
    await upsertTask({
      id: "other", projectId: "p", columnId: "p-todo", title: "Other",
      startDate: "2026-02-01", dueDate: "2026-02-05", constraintType: "asap",
    });
    expect(task("other")).toMatchObject({ constraintType: "asap", constraintDate: null });
  });

  it("reports a start without a due date as a code", async () => {
    const result = await saveTaskFromDialog({
      id: "other", projectId: "p", columnId: "p-todo", title: "Other", startDate: "2026-02-01", dueDate: null,
    });
    expect(result).toEqual({ ok: false, code: "dates_together" });
  });
});

describe("moveTaskToProject", () => {
  it("moves a subtree, matches columns by stage, keeps links and re-rolls the old parent", async () => {
    db.insert(taskDependencies).values({ id: "link", predecessorTaskId: "other", successorTaskId: "leaf-a" }).run();
    const result = await moveTaskToProject({ taskId: "mid", projectId: "q" });
    expect(result).toEqual({ ok: true, projectId: "q" });

    expect(task("mid")).toMatchObject({ projectId: "q", parentTaskId: null, columnId: "q-doing" });
    expect(task("mid").sortOrder).toBeGreaterThan(task("q-existing").sortOrder);
    expect(task("leaf-a")).toMatchObject({ projectId: "q", parentTaskId: "mid", columnId: "q-doing" });
    expect(task("leaf-b")).toMatchObject({ projectId: "q", parentTaskId: "mid", columnId: "q-done", status: "done" });
    expect(task("mid").progress).toBe(75);
    expect(db.select().from(taskDependencies).all()).toHaveLength(1);
    const target = db.select().from(projects).where(eq(projects.id, "q")).get()!;
    expect(target).toMatchObject({ plannedStartDate: "2026-01-01", targetEndDate: "2026-01-20" });
    // "root" lost its only child and keeps its dates as an ordinary task.
    expect(task("root")).toMatchObject({ projectId: "p", startDate: "2026-01-01", dueDate: "2026-01-20" });
  });

  it("rejects an archived target without changing anything", async () => {
    db.update(projects).set({ status: "archived" }).where(eq(projects.id, "q")).run();
    expect(await moveTaskToProject({ taskId: "root", projectId: "q" })).toEqual({ ok: false, code: "project_archived" });
    expect(task("leaf-a").projectId).toBe("p");
  });

  it("is reused by upsertContextualTask, and null detaches a plain task", async () => {
    await upsertContextualTask({ id: "root", title: "Root", projectId: "q", status: "open" });
    expect(["root", "mid", "leaf-a", "leaf-b"].map((id) => task(id).projectId)).toEqual(["q", "q", "q", "q"]);
    expect(task("mid").parentTaskId).toBe("root");

    await expect(upsertContextualTask({ id: "root", title: "Root", projectId: null })).rejects.toThrow("detach_has_subtasks");
    await upsertContextualTask({ id: "other", title: "Other", projectId: null });
    expect(task("other")).toMatchObject({ projectId: null, columnId: null, parentTaskId: null });

    // Omitting the project keeps it.
    await upsertContextualTask({ id: "root", title: "Root again" });
    expect(task("root").projectId).toBe("q");
  });
});

describe("deleteTaskKeepingSubtasks", () => {
  it("lifts the children into the deleted task's place in one step", async () => {
    await deleteTaskKeepingSubtasks("mid");
    expect(db.select().from(tasks).where(eq(tasks.id, "mid")).get()).toBeUndefined();
    expect(task("leaf-a").parentTaskId).toBe("root");
    expect(task("leaf-b").parentTaskId).toBe("root");
    expect(task("leaf-a").sortOrder).toBeLessThan(task("leaf-b").sortOrder);
  });
});

describe("dialog dependencies", () => {
  it("reports cycles as a code and lists links in both directions", async () => {
    expect(await addTaskDependencyFromDialog({ predecessorTaskId: "other", successorTaskId: "q-existing" })).toEqual({ ok: true });
    expect(await addTaskDependencyFromDialog({ predecessorTaskId: "q-existing", successorTaskId: "other" }))
      .toEqual({ ok: false, code: "dependency_cycle" });
    const details = await getTaskDialogDetails("other");
    expect(details.successors).toMatchObject([{ taskId: "q-existing", projectName: "Target" }]);
    expect(details.linkableTasks.map((row) => row.id)).not.toContain("other");
    expect((await getTaskDialogDetails("root")).descendantCount).toBe(3);
  });
});
