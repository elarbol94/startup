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
import { projects, projectColumns, tasks, taskDependencies, user } from "@/db/schema";
import { reparentTask, reorderProject } from "./actions";
import { getPortfolioSchedule } from "./queries";
beforeEach(() => {
 sqlite.exec("DELETE FROM task_dependencies; DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;");
 db.insert(user).values({ id: "actor", name: "Actor", email: "actor@example.com", createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().run();
 for (const id of ["p", "q"]) db.insert(projects).values({ id, name: id, createdBy: "actor" }).run();
 db.insert(projectColumns).values({ id: "col", name: "Open", projectId: "p" }).run();
 for (const [index,id] of ["a", "b", "c"].entries()) db.insert(tasks).values({ id, title: id, projectId: "p", columnId: "col", createdBy: "actor", sortOrder: index + 1 }).run();
});
describe("saved structure ordering", () => {
 it("persists repeated same-parent moves with unique sibling ranks", async () => {
  for (let i = 0; i < 20; i++) { await reparentTask({ taskId: "c", parentTaskId: null, beforeTaskId: "b" }); await reparentTask({ taskId: "a", parentTaskId: null, beforeTaskId: "b" }); }
  const rows = getPortfolioSchedule().tasks;
  expect(rows.map(t => t.id)).toEqual(["c", "a", "b"]);
  expect(new Set(rows.map(t => t.sortOrder)).size).toBe(3);
 });
 it("rejects a dependent child before any hierarchy write", async () => {
  db.insert(taskDependencies).values({ id: "dep", predecessorTaskId: "a", successorTaskId: "b" }).run();
  await expect(reparentTask({ taskId: "b", parentTaskId: "a" })).rejects.toThrow();
  expect(db.select().from(tasks).where(eq(tasks.id, "b")).get()?.parentTaskId).toBeNull();
 });
 it("saves project ordering without changing dates", async () => {
  await reorderProject({ projectId: "q", beforeProjectId: "p" });
  expect(getPortfolioSchedule().projects.map(p => p.id)).toEqual(["q", "p"]);
  expect(getPortfolioSchedule().projects.every(p => p.plannedStartDate === null)).toBe(true);
 });
});
