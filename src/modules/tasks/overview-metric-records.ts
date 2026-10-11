import "server-only";
import { getPersonalWorkSummary, listTaskOverview } from "@/modules/projects/queries";
import { addLocalDays, compareDeadlineTiming, isDeadlineOverdue, todayLocal } from "./deadline-utils";
import type { getOverviewCalendar } from "./overview-queries";
import type { OverviewKpi, OverviewRecord, OverviewUpNext } from "./overview-data";

type Summary = ReturnType<typeof getPersonalWorkSummary>;
type Calendar = ReturnType<typeof getOverviewCalendar>;

/** The four dashboard key figures with the rows behind each (shown when a tile is opened). */
export function getOverviewKpis(userId: string, summary: Summary, calendar: Calendar): OverviewKpi[] {
  const now = new Date(), today = todayLocal(now);
  const tasks = listTaskOverview({ includeProjects: true, assigneeId: userId, status: "open" });
  const taskRecords = tasks.map(task => ({ id: task.id, title: task.title, description: task.description, href: task.href, date: task.dueDate ? Date.parse(`${task.dueDate}T12:00:00Z`) : null, dateOnly: task.dueDate ?? undefined, actor: task.assignees.map(person => person.name).join(", ") }));
  const deadlineRecord = (item: Summary["deadlines"][number]): OverviewRecord => ({ id: item.id, title: item.title, description: item.description, href: item.href, date: Date.parse(`${item.deadlineDate}T12:00:00Z`), dateOnly: item.deadlineDate });
  const upcoming = summary.deadlines.filter(item => !isDeadlineOverdue({ ...item, status: "open" }, now)).sort(compareDeadlineTiming);
  const overdue = [...taskRecords.filter(item => item.dateOnly && item.dateOnly < today), ...summary.deadlines.filter(item => isDeadlineOverdue({ ...item, status: "open" }, now)).map(deadlineRecord)];
  const nextWeek = upcoming.filter(item => item.deadlineDate <= addLocalDays(today, 7)).map(deadlineRecord);
  const events = calendar.events.filter(item => item.today);
  return [
    { id: "openTasks", value: summary.openTaskCount, records: taskRecords },
    { id: "overdue", value: overdue.length, records: overdue },
    { id: "upcomingDeadlines", value: nextWeek.length, records: nextWeek },
    { id: "eventsToday", value: events.length, records: events },
  ];
}

export function getOverviewUpNext(summary: Summary, calendar: Calendar): OverviewUpNext {
  const now = new Date();
  const next = summary.deadlines.filter(item => !isDeadlineOverdue({ ...item, status: "open" }, now)).sort(compareDeadlineTiming)[0];
  return {
    deadline: next ? { id: next.id, title: next.title, href: next.href, deadlineDate: next.deadlineDate, deadlineAt: next.deadlineAt } : null,
    events: calendar.events.filter(item => item.today).sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || (a.date ?? 0) - (b.date ?? 0)),
  };
}
