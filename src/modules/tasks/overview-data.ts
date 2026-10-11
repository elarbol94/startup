export type OverviewRecord = {
  id: string; title: string; description?: string; href: string | null;
  date: number | null; dateOnly?: string; actor?: string | null; status?: string | null;
  today?: boolean; location?: string | null; calendar?: string | null; allDay?: boolean; detailsHidden?: boolean;
};
/** Key figures in the dashboard side column, in display order (2 × 2). */
export const kpiIds = ["openTasks", "overdue", "upcomingDeadlines", "eventsToday"] as const;
export type KpiId = typeof kpiIds[number];
export type OverviewKpi = { id: KpiId; value: number; records: OverviewRecord[] };
/** "Als Nächstes": the next open deadline and today's calendar entries. */
export type OverviewUpNext = {
  deadline: { id: string; title: string; href: string | null; deadlineDate: string; deadlineAt: string | null } | null;
  events: OverviewRecord[];
};
