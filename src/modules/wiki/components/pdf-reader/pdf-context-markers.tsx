"use client";

// Context task and deadline markers (and their hover highlights) drawn beside PDF pages.
// Used by pdf-reader.tsx for every rendered page.
import type { Dispatch, SetStateAction } from "react";
import type { useRouter } from "next/navigation";
import type { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, ClipboardPlus } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { canonicalTaskHref } from "@/modules/context/routes";
import type { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import { isDeadlineOverdue, localDateValue } from "@/modules/tasks/deadline-utils";
import type { ContextDeadlineMarker, ContextTaskMarker } from "@/modules/tasks/types";
import { deadlineAnchor, taskAnchor } from "./pdf-marker-anchors";

export type PdfContextMarkerContext = {
  contextTasks: ContextTaskMarker[];
  contextDeadlines: ContextDeadlineMarker[];
  hoveredTaskId: string | null;
  setHoveredTaskId: Dispatch<SetStateAction<string | null>>;
  hoveredDeadlineId: string | null;
  setHoveredDeadlineId: Dispatch<SetStateAction<string | null>>;
  initialTaskId?: string;
  initialDeadlineId?: string;
  renderedAt: Date;
  documentId: string;
  format: ReturnType<typeof useFormatter>;
  tTasks: ReturnType<typeof useTranslations<"tasks">>;
  tDeadlines: ReturnType<typeof useTranslations<"deadlines">>;
  openDeadlineCreator: ReturnType<typeof useDeadlineCreator>["openDeadlineCreator"];
  router: ReturnType<typeof useRouter>;
};

function taskColor(task: ContextTaskMarker) {
  if (task.status === "done") return "#059669";
  if (task.priority === "high") return "#dc2626";
  if (task.priority === "low") return "#64748b";
  return "#4f46e5";
}

function taskHighlightsForPage(targetPage: number, { contextTasks, hoveredTaskId }: PdfContextMarkerContext) {
  return contextTasks.flatMap((task) => {
    if (task.id !== hoveredTaskId) return [];
    const anchor = taskAnchor(task);
    if (anchor.pageNumber !== targetPage || !anchor.rects?.length) return [];
    const color = taskColor(task);
    return anchor.rects.map((rect, index) => <div
      key={`${task.id}-task-highlight-${index}`}
      data-task-highlight={task.id}
      className="absolute rounded-sm transition-opacity duration-150"
      style={{
        left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
        backgroundColor: `color-mix(in srgb, ${color} 28%, transparent)`,
        outline: `2px solid color-mix(in srgb, ${color} 70%, transparent)`,
      }}
    />);
  });
}

function deadlineMarkersForPage(targetPage: number, context: PdfContextMarkerContext) {
  const {
    contextDeadlines, hoveredDeadlineId, setHoveredDeadlineId, renderedAt, initialDeadlineId, format, tDeadlines,
    openDeadlineCreator, documentId,
  } = context;
  const highlights = contextDeadlines.flatMap((deadline) => {
    if (deadline.id !== hoveredDeadlineId) return [];
    const anchor = deadlineAnchor(deadline);
    if (anchor.pageNumber !== targetPage || !anchor.rects?.length) return [];
    return anchor.rects.map((rect, index) => <div
      key={`${deadline.id}-deadline-highlight-${index}`}
      data-deadline-highlight={deadline.id}
      className="absolute rounded-sm transition-opacity duration-150"
      style={{
        left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
        backgroundColor: "color-mix(in srgb, #d97706 28%, transparent)",
        outline: "2px solid color-mix(in srgb, #d97706 70%, transparent)",
      }}
    />);
  });
  const markers = contextDeadlines.flatMap((deadline) => {
    const anchor = deadlineAnchor(deadline);
    if ((anchor.pageNumber ?? 1) !== targetPage) return [];
    const rects = anchor.rects ?? [];
    const top = rects.length ? Math.min(...rects.map((rect) => rect.y)) : 0.035;
    const overdue = isDeadlineOverdue(deadline, renderedAt);
    const color = deadline.status === "done" ? "#059669" : overdue ? "#dc2626" : "#d97706";
    const active = initialDeadlineId === deadline.id;
    const localDate = localDateValue(deadline.deadlineDate);
    const deadlineLabel = deadline.deadlineAt
      ? format.dateTime(new Date(deadline.deadlineAt), { dateStyle: "medium", timeStyle: "short" })
      : `${localDate ? format.dateTime(localDate, { dateStyle: "medium" }) : deadline.deadlineDate} · ${tDeadlines("allDay")}`;
    return [<button
      type="button"
      key={`${deadline.id}-deadline-marker`}
      data-deadline-marker={deadline.id}
      title={`${deadline.title} · ${deadlineLabel} · ${deadline.assigneeName || tDeadlines("unassigned")}`}
      aria-label={`${tDeadlines("markerLabel")}: ${deadline.title}`}
      className="pointer-events-auto absolute grid size-7 place-items-center rounded-full border-2 bg-background shadow-sm transition-transform hover:scale-105"
      style={{
        left: "calc(100% + 72px)",
        top: `${top * 100}%`,
        transform: "translateY(-50%)",
        borderColor: color,
        color,
        boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${color} 25%, transparent)` : undefined,
      }}
      onMouseEnter={() => setHoveredDeadlineId(deadline.id)}
      onMouseLeave={() => setHoveredDeadlineId((current) => current === deadline.id ? null : current)}
      onFocus={() => setHoveredDeadlineId(deadline.id)}
      onBlur={() => setHoveredDeadlineId((current) => current === deadline.id ? null : current)}
      onClick={() => openDeadlineCreator({
        deadline: {
          id: deadline.id,
          title: deadline.title,
          description: deadline.description,
          assigneeId: deadline.assigneeId,
          deadlineDate: deadline.deadlineDate,
          deadlineAt: deadline.deadlineAt,
          status: deadline.status,
        },
        origin: {
          type: "pdf",
          entityId: documentId,
          route: deadline.route,
          label: deadline.label,
          anchor,
        },
      })}
    ><CalendarClock className="size-3.5" />{deadline.assigneeId && <span className="absolute -right-1 -bottom-2"><UserIdentity userId={deadline.assigneeId} name={deadline.assigneeName} compact avatarOnly /></span>}</button>];
  });
  return [...highlights, ...markers];
}

export function pdfContextMarkersForPage(targetPage: number, context: PdfContextMarkerContext) {
  const { contextTasks, initialTaskId, tTasks, setHoveredTaskId, router } = context;
  return [
    ...taskHighlightsForPage(targetPage, context),
    ...deadlineMarkersForPage(targetPage, context),
    ...contextTasks.flatMap((task) => {
    const anchor = taskAnchor(task);
    if ((anchor.pageNumber ?? 1) !== targetPage) return [];
    const rects = anchor.rects ?? [];
    const top = rects.length
      ? Math.min(...rects.map((rect) => rect.y))
      : 0.035;
    const active = initialTaskId === task.id;
    const color = taskColor(task);
    return [<button
      type="button"
      key={`${task.id}-task-marker`}
      data-task-marker={task.id}
      title={`${task.title} · ${task.assigneeName || tTasks("unassigned")}`}
      aria-label={`${tTasks("markerLabel")}: ${task.title}`}
      className="pointer-events-auto absolute grid size-7 place-items-center rounded-full border-2 bg-background shadow-sm transition-transform hover:scale-105"
      style={{
        left: "calc(100% + 40px)",
        top: `${top * 100}%`,
        transform: "translateY(-50%)",
        borderColor: color,
        color,
        boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${color} 25%, transparent)` : undefined,
      }}
      onMouseEnter={() => setHoveredTaskId(task.id)}
      onMouseLeave={() => setHoveredTaskId((current) => current === task.id ? null : current)}
      onFocus={() => setHoveredTaskId(task.id)}
      onBlur={() => setHoveredTaskId((current) => current === task.id ? null : current)}
      onClick={() => router.push(canonicalTaskHref(task.id, task.projectId))}
    ><ClipboardPlus className="size-3.5" /><span className="absolute -bottom-2 left-0 flex">{task.assignees.map(person => <UserIdentity key={person.id} userId={person.id} name={person.name} compact avatarOnly />)}</span></button>];
    }),
  ];
}
