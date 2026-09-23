import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
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

import { db } from "@/db";
import { calendarEvents, projectColumns, projects, taskContexts, tasks, user, wikiNotifications } from "@/db/schema";
import { ensureCalendarWorkspace, listCalendarWorkspace, taskHref } from "./queries";
import { listNotifications } from "@/modules/wiki/research-queries";

beforeAll(() => {
  db.insert(user).values([
    { id: "actor", name: "Actor", email: "actor@example.com", createdAt: new Date(), updatedAt: new Date() },
    { id: "me", name: "Me", email: "me@example.com", createdAt: new Date(), updatedAt: new Date() },
  ]).run();
  db.insert(projects).values({
    id: "p", name: "Project", createdBy: "actor", plannedStartDate: "2026-09-01", targetEndDate: "2026-09-30",
  }).run();
  db.insert(projectColumns).values({ id: "c", name: "Offen", projectId: "p", sortOrder: 1 }).run();
  db.insert(tasks).values([
    { id: "project-task", title: "Project task", projectId: "p", columnId: "c", createdBy: "actor" },
    { id: "wiki-task", title: "Wiki task", createdBy: "actor" },
    { id: "loose-task", title: "Loose task", createdBy: "actor" },
    { id: "loose-deadline", title: "Loose deadline", kind: "deadline", dueDate: "2026-09-10", startDate: "2026-09-10", createdBy: "actor" },
  ]).run();
  db.insert(taskContexts).values({ taskId: "wiki-task", type: "wikiPage", entityId: "page", route: "/wiki/pages/page" }).run();
});

describe("taskHref", () => {
  it("links project tasks to their board and everything else to a focusable route", () => {
    expect(taskHref("t", "p", "/wiki/pages/x", "task")).toBe("/projects/p?task=t");
    expect(taskHref("t", null, "/wiki/pages/x?page=2", "task")).toBe("/wiki/pages/x?page=2&task=t");
    expect(taskHref("t", null, null, "task")).toBe("/?task=t");
    expect(taskHref("d", null, null, "deadline")).toBe("/?deadline=d");
  });
});

describe("calendar links", () => {
  it("resolves linked tasks, projects and deadlines to pages that open them", () => {
    const calendar = ensureCalendarWorkspace("me");
    db.insert(calendarEvents).values(["project-task", "wiki-task", "loose-task"].map((taskId, index) => ({
      id: `event-${taskId}`,
      calendarId: calendar.id,
      title: `Event ${index}`,
      allDay: true,
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      linkedTaskId: taskId,
      createdBy: "me",
    }))).run();
    const { items } = listCalendarWorkspace({ userId: "me", from: "2026-09-01", to: "2026-10-01" });
    const href = (id: string) => items.find((item) => item.id === id || item.sourceId === id)?.href;
    expect(href("event-project-task")).toBe("/projects/p?task=project-task");
    expect(href("event-wiki-task")).toBe("/wiki/pages/page?task=wiki-task");
    expect(href("event-loose-task")).toBe("/?task=loose-task");
    expect(href("project:p")).toBe("/projects/p");
    expect(href("loose-deadline")).toBe("/?deadline=loose-deadline");
  });
});

describe("assignment notification links", () => {
  it("opens the assigned project task on its board", () => {
    db.insert(wikiNotifications).values([
      { userId: "me", actorId: "actor", type: "assignment", taskId: "project-task" },
      { userId: "me", actorId: "actor", type: "assignment", taskId: "loose-task" },
    ]).run();
    const routes = Object.fromEntries(listNotifications("me").map((item) => [item.taskId, item.taskRoute]));
    expect(routes["project-task"]).toBe("/projects/p?task=project-task");
    expect(routes["loose-task"]).toBe("/?task=loose-task");
  });
});
