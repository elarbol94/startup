import { and, asc, eq, gte, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  employees,
  employmentContractPeriods,
  projects,
  tasks,
  timeEntries,
  user,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { addDays, endOfMonthWindow, isValidDate, localDateInZone, startOfWeek } from "@/modules/calendar/date-utils";
import { canManageTime } from "./access";
import { summarizePeriod, type ContractWindow } from "./lib/balance";
import { TIME_ZONE } from "./lib/entry-time";

const entryColumns = {
  id: timeEntries.id,
  userId: timeEntries.userId,
  workDate: timeEntries.workDate,
  startedAt: timeEntries.startedAt,
  endedAt: timeEntries.endedAt,
  breakMinutes: timeEntries.breakMinutes,
  projectId: timeEntries.projectId,
  taskId: timeEntries.taskId,
  kind: timeEntries.kind,
  source: timeEntries.source,
  note: timeEntries.note,
  projectName: projects.name,
  projectColor: projects.color,
  taskTitle: tasks.title,
};

function selectEntries() {
  return db
    .select(entryColumns)
    .from(timeEntries)
    .leftJoin(projects, eq(projects.id, timeEntries.projectId))
    .leftJoin(tasks, eq(tasks.id, timeEntries.taskId));
}

type EntryRow = ReturnType<ReturnType<typeof selectEntries>["all"]>[number];

function serializeEntry(row: EntryRow) {
  return {
    ...row,
    startedAt: row.startedAt.getTime(),
    endedAt: row.endedAt?.getTime() ?? null,
  };
}

export type TimeEntryView = ReturnType<typeof serializeEntry>;

export function todayInVienna(now = new Date()) {
  return localDateInZone(now, TIME_ZONE);
}

export function getRunningEntry(userId: string) {
  return selectEntries()
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
    .get();
}

export function listEntriesInRange(userId: string, start: string, endExclusive: string) {
  return selectEntries()
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.workDate, start),
        lt(timeEntries.workDate, endExclusive),
      ),
    )
    .orderBy(asc(timeEntries.startedAt))
    .all();
}

/** Entries of a user that could overlap a period starting on `workDate` (±1 day for overnight work). */
export function listNeighbourEntries(userId: string, workDate: string, excludeId?: string) {
  return db
    .select({ id: timeEntries.id, startedAt: timeEntries.startedAt, endedAt: timeEntries.endedAt })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.workDate, addDays(workDate, -1)),
        lt(timeEntries.workDate, addDays(workDate, 2)),
        excludeId ? ne(timeEntries.id, excludeId) : undefined,
      ),
    )
    .all();
}

export function listContractWindows(userId: string): ContractWindow[] {
  return db
    .select({
      validFrom: employmentContractPeriods.validFrom,
      validTo: employmentContractPeriods.validTo,
      weeklyMinutes: employmentContractPeriods.weeklyMinutes,
      workdaysPerWeek: employmentContractPeriods.workdaysPerWeek,
    })
    .from(employmentContractPeriods)
    .innerJoin(employees, eq(employees.id, employmentContractPeriods.employeeId))
    .where(eq(employees.userId, userId))
    .all();
}

function listAssignableWork() {
  const activeProjects = db
    .select({ id: projects.id, name: projects.name, color: projects.color })
    .from(projects)
    .where(eq(projects.status, "active"))
    .orderBy(asc(projects.sortOrder), asc(projects.name))
    .all();
  const openTasks = db
    .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.status, "open"), eq(projects.status, "active")))
    .orderBy(asc(tasks.title))
    .all()
    .flatMap((task) => (task.projectId ? [{ ...task, projectId: task.projectId }] : []));
  return { projects: activeProjects, tasks: openTasks };
}

export function getTimeWorkspace(
  viewer: SessionUser,
  params: { userId?: string; week?: string },
  now = new Date(),
) {
  const canManage = canManageTime(viewer);
  const people = canManage
    ? db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(isNull(user.removedAt))
        .orderBy(asc(user.name))
        .all()
    : [];
  const subject =
    canManage && params.userId
      ? people.find((person) => person.id === params.userId) ?? { id: viewer.id, name: viewer.name }
      : { id: viewer.id, name: viewer.name };

  const today = todayInVienna(now);
  const weekStart = startOfWeek(params.week && isValidDate(params.week) ? params.week : today);
  const weekEnd = addDays(weekStart, 7);
  // The month containing the week's Thursday (ISO week convention).
  const month = endOfMonthWindow(addDays(weekStart, 3));

  const rangeStart = month.start < weekStart ? month.start : weekStart;
  const rangeEnd = month.end > weekEnd ? month.end : weekEnd;
  const rows = listEntriesInRange(subject.id, rangeStart, rangeEnd);
  const contracts = listContractWindows(subject.id);
  const measured = rows.map((row) => ({
    workDate: row.workDate,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    breakMinutes: row.breakMinutes,
  }));
  const inRange = (start: string, end: string) => measured.filter((row) => row.workDate >= start && row.workDate < end);

  const running = getRunningEntry(viewer.id);
  return {
    today,
    now: now.getTime(),
    weekStart,
    month: month.start.slice(0, 7),
    subject,
    isOwn: subject.id === viewer.id,
    canManage,
    people,
    running: running ? serializeEntry(running) : null,
    entries: rows
      .filter((row) => row.workDate >= weekStart && row.workDate < weekEnd)
      .map(serializeEntry),
    week: summarizePeriod({ start: weekStart, endExclusive: weekEnd, today, entries: inRange(weekStart, weekEnd), contracts, now }),
    monthSummary: summarizePeriod({ start: month.start, endExclusive: month.end, today, entries: inRange(month.start, month.end), contracts, now }),
    ...listAssignableWork(),
  };
}

export type TimeWorkspaceData = ReturnType<typeof getTimeWorkspace>;
