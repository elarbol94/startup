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
  customers,
  projectColumns,
  projects,
  tasks,
  timeEntries,
  user,
} from "@/db/schema";
import { linkedProjects, linkedProjectsFor, syncProjectLinks } from "./project-link-refs";
import { listProjectConnections } from "./project-links";
import { getProjectPulse } from "@/modules/projects/pulse";

beforeAll(() => {
  const now = new Date();
  db.insert(user).values([
    { id: "owner", name: "Owner", email: "owner@example.com", createdAt: now, updatedAt: now },
    { id: "other", name: "Other", email: "other@example.com", createdAt: now, updatedAt: now },
  ]).run();
  db.insert(projects).values([
    { id: "a", name: "Alpha", color: "#111111", createdBy: "owner", sortOrder: 1 },
    { id: "b", name: "Beta", color: "#222222", createdBy: "owner", sortOrder: 2, status: "archived" },
  ]).run();
  db.insert(projectColumns).values({ id: "col", name: "Offen", projectId: "a", sortOrder: 1 }).run();
  db.insert(customers).values([{ id: "c1", name: "Gemeinde" }, { id: "c2", name: "Verein" }]).run();
  db.insert(calendars).values([
    { id: "private", ownerId: "owner", name: "Privat", visibility: "private" },
    { id: "company", ownerId: "owner", name: "Firma", visibility: "company" },
    { id: "busy", ownerId: "owner", name: "Belegt", visibility: "busy" },
  ]).run();
  db.insert(calendarEvents).values([
    { id: "secret", calendarId: "private", title: "Secret", allDay: true, startDate: "2026-10-02", endDate: "2026-10-03", createdBy: "owner" },
    { id: "kickoff", calendarId: "company", title: "Kickoff", allDay: true, startDate: "2026-10-05", endDate: "2026-10-06", createdBy: "owner" },
    { id: "review", calendarId: "company", title: "Review", allDay: true, startDate: "2026-09-01", endDate: "2026-09-02", createdBy: "owner" },
    { id: "blocked", calendarId: "busy", title: "Blocked", allDay: true, startDate: "2026-10-04", endDate: "2026-10-05", createdBy: "owner" },
    { id: "later", calendarId: "company", title: "Later", allDay: true, startDate: "2026-11-01", endDate: "2026-11-02", createdBy: "owner" },
  ]).run();
});

describe("syncProjectLinks", () => {
  it("adds, keeps and removes tags and ignores unknown projects", () => {
    syncProjectLinks(db, { targetType: "customer", targetId: "c1", projectIds: ["a", "b", "missing"], userId: "owner" });
    expect(linkedProjects("customer", "c1").map((project) => project.id)).toEqual(["a", "b"]);
    expect(linkedProjects("customer", "c1")[1]).toMatchObject({ name: "Beta", archived: true });

    syncProjectLinks(db, { targetType: "customer", targetId: "c1", projectIds: ["b"], userId: "owner" });
    expect(linkedProjects("customer", "c1").map((project) => project.id)).toEqual(["b"]);

    syncProjectLinks(db, { targetType: "customer", targetId: "c1", projectIds: [], userId: "owner" });
    expect(linkedProjects("customer", "c1")).toEqual([]);
  });

  it("keeps tags of different record types apart", () => {
    syncProjectLinks(db, { targetType: "customer", targetId: "c2", projectIds: ["a"], userId: "owner" });
    syncProjectLinks(db, { targetType: "calendarEvent", targetId: "kickoff", projectIds: ["a"], userId: "owner" });
    const byCustomer = linkedProjectsFor("customer", ["c1", "c2", "kickoff"]);
    expect([...byCustomer.keys()]).toEqual(["c2"]);
  });
});

describe("listProjectConnections", () => {
  it("lists linked records and hides events the viewer cannot see", () => {
    for (const eventId of ["secret", "blocked", "review", "later"]) {
      syncProjectLinks(db, { targetType: "calendarEvent", targetId: eventId, projectIds: ["a"], userId: "owner" });
    }
    const forOther = listProjectConnections("a", "other", "2026-10-01");
    // Upcoming soonest first, then past events.
    expect(forOther.events.map((event) => event.title)).toEqual(["Kickoff", "Later", "Review"]);
    expect(forOther.events[0].href).toBe("/calendar?view=week&date=2026-10-05");
    expect(forOther.customers.map((customer) => customer.title)).toEqual(["Verein"]);

    const forOwner = listProjectConnections("a", "owner", "2026-10-01");
    expect(forOwner.events.map((event) => event.title)).toEqual(expect.arrayContaining(["Secret", "Blocked"]));
  });
});

describe("getProjectPulse", () => {
  it("counts tasks, picks the next milestone and sums this month's hours", () => {
    db.insert(tasks).values([
      { id: "t1", title: "Late", projectId: "a", columnId: "col", dueDate: "2026-09-20", createdBy: "owner" },
      { id: "t2", title: "Plain", projectId: "a", columnId: "col", dueDate: "2026-10-10", createdBy: "owner" },
      { id: "t3", title: "Launch", projectId: "a", columnId: "col", dueDate: "2026-10-10", isMilestone: true, createdBy: "owner" },
      { id: "t4", title: "Done", projectId: "a", columnId: "col", status: "done", createdBy: "owner" },
    ]).run();
    const at = (time: string) => new Date(`2026-10-02T${time}:00Z`);
    db.insert(timeEntries).values([
      { userId: "owner", workDate: "2026-10-02", startedAt: at("08:00"), endedAt: at("12:30"), breakMinutes: 30, projectId: "a", createdBy: "owner" },
      { userId: "other", workDate: "2026-10-03", startedAt: at("08:00"), endedAt: at("10:00"), projectId: "a", createdBy: "other" },
      { userId: "other", workDate: "2026-09-30", startedAt: at("08:00"), endedAt: at("10:00"), projectId: "a", createdBy: "other" },
    ]).run();

    const team = getProjectPulse("a", "2026-10-01", { id: "owner", role: "admin" });
    expect(team).toMatchObject({ open: 3, overdue: 1, done: 1, hoursScope: "team", monthMinutes: 360, connectionCount: 6 });
    expect(team.next).toMatchObject({ id: "t3", milestone: true });

    const own = getProjectPulse("a", "2026-10-01", { id: "other", role: "member" });
    expect(own).toMatchObject({ hoursScope: "own", monthMinutes: 120, funding: [] });
  });
});
