"use client";

// Renders the active calendar view (time grid for day/work week/week, month, agenda, team) with
// the shared selection and drag-and-drop wiring. Used by calendar-client.tsx.
import type { DragEvent } from "react";
import { useTranslations } from "next-intl";
import type { CalendarItem, CalendarView, CalendarWorkspace } from "../../types";
import { TIME_GRID_DAYS } from "./calendar-types";
import { dragPayload } from "./calendar-drag-drop";
import { FlowWeek } from "./flow-week";
import { MonthView } from "./month-view";
import { AgendaView } from "./agenda-view";
import { TeamView } from "./team-view";

export type CalendarViewAreaProps = {
  view: CalendarView;
  days: string[];
  date: string;
  today: string;
  items: CalendarItem[];
  workspace: CalendarWorkspace;
  locale: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  selectedId: string | null;
  onSelect: (item: CalendarItem) => void;
  onDeselect: () => void;
  onCommit: (item: CalendarItem, startAt: string, endAt: string) => Promise<boolean>;
  onEdit: (item: CalendarItem) => void;
  onNew: (day: string, hour?: number) => void;
  onCreateRange: (day: string, startMinutes: number, endMinutes: number, anchor: DOMRect) => void;
  onOpenDay: (day: string) => void;
  onDropDay: (event: DragEvent, day: string) => Promise<void>;
  onDropTime: (event: DragEvent, day: string, hour: number) => Promise<void>;
};

export function CalendarViewArea({
  view,
  days,
  date,
  today,
  items,
  workspace,
  locale,
  t,
  draggingId,
  setDraggingId,
  selectedId,
  onSelect,
  onDeselect,
  onCommit,
  onEdit,
  onNew,
  onCreateRange,
  onOpenDay,
  onDropDay,
  onDropTime,
}: CalendarViewAreaProps) {
  const timezone = workspace.preferences.timezone;
  const onDragStart = (event: DragEvent, item: CalendarItem) => {
    setDraggingId(item.id);
    dragPayload(event, { type: "item", id: item.id });
  };
  const onDragEnd = () => setDraggingId(null);
  const gridDays = TIME_GRID_DAYS[view];

  if (gridDays) {
    return (
      <FlowWeek
        days={days.slice(0, gridDays)}
        today={today}
        items={items}
        draggingId={draggingId}
        locale={locale}
        t={t}
        preferences={workspace.preferences}
        selectedId={selectedId}
        onSelect={onSelect}
        onCommit={onCommit}
        onEdit={onEdit}
        onNew={onNew}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDropDay={(event, day) => void onDropDay(event, day)}
        onDropTime={(event, day, hour) => void onDropTime(event, day, hour)}
        onCreateRange={onCreateRange}
        onBackgroundClick={onDeselect}
      />
    );
  }
  if (view === "month") {
    return (
      <MonthView
        days={days}
        date={date}
        today={today}
        items={items}
        locale={locale}
        timezone={timezone}
        t={t}
        selectedId={selectedId}
        onSelect={onSelect}
        onNew={(day) => onNew(day)}
        onOpenDay={onOpenDay}
        onDrop={(event, day) => void onDropDay(event, day)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    );
  }
  if (view === "agenda") {
    return (
      <AgendaView
        days={days}
        today={today}
        items={items}
        locale={locale}
        timezone={timezone}
        t={t}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    );
  }
  return (
    <TeamView
      days={days.slice(0, 7)}
      today={today}
      items={items}
      members={workspace.members}
      locale={locale}
      timezone={timezone}
      t={t}
      preferences={workspace.preferences}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}
