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
import { revalidatePath } from "next/cache";
import {
  contextLinks,
  projectColumns,
  projectDependencies,
  projectTaskDependencies,
  projects,
  taskDependencies,
  tasks,
  user,
} from "@/db/schema";
import { deleteProject, setProjectStatus, upsertProject } from "./actions";
import { addProjectPredecessor, getProjectImpact, getProjectLinks, removeProjectDependency } from "./project-actions";
import { listProjects } from "./queries";

const count = (table: string) =>
  (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(() => {
  vi.clearAllMocks();
  sqlite.exec(`DELETE FROM context_links; DELETE FROM project_dependencies; DELETE FROM project_task_dependencies;
    DELETE FROM task_dependencies; DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;`);
  db.insert(user).values({ id: "actor", name: "Actor", email: "actor@example.com", createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().run();
  db.insert(projects).values([
    { id: "p", name: "Doomed", createdBy: "actor", plannedStartDate: "2026-01-01", targetEndDate: "2026-01-31" },
    { id: "q", name: "Other", createdBy: "actor", plannedStartDate: "2026-02-01", targetEndDate: "2026-02-28" },
  ]).run();
  db.insert(projectColumns).values([
    { id: "p-open", name: "Open", projectId: "p", sortOrder: 1 },
    { id: "p-done", name: "Done", projectId: "p", sortOrder: 2, isCompleted: true },
    { id: "q-open", name: "Open", projectId: "q", sortOrder: 1 },
  ]).run();
  db.insert(tasks).values([
    { id: "a", title: "Open task", projectId: "p", columnId: "p-open", createdBy: "actor", dueDate: "2026-01-10" },
    { id: "b", title: "Done task", projectId: "p", columnId: "p-done", status: "done", createdBy: "actor" },
    { id: "a1", title: "Subtask", projectId: "p", columnId: "p-open", parentTaskId: "a", createdBy: "actor" },
    { id: "x", title: "Other task", projectId: "q", columnId: "q-open", createdBy: "actor", startDate: "2026-02-01", dueDate: "2026-02-05" },
  ]).run();
});

describe("deleteProject", () => {
  it("removes polymorphic references to the project and its tasks", async () => {
    db.insert(projectDependencies).values([
      { id: "dep-project", predecessorType: "project", predecessorId: "p", successorProjectId: "q" },
      { id: "dep-task", predecessorType: "task", predecessorId: "a", successorProjectId: "q" },
      { id: "dep-keep", predecessorType: "task", predecessorId: "x", successorProjectId: "q" },
    ]).run();
    db.insert(projectTaskDependencies).values({ predecessorProjectId: "p", successorTaskId: "x" }).run();
    db.insert(taskDependencies).values({ predecessorTaskId: "a", successorTaskId: "x" }).run();
    const link = { targetType: "app" as const, route: "/x", createdBy: "actor" };
    db.insert(contextLinks).values([
      { ...link, id: "cl-project", ownerType: "project", ownerId: "p" },
      { ...link, id: "cl-task", ownerType: "task", ownerId: "a" },
      { ...link, id: "cl-subtask", ownerType: "task", ownerId: "a1" },
      { ...link, id: "cl-keep", ownerType: "task", ownerId: "x" },
    ]).run();

    expect(await getProjectImpact("p")).toEqual({ tasks: 3, openTasks: 1, columns: 2, dependencies: 4 });

    await deleteProject("p");

    expect(db.select().from(projects).all().map((row) => row.id)).toEqual(["q"]);
    expect(db.select().from(tasks).all().map((row) => row.id)).toEqual(["x"]);
    expect(db.select().from(projectColumns).all().map((row) => row.id)).toEqual(["q-open"]);
    expect(db.select().from(projectDependencies).all().map((row) => row.id)).toEqual(["dep-keep"]);
    expect(count("project_task_dependencies")).toBe(0);
    expect(count("task_dependencies")).toBe(0);
    expect(db.select().from(contextLinks).all().map((row) => row.id)).toEqual(["cl-keep"]);
    expect(revalidatePath).toHaveBeenCalledWith("/projects/p");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("rejects an empty id", async () => {
    await expect(deleteProject("")).rejects.toThrow();
    await expect(setProjectStatus("", "archived")).rejects.toThrow();
  });
});

describe("upsertProject", () => {
  it("creates the project, predecessor link and columns together", async () => {
    const created = await upsertProject(
      { name: "New", plannedStartDate: "2026-01-05", targetEndDate: "2026-01-20", predecessor: { type: "project", id: "p" } },
      ["Todo", "Doing", "Done"],
    );
    const columns = db.select().from(projectColumns).where(eq(projectColumns.projectId, created.id)).all();
    expect(columns.map((column) => column.name)).toEqual(["Todo", "Doing", "Done"]);
    // The predecessor ends on 2026-01-31, so the new project starts the day after.
    const row = db.select().from(projects).where(eq(projects.id, created.id)).get()!;
    expect(row.plannedStartDate).toBe("2026-02-01");
    expect(row.targetEndDate).toBe("2026-02-16");
    expect(revalidatePath).toHaveBeenCalledWith(`/projects/${created.id}`);
  });

  it("writes nothing when the predecessor or manager doesn't exist", async () => {
    await expect(upsertProject({ name: "Bad", predecessor: { type: "task", id: "missing" } }, ["A"])).rejects.toThrow();
    await expect(upsertProject({ name: "Bad", managerId: "ghost" }, ["A"])).rejects.toThrow();
    expect(count("projects")).toBe(2);
  });

  it("falls back to German default columns outside a request", async () => {
    const created = await upsertProject({ name: "Defaults" });
    const columns = db.select().from(projectColumns).where(eq(projectColumns.projectId, created.id)).all();
    expect(columns.map((column) => column.name)).toEqual(["Offen", "In Arbeit", "Erledigt"]);
  });
});

describe("project dependency links", () => {
  it("adds, lists and removes predecessor links and rejects cycles", async () => {
    const added = await addProjectPredecessor({ projectId: "q", predecessor: { type: "project", id: "p" } });
    expect(added.ok).toBe(true);
    const links = await getProjectLinks("p");
    expect(links.successors.map((link) => link.projectId)).toEqual(["q"]);

    expect(await addProjectPredecessor({ projectId: "q", predecessor: { type: "project", id: "p" } })).toEqual({ ok: false, code: "exists" });
    expect(await addProjectPredecessor({ projectId: "p", predecessor: { type: "project", id: "q" } })).toEqual({ ok: false, code: "cycle" });
    expect(await addProjectPredecessor({ projectId: "p", predecessor: { type: "task", id: "x" } })).toEqual({ ok: false, code: "cycle" });
    expect(await addProjectPredecessor({ projectId: "p", predecessor: { type: "task", id: "a" } })).toEqual({ ok: false, code: "self" });

    const [link] = (await getProjectLinks("q")).predecessors;
    expect(link).toMatchObject({ type: "project", targetId: "p", title: "Doomed" });
    await removeProjectDependency({ id: link.id });
    expect(count("project_dependencies")).toBe(0);
  });

  it("moves the successor after its new predecessor", async () => {
    db.update(projects).set({ plannedStartDate: "2026-01-10", targetEndDate: "2026-01-20" }).where(eq(projects.id, "q")).run();
    db.update(tasks).set({ startDate: "2026-01-10", dueDate: "2026-01-12" }).where(eq(tasks.id, "x")).run();
    const result = await addProjectPredecessor({ projectId: "q", predecessor: { type: "project", id: "p" } });
    expect(result.ok && result.project.plannedStartDate).toBe("2026-02-01");
    expect(db.select().from(tasks).where(eq(tasks.id, "x")).get()?.startDate).toBe("2026-02-01");
  });
});

describe("listProjects", () => {
  it("counts only open top-level tasks", () => {
    const rows = listProjects();
    expect(rows.find((row) => row.id === "p")?.openTasks).toBe(1);
  });
});
