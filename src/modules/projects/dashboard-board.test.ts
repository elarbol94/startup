import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

vi.mock("@/lib/auth", () => ({ requireUserOrThrow: vi.fn(async () => ({ id: "actor" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) =>
    ({ colOpen: "Offen", colInProgress: "In Arbeit", colDone: "Erledigt" })[key] ?? key),
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

import { db, sqlite } from "@/db";
import { projectColumns, projects, tasks, user } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { moveDashboardTask, moveTask, upsertColumn, upsertContextualTask } from "./actions";
import { listTaskOverview } from "./queries";

const row = (id: string) => db.select().from(tasks).where(eq(tasks.id, id)).get()!;
const overview = () => listTaskOverview({ includeProjects: true, status: "all" });
beforeEach(() => {
  vi.clearAllMocks();
  sqlite.exec("DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;");
  db.insert(user).values({ id: "actor", name: "Actor", email: "actor@example.com", createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().run();
  db.insert(projects).values({ id: "p", name: "Project", createdBy: "actor" }).run();
  db.insert(projectColumns).values([
    { id: "todo", name: "Backlog", projectId: "p", sortOrder: 1 },
    { id: "doing", name: "Review", projectId: "p", sortOrder: 2, workflowStage: "in_progress" },
    { id: "done", name: "Delivered", projectId: "p", sortOrder: 3, isCompleted: true },
  ]).run();
});

describe("dashboard workflow", () => {
  it("migrates existing custom columns without changing task data", () => {
    const legacy = new Database(":memory:");
    legacy.exec(`CREATE TABLE project_columns (id TEXT PRIMARY KEY, project_id TEXT, name TEXT, sort_order INTEGER, is_completed INTEGER);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, progress INTEGER);
      INSERT INTO project_columns VALUES ('a','p','Inbox',1,0),('b','p','Review',2,0),('c','p','Shipped',3,1);
      INSERT INTO tasks VALUES ('t','Keep me','done',100);`);
    legacy.exec(readFileSync("drizzle/0063_flaky_aaron_stack.sql", "utf8"));
    expect(legacy.prepare("SELECT workflow_stage FROM project_columns ORDER BY id").all()).toEqual([
      { workflow_stage: "todo" }, { workflow_stage: "in_progress" }, { workflow_stage: "todo" },
    ]);
    expect(legacy.prepare("SELECT * FROM tasks").get()).toEqual({ id: "t", title: "Keep me", status: "done", progress: 100, workflow_stage: "todo" });
    legacy.close();
  });
  it("persists standalone stages through editing, completion and reopening", async () => {
    const { id } = await upsertContextualTask({ title: "Standalone", assigneeIds: ["actor"], workflowStage: "in_progress" });
    await upsertContextualTask({ id, title: "Edited" });
    expect(overview()[0].boardStage).toBe("in_progress");
    await moveDashboardTask({ taskId: id, stage: "done" });
    expect(row(id).completedAt).not.toBeNull();
    expect(row(id).progress).toBe(100);
    await moveDashboardTask({ taskId: id, stage: "todo" });
    expect(row(id)).toMatchObject({ status: "open", workflowStage: "todo", completedAt: null });
    expect(listTaskOverview({ includeProjects: true, assigneeId: "actor" })).toHaveLength(1);
    expect(listTaskOverview({ includeProjects: true, assigneeId: "unassigned" })).toHaveLength(0);
  });
  it("maps custom project columns in both directions without duplicate cards", async () => {
    const { id } = await upsertContextualTask({ title: "Project task", projectId: "p" });
    await moveDashboardTask({ taskId: id, stage: "in_progress" });
    expect(row(id).columnId).toBe("doing");
    await moveTask({ taskId: id, columnId: "done", afterTaskId: null });
    expect(overview()).toHaveLength(1);
    expect(overview()[0].boardStage).toBe("done");
    await moveDashboardTask({ taskId: id, stage: "todo" });
    expect(row(id).columnId).toBe("todo");
    expect(row(id).completedAt).toBeNull();
    await upsertColumn({ id: "todo", projectId: "p", name: "Backlog", workflowStage: "in_progress" });
    expect(overview()[0].boardStage).toBe("in_progress");
    expect(listTaskOverview()).toHaveLength(0); // Existing personal metrics retain their scope.
  });
  it("creates a missing stage once without changing existing column names", async () => {
    db.delete(projectColumns).where(eq(projectColumns.id, "doing")).run();
    const first = await upsertContextualTask({ title: "First", projectId: "p", workflowStage: "in_progress" });
    const second = await upsertContextualTask({ title: "Second", projectId: "p", workflowStage: "in_progress" });
    expect(row(first.id).columnId).toBe(row(second.id).columnId);
    expect(db.select().from(projectColumns).all()).toHaveLength(3);
    expect(db.select().from(projectColumns).where(eq(projectColumns.id, "todo")).get()?.name).toBe("Backlog");
  });
  it("does not complete a parent until all subtasks are done and rolls up child moves", async () => {
    db.insert(tasks).values([
      { id: "parent", title: "Parent", projectId: "p", columnId: "todo", createdBy: "actor" },
      { id: "child", title: "Child", parentTaskId: "parent", projectId: "p", columnId: "doing", createdBy: "actor" },
    ]).run();
    await expect(moveDashboardTask({ taskId: "parent", stage: "done" })).rejects.toThrow("subtasks");
    expect(row("parent").columnId).toBe("todo");
    await expect(upsertContextualTask({ id: "parent", title: "Parent", status: "done" })).rejects.toThrow("subtasks");
    await moveDashboardTask({ taskId: "child", stage: "done" });
    expect(row("parent").status).toBe("done");
    await moveDashboardTask({ taskId: "child", stage: "in_progress" });
    expect(row("parent").status).toBe("open");
  });
  it("rejects invalid, deadline and unauthenticated moves without changes", async () => {
    db.insert(tasks).values({ id: "deadline", title: "Deadline", kind: "deadline", createdBy: "actor" }).run();
    await expect(moveDashboardTask({ taskId: "deadline", stage: "done" })).rejects.toThrow();
    await expect(moveDashboardTask({ taskId: "missing", stage: "todo" })).rejects.toThrow();
    await expect(moveDashboardTask({ taskId: "deadline", stage: "invalid" as never })).rejects.toThrow();
    vi.mocked(requireUserOrThrow).mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(moveDashboardTask({ taskId: "deadline", stage: "done" })).rejects.toThrow("Unauthorized");
    expect(row("deadline").status).toBe("open");
    expect(overview()).toHaveLength(0);
  });
  it("rolls back a new project stage if task creation fails validation", async () => {
    db.delete(projectColumns).where(eq(projectColumns.id, "doing")).run();
    await expect(upsertContextualTask({ title: "Invalid assignment", projectId: "p", workflowStage: "in_progress", assigneeIds: ["missing"] })).rejects.toThrow();
    expect(db.select().from(projectColumns).all()).toHaveLength(2);
    expect(overview()).toHaveLength(0);
  });
});
