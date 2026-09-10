import "server-only";
import { getPersonalWorkSummary, listTaskOverview } from "@/modules/projects/queries";
import { listNotifications } from "@/modules/wiki/research-queries";
import { withWorkItemFocus } from "@/modules/context/routes";
import { addLocalDays, compareDeadlineTiming, isDeadlineOverdue, todayLocal } from "./deadline-utils";
import type { getOverviewCollections } from "./overview-queries";
import type { CardId } from "./overview-layout";
import type { OverviewRecord } from "./overview-data";

export function getOverviewMetricRecords(userId: string, summary: ReturnType<typeof getPersonalWorkSummary>, collections: ReturnType<typeof getOverviewCollections>): Record<CardId, OverviewRecord[]> {
  const now = new Date(), today = todayLocal(now);
  const tasks = listTaskOverview({ assigneeId: userId, status: "open" });
  const taskRecords = tasks.map(task => ({ id: task.id, title: task.title, description: task.description, href: task.href, date: task.dueDate ? Date.parse(`${task.dueDate}T12:00:00Z`) : null, dateOnly: task.dueDate ?? undefined, actor: task.assignees.map(person => person.name).join(", ") }));
  const deadlineRecord = (item: typeof summary.deadlines[number]): OverviewRecord => ({ id: item.id, title: item.title, description: item.description, href: item.href, date: Date.parse(`${item.deadlineDate}T12:00:00Z`), dateOnly: item.deadlineDate });
  const upcoming = summary.deadlines.filter(item => !isDeadlineOverdue({ ...item, status: "open" }, now)).sort(compareDeadlineTiming);
  return {
    openTasks: taskRecords,
    overdue: [...taskRecords.filter(item => item.dateOnly && item.dateOnly < today), ...summary.deadlines.filter(item => isDeadlineOverdue({ ...item, status: "open" }, now)).map(deadlineRecord)],
    upcomingDeadlines: upcoming.filter(item => item.deadlineDate <= addLocalDays(today, 7)).map(deadlineRecord),
    nextDeadline: upcoming.slice(0, 1).map(deadlineRecord),
    eventsToday: collections.calendar.filter(item => item.today),
    documentsCount: collections.documents, presentationsCount: collections.presentations, projectsCount: collections.projects,
    unreadNews: listNotifications(userId, true).map(item => ({ id: item.id, title: item.taskTitle || item.pageTitle || item.type, href: item.taskId ? withWorkItemFocus(item.taskRoute || "/", item.taskId, item.taskKind === "deadline" ? "deadline" : "task") : item.pageSlug ? `/wiki/pages/${encodeURIComponent(item.pageSlug)}` : null, date: item.createdAt.getTime(), actor: item.actorName })),
  };
}
