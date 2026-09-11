export const sectionIds = ["tasks", "deadlines", "news", "calendar", "documents", "presentations", "projects", "recentlyOpened"] as const;
export const cardIds = ["openTasks", "upcomingDeadlines", "overdue", "nextDeadline", "eventsToday", "documentsCount", "presentationsCount", "projectsCount", "unreadNews"] as const;
export type SectionId = typeof sectionIds[number];
export type CardId = typeof cardIds[number];
export type WidgetId = SectionId | CardId;
export const widgetIds: readonly WidgetId[] = [...cardIds, ...sectionIds];
export const isCard = (id: WidgetId): id is CardId => (cardIds as readonly string[]).includes(id);
export type LayoutItem = { id: WidgetId; width: number; height: number; visible: boolean };
export const defaultLayout: LayoutItem[] = [
  ...cardIds.map((id, index) => ({ id, width: 3, height: 140, visible: index < 4 })),
  { id: "tasks", width: 12, height: 400, visible: true },
  { id: "deadlines", width: 8, height: 400, visible: true },
  { id: "news", width: 4, height: 400, visible: true },
  ...sectionIds.slice(3).map(id => ({ id, width: 6, height: 400, visible: false })),
];
export function clampSize(id: WidgetId, width: number, height: number) {
  return { width: Math.max(isCard(id) ? 2 : 4, Math.min(12, width)), height: Math.max(isCard(id) ? 120 : 280, Math.min(1000, Math.round(height))) };
}
export function parseLayout(raw: string | null): LayoutItem[] {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.items)) return defaultLayout;
    const seen = new Set<string>();
    const result: LayoutItem[] = [];
    for (const item of value.items) {
      if (!item || !widgetIds.includes(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      const fallback = defaultLayout.find(entry => entry.id === item.id)!;
      result.push({ id: item.id, ...clampSize(item.id, Number.isFinite(item.width) ? item.width : fallback.width, Number.isFinite(item.height) ? item.height : fallback.height), visible: typeof item.visible === "boolean" ? item.visible : fallback.visible });
    }
    const missing = defaultLayout.filter(item => !seen.has(item.id));
    // Existing v1 layouts had their metrics outside the editable workspace.
    return value.version === 1 ? [...missing.filter(item => isCard(item.id)), ...result, ...missing.filter(item => !isCard(item.id))] : [...result, ...missing];
  } catch { return defaultLayout; }
}
export function moveSection(items: LayoutItem[], active: WidgetId, target: WidgetId): LayoutItem[] {
  const from = items.findIndex(item => item.id === active), to = items.findIndex(item => item.id === target);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items]; next.splice(to, 0, next.splice(from, 1)[0]); return next;
}
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export function resizeFromEdge(item: LayoutItem, edge: ResizeEdge, dx: number, dy: number, column: number) {
  return clampSize(item.id, item.width + (edge.includes("e") ? dx : edge.includes("w") ? -dx : 0) / Math.max(1, column), item.height + (edge.includes("s") ? dy : edge.includes("n") ? -dy : 0));
}
