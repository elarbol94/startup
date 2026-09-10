import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
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
import { projectColumns, projects, taskAssignees, tasks, user, wikiNotifications } from "@/db/schema";
import { upsertTask, upsertContextualTask, upsertContextualDeadline } from "./actions";
import { getBoard, getPersonalWorkSummary, getPortfolioSchedule, listDeadlineOverview, listMyTasks, listTaskOverview, listTasksForContext } from "./queries";
import { listCalendarWorkspace } from "@/modules/calendar/queries";

const taskInput = { title: "Shared task", assigneeIds: ["alice", "bob"], dueDate: "2026-09-09" };
const boardInput = { ...taskInput, startDate: "2026-09-08", projectId: "project", columnId: "column" };
function assignedIds(id: string) {
  return db.select().from(taskAssignees).where(eq(taskAssignees.taskId, id)).all().map((row) => row.userId).sort();
}
function notifications(id: string) {
  return db.select().from(wikiNotifications).where(eq(wikiNotifications.taskId, id)).all().map((row) => row.userId).sort();
}

beforeEach(() => {
  sqlite.exec("DELETE FROM wiki_notifications; DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;");
  for (const id of ["actor", "alice", "bob", "removed"]) {
    db.insert(user).values({ id, name: id, email: `${id}@example.com`, createdAt: new Date(), updatedAt: new Date(), removedAt: id === "removed" ? new Date() : null }).onConflictDoNothing().run();
  }
  db.insert(projects).values({ id: "project", name: "Test project", createdBy: "actor" }).run();
  db.insert(projectColumns).values({ id: "column", projectId: "project", name: "Open" }).run();
});

