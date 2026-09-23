import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ requireUserOrThrow: vi.fn(async () => ({ id: "actor" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) =>
    ({ colOpen: "Open", colInProgress: "In progress", colDone: "Done" })[key] ?? key),
}));
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

import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import { contextLinks, projectColumns, projectDependencies, projects, taskDependencies, tasks, user } from "@/db/schema";
import {
  deleteColumn,
  deleteTask,
  deleteTaskDependency,
  moveDashboardTask,
  moveTask,
  setTaskStatus,
  upsertColumn,
} from "./actions";
import { deleteProjectSideRows } from "./cleanup";
import { pickColumnDeletionTarget } from "./column-rules";

const row = (id: string) => db.select().from(tasks).where(eq(tasks.id, id)).get()!;
const earlier = new Date("2026-01-02T10:00:00Z");

function insertTask(values: Partial<typeof tasks.$inferInsert> & { id: string }) {
  db.insert(tasks).values({ title: values.id, projectId: "p", columnId: "todo", createdBy: "actor", ...values }).run();
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlite.exec("DELETE FROM context_links; DELETE FROM project_dependencies; DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;");
  db.insert(user).values({ id: "actor", name: "Actor", email: "actor@example.com", createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().run();
  db.insert(projects).values([
    { id: "p", name: "Project", createdBy: "actor" },
    { id: "q", name: "Other", createdBy: "actor" },
  ]).run();
  db.insert(projectColumns).values([
    { id: "todo", name: "Offen", projectId: "p", sortOrder: 1000, workflowStage: "todo" },
    { id: "doing", name: "In Arbeit", projectId: "p", sortOrder: 2000, workflowStage: "in_progress" },
    { id: "done", name: "Erledigt", projectId: "p", sortOrder: 3000, isCompleted: true },
  ]).run();
});

describe("pickColumnDeletionTarget", () => {
  const columns = [
    { id: "a", isCompleted: false, workflowStage: "todo", sortOrder: 1 },
    { id: "b", isCompleted: false, workflowStage: "in_progress", sortOrder: 2 },
    { id: "c", isCompleted: false, workflowStage: "in_progress", sortOrder: 3 },
    { id: "d", isCompleted: true, workflowStage: "todo", sortOrder: 4 },
  ];
  it("prefers a column with the same meaning", () => {
    expect(pickColumnDeletionTarget(columns[2], columns)?.id).toBe("b");
    expect(pickColumnDeletionTarget(columns[1], columns)?.id).toBe("c");
    expect(pickColumnDeletionTarget(columns[3], [...columns, { id: "e", isCompleted: true, workflowStage: "todo", sortOrder: 5 }])?.id).toBe("e");
  });
  it("falls back to the open column nearest to done, then to anything left", () => {
    expect(pickColumnDeletionTarget(columns[3], columns)?.id).toBe("c");
    expect(pickColumnDeletionTarget(columns[0], [columns[0], columns[3]])?.id).toBe("d");
    expect(pickColumnDeletionTarget(columns[0], [columns[0]])).toBeUndefined();
  });
});

describe("column completion sync", () => {
  it("reopens done tasks when their completed column is deleted", async () => {
    insertTask({ id: "shipped", columnId: "done", status: "done", progress: 100, completedAt: earlier });
    insertTask({ id: "working", columnId: "doing", progress: 40 });
    await deleteColumn("done");
    expect(row("shipped")).toMatchObject({ columnId: "doing", status: "open", completedAt: null, progress: 99, lastOpenColumnId: "doing" });
    expect(row("working")).toMatchObject({ status: "open", progress: 40 });
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("keeps done tasks done when another completed column remains", async () => {
    db.insert(projectColumns).values({ id: "archive", name: "Archiv", projectId: "p", sortOrder: 4000, isCompleted: true }).run();
    insertTask({ id: "shipped", columnId: "done", status: "done", progress: 100, completedAt: earlier });
    await deleteColumn("done");
    expect(row("shipped")).toMatchObject({ columnId: "archive", status: "done", progress: 100, completedAt: earlier });
  });

  it("moves tasks of a deleted open column to one with the same stage", async () => {
    db.insert(projectColumns).values({ id: "review", name: "Review", projectId: "p", sortOrder: 2500, workflowStage: "in_progress" }).run();
    insertTask({ id: "t", columnId: "review", progress: 30 });
    await deleteColumn("review");
    expect(row("t")).toMatchObject({ columnId: "doing", status: "open", progress: 30 });
  });

  it("updates parent summaries after a column delete reopens a child", async () => {
    insertTask({ id: "parent", columnId: "done", status: "done", progress: 100, completedAt: earlier });
    insertTask({ id: "child", parentTaskId: "parent", columnId: "done", status: "done", progress: 100, completedAt: earlier });
    await deleteColumn("done");
    expect(row("parent")).toMatchObject({ status: "open", completedAt: null });
    expect(row("parent").progress).toBeLessThan(100);
  });

  it("completes and reopens the tasks of a column whose completed flag toggles", async () => {
    insertTask({ id: "open", columnId: "doing", progress: 20 });
    insertTask({ id: "stale", columnId: "doing", status: "done", progress: 100, completedAt: earlier });
    await upsertColumn({ id: "doing", projectId: "p", name: "In Arbeit", isCompleted: true });
    expect(row("open")).toMatchObject({ status: "done", progress: 100 });
    expect(row("open").completedAt).not.toBeNull();
    expect(row("stale").completedAt).toEqual(earlier);
    await upsertColumn({ id: "doing", projectId: "p", name: "In Arbeit", isCompleted: false });
    expect(row("open")).toMatchObject({ status: "open", completedAt: null, progress: 99, lastOpenColumnId: "doing" });
  });

  it("rejects empty ids", async () => {
    await expect(deleteColumn("")).rejects.toThrow();
    await expect(upsertColumn({ id: "", projectId: "p", name: "X" })).rejects.toThrow();
    await expect(deleteTaskDependency("")).rejects.toThrow();
  });
});

describe("moveTask status fields", () => {
  it("keeps the completion time when a done task is reordered", async () => {
    insertTask({ id: "a", columnId: "done", status: "done", progress: 100, completedAt: earlier, sortOrder: 1000 });
    insertTask({ id: "b", columnId: "done", status: "done", progress: 100, completedAt: earlier, sortOrder: 2000 });
    await moveTask({ taskId: "a", columnId: "done", afterTaskId: "b" });
    expect(row("a")).toMatchObject({ status: "done", completedAt: earlier, sortOrder: 3000 });
  });

  it("stamps completion only when a task becomes done and remembers its open column", async () => {
    insertTask({ id: "a", columnId: "doing", progress: 50 });
    await moveTask({ taskId: "a", columnId: "done", afterTaskId: null });
    expect(row("a")).toMatchObject({ status: "done", progress: 100, lastOpenColumnId: "doing" });
    expect(row("a").completedAt).not.toBeNull();
  });

  it("caps progress below 100 when a task leaves the completed column", async () => {
    insertTask({ id: "a", columnId: "done", status: "done", progress: 100, completedAt: earlier });
    await moveTask({ taskId: "a", columnId: "todo", afterTaskId: null });
    expect(row("a")).toMatchObject({ status: "open", completedAt: null, progress: 99, lastOpenColumnId: "todo" });
  });

  it("does not change the progress of an open task moved between open columns", async () => {
    insertTask({ id: "a", columnId: "todo", progress: 100 });
    await moveTask({ taskId: "a", columnId: "doing", afterTaskId: null });
    expect(row("a")).toMatchObject({ status: "open", progress: 100 });
  });
});

describe("setTaskStatus", () => {
  it("validates input", async () => {
    await expect(setTaskStatus("", "done")).rejects.toThrow();
    insertTask({ id: "a" });
    await expect(setTaskStatus("a", "closed" as never)).rejects.toThrow();
    expect(row("a").status).toBe("open");
  });

  it("refuses to complete a parent with open subtasks", async () => {
    insertTask({ id: "parent" });
    insertTask({ id: "child", parentTaskId: "parent", columnId: "doing" });
    await expect(setTaskStatus("parent", "done")).rejects.toThrow("subtasks");
    expect(row("parent").status).toBe("open");
  });

  it("rolls the change up to ancestors and keeps an earlier completion time", async () => {
    insertTask({ id: "parent" });
    insertTask({ id: "child", parentTaskId: "parent", columnId: "doing", progress: 10 });
    await setTaskStatus("child", "done");
    expect(row("child")).toMatchObject({ status: "done", columnId: "done", lastOpenColumnId: "doing" });
    expect(row("parent")).toMatchObject({ status: "done", columnId: "done", progress: 100 });
    await setTaskStatus("child", "open");
    expect(row("child")).toMatchObject({ status: "open", columnId: "doing", progress: 99 });
    expect(row("parent").status).toBe("open");

    db.update(tasks).set({ status: "done", columnId: "done", completedAt: earlier, progress: 100 }).where(eq(tasks.id, "child")).run();
    await setTaskStatus("child", "done");
    expect(row("child").completedAt).toEqual(earlier);
  });
});

describe("dashboard stage columns", () => {
  it("creates missing stage columns with localised names", async () => {
    db.delete(projectColumns).where(eq(projectColumns.id, "done")).run();
    insertTask({ id: "a" });
    await moveDashboardTask({ taskId: "a", stage: "done" });
    const created = db.select().from(projectColumns).where(and(eq(projectColumns.projectId, "p"), eq(projectColumns.isCompleted, true))).get();
    expect(created?.name).toBe("Done");
    expect(row("a").columnId).toBe(created?.id);
  });
});

describe("delete side rows", () => {
  it("removes project dependencies and context links of a deleted task subtree", async () => {
    insertTask({ id: "parent" });
    insertTask({ id: "child", parentTaskId: "parent" });
    insertTask({ id: "keep" });
    db.insert(projectDependencies).values([
      { predecessorType: "task", predecessorId: "parent", successorProjectId: "q" },
      { predecessorType: "task", predecessorId: "child", successorProjectId: "q" },
      { predecessorType: "task", predecessorId: "keep", successorProjectId: "q" },
    ]).run();
    db.insert(contextLinks).values([
      { ownerType: "task", ownerId: "child", targetType: "app", route: "/", createdBy: "actor" },
      { ownerType: "task", ownerId: "keep", targetType: "app", route: "/", createdBy: "actor" },
    ]).run();
    await deleteTask("parent");
    expect(db.select().from(projectDependencies).all().map((dependency) => dependency.predecessorId)).toEqual(["keep"]);
    expect(db.select().from(contextLinks).all().map((link) => link.ownerId)).toEqual(["keep"]);
  });

  it("removes a project's polymorphic side rows", () => {
    insertTask({ id: "t" });
    db.insert(projectDependencies).values([
      { predecessorType: "project", predecessorId: "p", successorProjectId: "q" },
      { predecessorType: "task", predecessorId: "t", successorProjectId: "q" },
    ]).run();
    db.insert(contextLinks).values([
      { ownerType: "project", ownerId: "p", targetType: "app", route: "/", createdBy: "actor" },
      { ownerType: "task", ownerId: "t", targetType: "app", route: "/", createdBy: "actor" },
    ]).run();
    db.transaction((tx) => deleteProjectSideRows(tx, "p"));
    expect(db.select().from(projectDependencies).all()).toHaveLength(0);
    expect(db.select().from(contextLinks).all()).toHaveLength(0);
  });

  it("revalidates the project pages of a deleted dependency", async () => {
    insertTask({ id: "a" });
    insertTask({ id: "b" });
    const dependency = db.insert(taskDependencies).values({ predecessorTaskId: "a", successorTaskId: "b" }).returning().get();
    await deleteTaskDependency(dependency.id);
    expect(db.select().from(taskDependencies).all()).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/projects/p");
  });
});
