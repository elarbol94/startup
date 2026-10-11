import { listNotifications } from "@/modules/wiki/research-queries";
import { OverviewNews } from "@/modules/tasks/components/overview-news";
import { OverviewKpis } from "@/modules/tasks/components/overview-kpis";
import { OverviewUpNext } from "@/modules/tasks/components/overview-up-next";
import { OverviewUserProvider } from "@/modules/tasks/components/overview-preferences";
import { getOverviewKpis, getOverviewUpNext } from "@/modules/tasks/overview-metric-records";
import { getOverviewCalendar } from "@/modules/tasks/overview-queries";
import { requireUser } from "@/lib/auth";
import {
  getPersonalWorkSummary,
  listDeadlineOverview,
  listMembers,
  listTaskOverview,
  listProjects,
} from "@/modules/projects/queries";
import { TaskOverview } from "@/modules/tasks/components/task-overview";
import { DeadlineOverview } from "@/modules/tasks/components/deadline-overview";
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
    includeProjects: true,
    assigneeId: assignee,
    priority: priority === "all" ? undefined : priority as "low" | "medium" | "high",
    status: "all",
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
  const calendar = getOverviewCalendar(user);

  // Design 1b: tasks (and deadlines) on the left, key figures, "Als Nächstes" and news on the
  // right; one column once the page is narrower than 1000 px.
  return (
    <OverviewUserProvider userId={user.id}>
      <div className="@container/overview mx-auto flex w-full max-w-[90rem] flex-col gap-5">
        <WorkCockpitHeader userName={user.name} />
        <div className="grid items-start gap-5 @min-[1000px]/overview:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            <TaskOverview
              tasks={tasks}
              projects={listProjects({ includeArchived: true }).map(project => ({ id: project.id, name: project.name }))}
              members={members}
              defaultAssignee={user.id}
              filters={{ assignee, priority, status }}
            />
            <DeadlineOverview
              deadlines={deadlines}
              members={members}
              defaultAssignee={user.id}
              filters={{ assignee: deadlineAssignee, from: deadlineFrom, to: deadlineTo, status: deadlineStatus }}
            />
          </div>
          <aside className="flex min-w-0 flex-col gap-4">
            <OverviewKpis kpis={getOverviewKpis(user.id, summary, calendar)} />
            <OverviewUpNext upNext={getOverviewUpNext(summary, calendar)} />
            <OverviewNews items={notifications} />
          </aside>
        </div>
      </div>
    </OverviewUserProvider>
  );
}
