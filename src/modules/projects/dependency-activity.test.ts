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
import {
  calendarEvents,
  calendars,
  projectColumns,
  projectDependencies,
  projectTaskDependencies,
  projects,
  scheduleChangeItems,
  scheduleChangeSets,
  tasks,
  timeEntries,
  user,
} from "@/db/schema";
import { syncProjectLinks } from "@/modules/context/project-link-refs";
import { getDependencyBadges } from "./dependency-badges";
import { listProjectActivity } from "./activity";

const TODAY = "2026-10-01";

beforeAll(() => {
  const now = new Date("2026-09-30T10:00:00Z");
  db.insert(user).values([
    { id: "owner", name: "Owner", email: "owner@example.com", createdAt: now, updatedAt: now },
    { id: "other", name: "Other", email: "other@example.com", createdAt: now, updatedAt: now },
  ]).run();
  db.insert(projects).values([
    { id: "main", name: "Main", createdBy: "owner", plannedStartDate: "2026-10-10", targetEndDate: "2026-12-01" },
    { id: "late", name: "Late", createdBy: "owner", targetEndDate: "2026-09-20" },
    { id: "ontime", name: "On time", createdBy: "owner", targetEndDate: "2026-10-05" },
    { id: "finished", name: "Finished", createdBy: "owner", targetEndDate: "2026-09-01" },
    { id: "next", name: "Next", createdBy: "owner" },
    { id: "after", name: "After", createdBy: "owner" },
  ]).run();
  db.insert(projectColumns).values(
    ["main", "late", "ontime", "finished", "next", "after"].map((projectId) => ({ id: `col-${projectId}`, name: "Offen", projectId, sortOrder: 1 })),
  ).run();
  db.insert(tasks).values([
    { id: "main-1", title: "Build", projectId: "main", columnId: "col-main", createdBy: "owner", createdAt: new Date("2026-09-28T09:00:00Z") },
    { id: "main-2", title: "Ship", projectId: "main", columnId: "col-main", createdBy: "other", status: "done", completedAt: new Date("2026-09-30T15:00:00Z"), createdAt: new Date("2026-09-28T10:00:00Z") },
    { id: "late-1", title: "Late work", projectId: "late", columnId: "col-late", createdBy: "owner" },
    { id: "ontime-1", title: "Prep", projectId: "ontime", columnId: "col-ontime", createdBy: "owner", dueDate: "2026-10-03" },
    { id: "finished-1", title: "Old", projectId: "finished", columnId: "col-finished", createdBy: "owner", status: "done" },
    { id: "next-1", title: "Later work", projectId: "next", columnId: "col-next", createdBy: "owner" },
    { id: "after-1", title: "Needs main", projectId: "after", columnId: "col-after", createdBy: "owner" },
  ]).run();
  db.insert(projectDependencies).values([
    { predecessorType: "project", predecessorId: "late", successorProjectId: "main" },
    { predecessorType: "task", predecessorId: "ontime-1", successorProjectId: "main" },
    { predecessorType: "project", predecessorId: "finished", successorProjectId: "main" },
    { predecessorType: "project", predecessorId: "main", successorProjectId: "next" },
  ]).run();
  db.insert(projectTaskDependencies).values({ predecessorProjectId: "main", successorTaskId: "after-1" }).run();
});

describe("getDependencyBadges", () => {
  it("lists open predecessors, late ones first, and skips finished ones", () => {
    const { waitingFor } = getDependencyBadges("main", TODAY);
    expect(waitingFor.map((wait) => [wait.project?.name, wait.task?.title ?? null, wait.late])).toEqual([
      ["Late", null, true],
      ["On time", "Prep", false],
    ]);
  });

  it("lists every active project held up by this one", () => {
    const { blocks } = getDependencyBadges("main", TODAY);
    expect(blocks.map((block) => block.project.name).sort()).toEqual(["After", "Next"]);
    expect(getDependencyBadges("finished", TODAY).blocks).toEqual([]);
  });
});

describe("listProjectActivity", () => {
  beforeAll(() => {
    db.insert(timeEntries).values([
      { userId: "owner", workDate: "2026-09-30", startedAt: new Date("2026-09-30T07:00:00Z"), endedAt: new Date("2026-09-30T09:00:00Z"), projectId: "main", createdBy: "owner" },
      { userId: "owner", workDate: "2026-09-30", startedAt: new Date("2026-09-30T10:00:00Z"), endedAt: new Date("2026-09-30T11:00:00Z"), projectId: "main", createdBy: "owner" },
      { userId: "other", workDate: "2026-09-29", startedAt: new Date("2026-09-29T07:00:00Z"), endedAt: new Date("2026-09-29T08:00:00Z"), projectId: "main", createdBy: "other" },
    ]).run();
    db.insert(calendars).values({ id: "private", ownerId: "owner", name: "Privat", visibility: "private" }).run();
    db.insert(calendarEvents).values({ id: "secret", calendarId: "private", title: "Secret", allDay: true, startDate: "2026-10-02", endDate: "2026-10-03", createdBy: "owner" }).run();
    syncProjectLinks(db, { targetType: "calendarEvent", targetId: "secret", projectIds: ["main"], userId: "owner" });
    db.insert(scheduleChangeSets).values({ id: "set", createdBy: "owner", createdAt: new Date("2026-09-30T12:00:00Z") }).run();
    db.insert(scheduleChangeItems).values({ changeSetId: "set", taskId: "main-1", afterDueDate: "2026-10-20" }).run();
  });

  it("merges tasks, time per person and day, links and schedule changes, newest first", () => {
    const { items, hasMore } = listProjectActivity("main", { id: "owner", role: "admin" });
    expect(hasMore).toBe(false);
    const kinds = items.map((item) => item.kind);
    expect(kinds).toEqual(expect.arrayContaining(["taskCreated", "taskDone", "time", "linked", "schedule"]));
    expect(items.map((item) => item.at)).toEqual([...items.map((item) => item.at)].sort((a, b) => b - a));
    const ownerDay = items.find((item) => item.id === "time-owner-2026-09-30");
    expect(ownerDay?.minutes).toBe(180);
    expect(items.find((item) => item.kind === "schedule")).toMatchObject({ count: 1, actorId: "owner" });
  });

  it("keeps others' hours and hidden events out for regular members", () => {
    const { items } = listProjectActivity("main", { id: "other", role: "member" });
    expect(items.filter((item) => item.kind === "time").map((item) => item.actorId)).toEqual(["other"]);
    expect(items.some((item) => item.kind === "linked")).toBe(false);
  });

  it("pages with hasMore", () => {
    const { items, hasMore } = listProjectActivity("main", { id: "owner", role: "admin" }, 2);
    expect(items).toHaveLength(2);
    expect(hasMore).toBe(true);
  });
});
