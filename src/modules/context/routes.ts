import type { ContextEntityType } from "./types";

export function canonicalTaskHref(taskId: string, projectId?: string | null) {
  return projectId
    ? `/projects/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`
    : `/?task=${encodeURIComponent(taskId)}`;
}

export function canonicalEntityHref(
  type: ContextEntityType,
  id: string,
  options: {
    projectId?: string | null;
    slug?: string;
    sourceId?: string;
    pageNumber?: number;
  } = {},
) {
  if (type === "project") return `/projects/${encodeURIComponent(id)}`;
  if (type === "task") return canonicalTaskHref(id, options.projectId);
  if (type === "wikiPage") {
    return `/wiki/pages/${encodeURIComponent(options.slug ?? id)}`;
  }
  if (type === "wikiSource") return `/wiki/sources/${encodeURIComponent(id)}`;
  if (type === "pdf") {
    const base = `/wiki/sources/${encodeURIComponent(options.sourceId ?? "")}/read/${encodeURIComponent(id)}`;
    return options.pageNumber ? `${base}?page=${options.pageNumber}` : base;
  }
  return id.startsWith("/") ? id : "/";
}

export function withTaskFocus(route: string, taskId: string) {
  return withWorkItemFocus(route, taskId, "task");
}

/** Keep source filters and anchors intact and replace stale focus parameters. */
export function withWorkItemFocus(route: string, id: string, kind: "task" | "deadline") {
  const safeRoute = route.startsWith("/") && !route.startsWith("//") && !route.includes("\\") ? route : "/";
  const url = new URL(safeRoute, "https://workspace.invalid");
  url.searchParams.delete("task");
  url.searchParams.delete("deadline");
  url.searchParams.set(kind, id);
  return `${url.pathname}${url.search.replace(/\+/g, "%20")}${url.hash}`;
}