describe("task assignees", () => {
  it("persists multiple people across contextual edits, filters and calendar without duplicate tasks", async () => {
    const context = { type: "app" as const, entityId: "/", route: "/", label: "Overview" };
    const { id } = await upsertContextualTask({ ...taskInput, context });
    expect(assignedIds(id)).toEqual(["alice", "bob"]);
    for (const assigneeId of ["alice", "bob", "all"]) {
      const rows = listTaskOverview({ assigneeId });
      expect(rows).toHaveLength(1);
      expect(rows[0].assignees).toEqual([{ id: "alice", name: "alice" }, { id: "bob", name: "bob" }]);
      expect(rows[0].assigneeName).toBe("alice, bob");
    }
    expect(listTaskOverview({ assigneeId: "unassigned" })).toHaveLength(0);
    expect(getPersonalWorkSummary("bob").openTaskCount).toBe(1);
    expect(listTasksForContext("app", "/")[0].assigneeIds).toEqual(["alice", "bob"]);
    const calendar = listCalendarWorkspace({ userId: "actor", from: "2026-09-07", to: "2026-09-14" });
    const items = calendar.items.filter((item) => item.sourceId === id);
    expect(items).toHaveLength(1);
    expect(items[0].attendeeIds).toEqual(["alice", "bob"]);
    expect(items[0].assigneeName).toBe("alice, bob");
    await upsertContextualTask({ id, title: "Renamed" });
    expect(assignedIds(id)).toEqual(["alice", "bob"]);
    expect(notifications(id)).toEqual(["alice", "bob"]);
    await upsertContextualTask({ ...taskInput, id, assigneeIds: [] });
    expect(listTaskOverview({ assigneeId: "unassigned" })).toHaveLength(1);
    expect(listTaskOverview({ assigneeId: "alice" })).toHaveLength(0);
  });

  it("keeps Gantt and Kanban edits consistent and notifies only newly assigned people", async () => {
    const { id } = await upsertTask({ ...boardInput, assigneeIds: ["actor", "alice", "alice"] });
    expect(assignedIds(id)).toEqual(["actor", "alice"]);
    expect(notifications(id)).toEqual(["alice"]);
    await upsertTask({ ...boardInput, id, assigneeIds: ["alice", "actor", "bob"] });
    expect(notifications(id)).toEqual(["alice", "bob"]);
    expect(getBoard("project").tasksByColumn.column[0].assigneeIds).toEqual(["actor", "alice", "bob"]);
    expect(getPortfolioSchedule().tasks[0].assignees).toHaveLength(3);
    expect(listMyTasks("bob")).toHaveLength(1);
    await upsertTask({ ...boardInput, id, assigneeIds: undefined, title: "Title only" });
    expect(assignedIds(id)).toEqual(["actor", "alice", "bob"]);
    await upsertContextualTask({ ...taskInput, id, projectId: "project", assigneeIds: ["bob"] });
    expect(getBoard("project").tasksByColumn.column[0].assigneeIds).toEqual(["bob"]);
    expect(notifications(id)).toEqual(["alice", "bob"]);
  });

  it.each(["removed", "missing"])("rejects a newly assigned %s person and rolls back the task edit", async (invalidId) => {
    const { id } = await upsertTask(boardInput);
    await expect(upsertTask({ ...boardInput, id, title: "Must roll back", assigneeIds: ["alice", invalidId] })).rejects.toThrow("Assignee not found");
    expect(db.select().from(tasks).where(eq(tasks.id, id)).get()?.title).toBe(taskInput.title);
    expect(assignedIds(id)).toEqual(["alice", "bob"]);
    expect(notifications(id)).toEqual(["alice", "bob"]);
    await expect(upsertContextualTask({ ...taskInput, assigneeIds: [invalidId] })).rejects.toThrow("Assignee not found");
    expect(db.select().from(tasks).all()).toHaveLength(1);
  });

  it("preserves an existing assignment to a removed person, allows removal and rejects re-adding", async () => {
    const { id } = await upsertTask(boardInput);
    db.insert(taskAssignees).values({ taskId: id, userId: "removed" }).run();
    await upsertTask({ ...boardInput, id, assigneeIds: ["alice", "removed"] });
    expect(assignedIds(id)).toEqual(["alice", "removed"]);
    expect(getPortfolioSchedule().tasks[0].assignees.map((person) => person.name)).toEqual(["alice", "removed"]);
    await upsertTask({ ...boardInput, id, assigneeIds: ["alice"] });
    await expect(upsertTask({ ...boardInput, id, assigneeIds: ["alice", "removed"] })).rejects.toThrow("Assignee not found");
  });

  it("retains single-assignee deadlines and rejects editing them through the task action", async () => {
    const input = { title: "Deadline", assigneeId: "alice", localDate: "2026-09-09", deadlineAt: null };
    const { id } = await upsertContextualDeadline(input);
    expect(assignedIds(id)).toEqual([]);
    expect(listDeadlineOverview({ assigneeId: "alice" })[0].assigneeName).toBe("alice");
    expect(getPersonalWorkSummary("alice").deadlines[0]).toMatchObject({ id, description: "", assigneeId: "alice", status: "open" });
    expect(notifications(id)).toEqual(["alice"]);
    await upsertContextualDeadline({ ...input, id });
    expect(notifications(id)).toEqual(["alice"]);
    await expect(upsertTask({ ...boardInput, id })).rejects.toThrow("Task kind cannot be changed");
  });

  it("deletes assignments when the task is deleted", async () => {
    const { id } = await upsertTask(boardInput);
    db.delete(tasks).where(eq(tasks.id, id)).run();
    expect(assignedIds(id)).toEqual([]);
  });
});

it("migrates existing task assignments without assigning deadlines or unassigned tasks", () => {
  const connection = new Database(":memory:");
  try {
    connection.pragma("foreign_keys = ON");
    connection.exec(`CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, kind TEXT, assignee_id TEXT REFERENCES user(id));
      INSERT INTO user VALUES ('alice');
      INSERT INTO tasks VALUES ('task', 'task', 'alice'), ('empty', 'task', NULL), ('deadline', 'deadline', 'alice');`);
    connection.exec(readFileSync("drizzle/0059_task_assignees.sql", "utf8"));
    expect(connection.prepare("SELECT * FROM task_assignees").all()).toEqual([{ task_id: "task", user_id: "alice" }]);
    expect(connection.prepare("SELECT assignee_id FROM tasks WHERE id = 'deadline'").get()).toEqual({ assignee_id: "alice" });
    expect(connection.prepare("SELECT count(*) AS n FROM tasks").get()).toEqual({ n: 3 });
    expect(() => connection.exec("INSERT INTO task_assignees VALUES ('task', 'alice')")).toThrow();
    expect(connection.pragma("foreign_key_check")).toEqual([]);
  } finally { connection.close(); }
});
