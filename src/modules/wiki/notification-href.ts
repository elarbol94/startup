import { withWorkItemFocus } from "@/modules/context/routes";

type NotificationTarget = {
  taskId: string | null;
  taskTitle: string | null;
  taskKind: string | null;
  taskRoute: string | null;
  pageSlug: string | null;
  officeActionLink: string | null;
  link: string | null;
};

/** Where a notification leads: its own link, the focused task/deadline, else the wiki page (and office comment). */
export function notificationHref(item: NotificationTarget) {
  if (item.link) return item.link;
  if (item.taskTitle && item.taskId) {
    return withWorkItemFocus(item.taskRoute || "/", item.taskId, item.taskKind === "deadline" ? "deadline" : "task");
  }
  if (!item.pageSlug) return null;
  const officeAction = item.officeActionLink ? `?officeAction=${encodeURIComponent(item.officeActionLink)}` : "";
  return `/wiki/pages/${encodeURIComponent(item.pageSlug)}${officeAction}`;
}
