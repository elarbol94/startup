// Calendar scale of the portfolio Gantt: the sticky date header (with the work-breakdown
// resize handle) and the weekend/week/today background grid. Used by portfolio-client.tsx.
"use client";

import type { RefObject } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { HEADER_HEIGHT, ROW_HEIGHT } from "./portfolio-constants";
import type { Row, SetState, Zoom } from "./portfolio-types";
import {
  addCalendarDays,
  calendarDistance,
  calendarWeek,
  parseDate,
} from "./portfolio-utils";

export function TimelineHeader({
  totalWidth,
  treeWidth,
  treeResizeRef,
  setTreeWidth,
  timelineWidth,
  dayCount,
  range,
  zoom,
  dayWidth,
  today,
  renderedRangeEnd,
}: {
  totalWidth: number;
  treeWidth: number;
  treeResizeRef: RefObject<{ pointerId: number; startX: number; width: number } | null>;
  setTreeWidth: SetState<number>;
  timelineWidth: number;
  dayCount: number;
  range: { start: string; end: string };
  zoom: Zoom;
  dayWidth: number;
  today: string;
  renderedRangeEnd: string;
}) {
  const t = useTranslations("projects");
  const format = useFormatter();
  return (
    <div className="sticky top-0 z-30 flex h-[54px] border-b bg-card/95 backdrop-blur" style={{ width: totalWidth }}>
      <div
        className="sticky left-0 z-40 flex shrink-0 items-center border-r bg-card px-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"
        style={{ width: treeWidth }}
      >
        {t("workBreakdown")}
        <span
          role="separator"
          aria-label={t("resizeWorkBreakdown")}
          aria-orientation="vertical"
          tabIndex={0}
          className="absolute inset-y-0 right-0 z-50 w-1.5 cursor-col-resize bg-transparent hover:bg-violet-400/50 focus-visible:bg-violet-500"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            treeResizeRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              width: treeWidth,
            };
          }}
          onPointerMove={(event) => {
            const resize = treeResizeRef.current;
            if (!resize || resize.pointerId !== event.pointerId) return;
            setTreeWidth(
              Math.min(640, Math.max(280, resize.width + event.clientX - resize.startX)),
            );
          }}
          onPointerUp={(event) => {
            if (treeResizeRef.current?.pointerId === event.pointerId) {
              treeResizeRef.current = null;
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setTreeWidth((width) =>
              Math.min(640, Math.max(280, width + (event.key === "ArrowRight" ? 16 : -16))),
            );
          }}
        />
      </div>
      <div className="relative h-full" style={{ width: timelineWidth }}>
        {Array.from({ length: dayCount }, (_, index) => {
          const date = addCalendarDays(range.start, index);
          const parsed = parseDate(date);
          const day = parsed.getUTCDay();
          const show = zoom === "week" ? true : zoom === "month" ? day === 1 : parsed.getUTCDate() === 1;
          if (!show) return null;
          return (
            <span key={date} className="absolute top-0 flex h-full flex-col items-start justify-center border-l px-1.5 font-mono text-[10px] leading-tight text-muted-foreground" style={{ left: index * dayWidth, width: zoom === "week" ? dayWidth : zoom === "month" ? dayWidth * 7 : dayWidth * 30 }}>
              {zoom === "month" && <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-foreground/70">{t("calendarWeek", { week: calendarWeek(parsed) })}</span>}
              <span>{format.dateTime(parsed, zoom === "quarter" ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "short" })}</span>
            </span>
          );
        })}
        {today >= range.start && today <= renderedRangeEnd && (
          <span
            className="pointer-events-none absolute bottom-1 z-20 -translate-x-1/2 rounded-full bg-red-600 px-1.5 py-0.5 font-sans text-[9px] font-semibold text-white shadow-sm"
            style={{
              left:
                calendarDistance(range.start, today) * dayWidth +
                dayWidth / 2,
            }}
          >
            {t("today")}
          </span>
        )}
      </div>
    </div>
  );
}

export function TimelineGridBackground({
  treeWidth,
  timelineWidth,
  deadlineLaneHeight,
  rows,
  dayCount,
  range,
  dayWidth,
  today,
  renderedRangeEnd,
}: {
  treeWidth: number;
  timelineWidth: number;
  deadlineLaneHeight: number;
  rows: Row[];
  dayCount: number;
  range: { start: string; end: string };
  dayWidth: number;
  today: string;
  renderedRangeEnd: string;
}) {
  return (
    <div className="pointer-events-none absolute z-0" style={{ left: treeWidth, top: HEADER_HEIGHT, width: timelineWidth, height: deadlineLaneHeight + rows.length * ROW_HEIGHT }}>
      {Array.from({ length: dayCount }, (_, index) => {
        const date = addCalendarDays(range.start, index);
        const day = parseDate(date).getUTCDay();
        return day === 0 || day === 6 ? <span key={date} className="absolute inset-y-0 bg-slate-100/45 dark:bg-slate-900/25" style={{ left: index * dayWidth, width: dayWidth }} /> : null;
      })}
      {Array.from({ length: dayCount }, (_, index) => {
        const date = addCalendarDays(range.start, index);
        if (index === 0 || parseDate(date).getUTCDay() !== 1) {
          return null;
        }
        return (
          <span
            key={`week-${date}`}
            className="absolute inset-y-0 w-px bg-border/80"
            style={{ left: index * dayWidth }}
          />
        );
      })}
      {today >= range.start && today <= renderedRangeEnd && <span className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-red-500/90" style={{ left: calendarDistance(range.start, today) * dayWidth + dayWidth / 2 }} />}
    </div>
  );
}
