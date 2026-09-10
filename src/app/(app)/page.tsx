import { getOverviewMetricRecords } from "@/modules/tasks/overview-metric-records";
import { getUnreadNotificationCount, listNotifications } from "@/modules/wiki/research-queries";
import { OverviewNews } from "@/modules/tasks/components/overview-news";
import { OverviewMetric } from "@/modules/tasks/components/overview-metric";
import { OverviewCollection } from "@/modules/tasks/components/overview-collection";
import { cardIds, type CardId } from "@/modules/tasks/overview-layout";
import { getOverviewCollections } from "@/modules/tasks/overview-queries";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import {
  getPersonalWorkSummary,
  listDeadlineOverview,
  listMembers,
  listTaskOverview,
} from "@/modules/projects/queries";
import { TaskOverview } from "@/modules/tasks/components/task-overview";
import { DeadlineOverview } from "@/modules/tasks/components/deadline-overview";
import { OverviewWorkspace } from "@/modules/tasks/components/overview-workspace";
import { WorkCockpitHeader } from "@/modules/tasks/components/work-cockpit-header";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    assignee?: string;
    priority?: string;
    status?: string;
    deadlineAssignee?: string;
    deadlineFrom?: string;
    deadlineTo?: string;
    deadlineStatus?: string;
  }>;
}) {
  const [user, query] = await Promise.all([
    requireUser(),
    searchParams,
  ]);
  const notifications = listNotifications(user.id);
  const assignee = query.assignee || user.id;
  const priority = ["low", "medium", "high"].includes(query.priority || "") ? query.priority! : "all";
  const status = ["open", "done", "all"].includes(query.status || "") ? query.status! : "open";
  const tasks = listTaskOverview({
    assigneeId: assignee,
    priority: priority === "all" ? undefined : priority as "low" | "medium" | "high",
    status: status as "open" | "done" | "all",
  });
  const deadlineAssignee = query.deadlineAssignee || user.id;
  const deadlineStatus = ["open", "done", "all"].includes(query.deadlineStatus || "")
    ? query.deadlineStatus!
    : "open";
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const deadlineFrom = datePattern.test(query.deadlineFrom || "") ? query.deadlineFrom! : "";
  const deadlineTo = datePattern.test(query.deadlineTo || "") ? query.deadlineTo! : "";
  const deadlines = listDeadlineOverview({
    assigneeId: deadlineAssignee,
    from: deadlineFrom || undefined,
    to: deadlineTo || undefined,
    status: deadlineStatus as "open" | "done" | "all",
  });
  const members = listMembers();
  const summary = getPersonalWorkSummary(user.id);
  const collections = getOverviewCollections(user);
  const counts = { ...collections.counts, unreadNews: getUnreadNotificationCount(user.id) };
  const metricRecords = getOverviewMetricRecords(user.id, summary, collections);
  const cards = Object.fromEntries(cardIds.map(id => [id, <OverviewMetric key={id} id={id} summary={summary} counts={counts} records={metricRecords[id]} />])) as Record<CardId, ReactNode>;

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 py-2 sm:py-4">
      <WorkCockpitHeader userName={user.name} />
      <OverviewWorkspace userId={user.id} widgets={{ ...cards, tasks: (
        <TaskOverview
          tasks={tasks}
          members={members}
          defaultAssignee={user.id}
          filters={{ assignee, priority, status }}
        />
      ), deadlines: (
        <DeadlineOverview
          deadlines={deadlines}
          members={members}
          defaultAssignee={user.id}
          filters={{ assignee: deadlineAssignee, from: deadlineFrom, to: deadlineTo, status: deadlineStatus }}
        />
      ), news: <OverviewNews items={notifications} />,
        calendar: <OverviewCollection kind="calendar" rows={collections.calendar} timezone={collections.timezone} />,
        documents: <OverviewCollection kind="documents" rows={collections.documents} timezone={collections.timezone} />,
        presentations: <OverviewCollection kind="presentations" rows={collections.presentations} timezone={collections.timezone} />,
        projects: <OverviewCollection kind="projects" rows={collections.projects} timezone={collections.timezone} />,
      }} />
    </div>
  );
}
