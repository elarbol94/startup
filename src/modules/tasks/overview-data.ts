export type OverviewRecord = {
  id: string; title: string; description?: string; href: string | null;
  date: number | null; dateOnly?: string; actor?: string | null; status?: string | null;
  today?: boolean; location?: string | null; calendar?: string | null; allDay?: boolean; detailsHidden?: boolean;
};
export type OverviewCounts = { eventsToday: number; documentsCount: number; presentationsCount: number; projectsCount: number; unreadNews: number };
