import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

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
import { projectColumns, projects, tasks, user } from "@/db/schema";
import { deleteColumn, moveTask, upsertColumn } from "./board-actions";
import { upsertTask } from "./task-actions";
import { moveColumn } from "./column-actions";
import { ProjectArchivedError, assertProjectEditable } from "./guards";

function columnOrder(projectId: string) {
  return db
    .select({ id: projectColumns.id, sortOrder: projectColumns.sortOrder })
    .from(projectColumns)
    .where(eq(projectColumns.projectId, projectId))
    .orderBy(asc(projectColumns.sortOrder))
    .all();
}

function archive() {
  db.update(projects).set({ status: "archived" }).where(eq(projects.id, "p")).run();
}

beforeEach(() => {
  sqlite.exec("DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;");
  db.insert(user).values({ id: "actor", name: "Actor", email: "actor@example.com", createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().run();
  db.insert(projects).values({ id: "p", name: "P", createdBy: "actor" }).run();
  db.insert(projectColumns).values([
    { id: "todo", name: "Todo", projectId: "p", sortOrder: 1000 },
    { id: "doing", name: "Doing", projectId: "p", sortOrder: 2000 },
    { id: "done", name: "Done", projectId: "p", sortOrder: 3000, isCompleted: true },
  ]).run();
  db.insert(tasks).values({ id: "t", title: "Task", projectId: "p", columnId: "todo", createdBy: "actor", sortOrder: 1000 }).run();
});

describe("archived project guard", () => {
  it("passes active and unknown projects", () => {
    expect(() => assertProjectEditable("p")).not.toThrow();
    expect(() => assertProjectEditable("missing")).not.toThrow();
    expect(() => assertProjectEditable(null)).not.toThrow();
  });

  it("rejects task and column changes once the project is archived", async () => {
    archive();
    expect(() => assertProjectEditable("p")).toThrow(ProjectArchivedError);
    await expect(upsertTask({ projectId: "p", columnId: "todo", title: "New" })).rejects.toThrow(ProjectArchivedError);
    await expect(upsertTask({ id: "t", projectId: "p", columnId: "todo", title: "Renamed" })).rejects.toThrow(ProjectArchivedError);
    await expect(moveTask({ taskId: "t", columnId: "doing", afterTaskId: null })).rejects.toThrow(ProjectArchivedError);
    await expect(upsertColumn({ projectId: "p", name: "Extra" })).rejects.toThrow(ProjectArchivedError);
    await expect(upsertColumn({ id: "todo", projectId: "p", name: "Renamed" })).rejects.toThrow(ProjectArchivedError);
    await expect(deleteColumn("doing")).rejects.toThrow(ProjectArchivedError);
    await expect(moveColumn({ columnId: "doing", direction: "left" })).rejects.toThrow(ProjectArchivedError);

    const task = db.select().from(tasks).where(eq(tasks.id, "t")).get();
    expect(task).toMatchObject({ title: "Task", columnId: "todo" });
    expect(db.select().from(tasks).all()).toHaveLength(1);
    expect(columnOrder("p").map((column) => column.id)).toEqual(["todo", "doing", "done"]);
    expect(db.select().from(projectColumns).where(eq(projectColumns.id, "todo")).get()?.name).toBe("Todo");
  });

  it("still allows board changes on active projects", async () => {
    await moveTask({ taskId: "t", columnId: "doing", afterTaskId: null });
    await upsertColumn({ id: "todo", projectId: "p", name: "Backlog" });
    expect(db.select().from(tasks).where(eq(tasks.id, "t")).get()?.columnId).toBe("doing");
    expect(db.select().from(projectColumns).where(eq(projectColumns.id, "todo")).get()?.name).toBe("Backlog");
  });
});

describe("moveColumn", () => {
  it("swaps with the neighbour and renumbers the project's columns", async () => {
    await expect(moveColumn({ columnId: "done", direction: "left" })).resolves.toEqual({ moved: true });
    expect(columnOrder("p")).toEqual([
      { id: "todo", sortOrder: 1000 },
      { id: "done", sortOrder: 2000 },
      { id: "doing", sortOrder: 3000 },
    ]);
    await moveColumn({ columnId: "todo", direction: "right" });
    expect(columnOrder("p").map((column) => column.id)).toEqual(["done", "todo", "doing"]);
  });

  it("is a no-op at the edges", async () => {
    await expect(moveColumn({ columnId: "todo", direction: "left" })).resolves.toEqual({ moved: false });
    await expect(moveColumn({ columnId: "done", direction: "right" })).resolves.toEqual({ moved: false });
    expect(columnOrder("p").map((column) => column.id)).toEqual(["todo", "doing", "done"]);
  });

  it("heals duplicate sort orders and leaves other projects untouched", async () => {
    db.insert(projects).values({ id: "q", name: "Q", createdBy: "actor" }).run();
    db.insert(projectColumns).values({ id: "other", name: "Other", projectId: "q", sortOrder: 1500 }).run();
    db.update(projectColumns).set({ sortOrder: 0 }).where(eq(projectColumns.projectId, "p")).run();
    // Ties fall back to id order (doing, done, todo).
    await expect(moveColumn({ columnId: "todo", direction: "left" })).resolves.toEqual({ moved: true });
    expect(columnOrder("p").map((column) => column.id)).toEqual(["doing", "todo", "done"]);
    expect(new Set(columnOrder("p").map((column) => column.sortOrder)).size).toBe(3);
    expect(columnOrder("q")).toEqual([{ id: "other", sortOrder: 1500 }]);
  });

  it("rejects unknown columns", async () => {
    await expect(moveColumn({ columnId: "missing", direction: "left" })).rejects.toThrow();
  });
});
