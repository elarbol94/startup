// SVG dependency arrows for the portfolio Gantt: routed paths, hit targets, route handles
// and the dashed preview while linking. Used by portfolio-client.tsx.
"use client";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useTranslations } from "next-intl";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { dependencyTypeOf, isTaskDone } from "@/modules/projects/schedule";
import type { GanttRoutePoint } from "@/modules/projects/gantt-routing";
import { cn } from "@/lib/utils";
import {
  dependencyPathGeometry,
  type layoutDependencyRoutes,
} from "./dependency-geometry";
import { dependencyTypeTranslationKey } from "./dependency-utils";
import { HEADER_HEIGHT, ROW_HEIGHT } from "./portfolio-constants";
import type { PortfolioDependency, Row } from "./portfolio-types";
import type { useDependencyEditor } from "./use-dependency-editor";

function DependencyRouteHandle({
  axis,
  point,
  dragging,
  label,
  valueText,
  onPointerDown,
  onKeyDown,
}: {
  axis: "x" | "y";
  point: GanttRoutePoint;
  dragging: boolean;
  label: string;
  valueText: string;
  onPointerDown: (
    axis: "x" | "y",
    event: ReactPointerEvent<SVGGElement>,
  ) => void;
  onKeyDown: (
    axis: "x" | "y",
    event: ReactKeyboardEvent<SVGGElement>,
  ) => void;
}) {
  const horizontal = axis === "x";
  return (
    <g
      transform={`translate(${point.x} ${point.y})`}
      role="slider"
      tabIndex={0}
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuetext={valueText}
      className="text-indigo-600 outline-none focus-visible:[filter:drop-shadow(0_0_0.2rem_rgb(79_70_229_/_0.45))]"
      style={{
        pointerEvents: "all",
        cursor: dragging
          ? "grabbing"
          : horizontal
            ? "col-resize"
            : "row-resize",
      }}
      onPointerDown={(event) => onPointerDown(axis, event)}
      onKeyDown={(event) => onKeyDown(axis, event)}
    >
      <rect
        x={horizontal ? -9 : -5}
        y={horizontal ? -5 : -9}
        width={horizontal ? 18 : 10}
        height={horizontal ? 10 : 18}
        rx="5"
        fill="var(--card)"
        stroke="currentColor"
        strokeWidth="1.75"
        className={cn(
          "transition-[filter,transform] duration-150 motion-reduce:transition-none",
          dragging &&
            "[filter:drop-shadow(0_2px_3px_rgb(15_23_42_/_0.24))]",
        )}
      />
      <path
        d={
          horizontal
            ? "M -4 0 H 4 M -4 0 L -2 -2 M -4 0 L -2 2 M 4 0 L 2 -2 M 4 0 L 2 2"
            : "M 0 -4 V 4 M 0 -4 L -2 -2 M 0 -4 L 2 -2 M 0 4 L -2 2 M 0 4 L 2 2"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </g>
  );
}

export function DependencyLines({
  treeWidth,
  deadlineLaneHeight,
  timelineWidth,
  rows,
  linesVisible,
  renderedDependencies,
  rowIndex,
  taskRows,
  dependencyGeometries,
  dependencyObstacles,
  occupiedDependencyRoutes,
  dependencyDraft,
  hoveredDependencyId,
  setHoveredDependencyId,
  conflicts,
  effectiveSchedule,
  selectedTaskId,
  scrollRef,
  selectDependency,
  openDependencyEditor,
  dependencyRouteDragging,
  beginDependencyRouteDrag,
  nudgeDependencyRoute,
  dependencySourceId,
  dependencyHoverId,
  range,
  dayWidth,
}: ReturnType<typeof layoutDependencyRoutes> &
  Pick<
    ReturnType<typeof useDependencyEditor>,
    | "dependencyDraft"
    | "hoveredDependencyId"
    | "setHoveredDependencyId"
    | "selectDependency"
    | "openDependencyEditor"
    | "dependencyRouteDragging"
    | "beginDependencyRouteDrag"
    | "nudgeDependencyRoute"
    | "dependencySourceId"
    | "dependencyHoverId"
  > & {
    treeWidth: number;
    deadlineLaneHeight: number;
    timelineWidth: number;
    rows: Row[];
    linesVisible: boolean;
    conflicts: Set<string>;
    effectiveSchedule: PortfolioSchedule;
    selectedTaskId: string | null;
    scrollRef: RefObject<HTMLDivElement | null>;
    range: { start: string; end: string };
    dayWidth: number;
  }) {
  const t = useTranslations("projects");
  return (
    <svg
      className="pointer-events-none absolute z-[8] overflow-visible"
      style={{ left: treeWidth, top: HEADER_HEIGHT + deadlineLaneHeight, width: timelineWidth, height: rows.length * ROW_HEIGHT }}
    >
      <defs>
        {[
          ["gantt-dependency-arrow", "#64748b"],
          ["gantt-dependency-arrow-active", "#4f46e5"],
          ["gantt-dependency-arrow-conflict", "#ef4444"],
        ].map(([id, fill]) => (
          <marker
            key={id}
            id={id}
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 7 3.5 L 0 7 Z" fill={fill} />
          </marker>
        ))}
      </defs>
      {(linesVisible ? renderedDependencies : []).map((dependency) => {
        const fromIndex = rowIndex.get(dependency.predecessorTaskId);
        const toIndex = rowIndex.get(dependency.successorTaskId);
        const from = taskRows.get(dependency.predecessorTaskId);
        const to = taskRows.get(dependency.successorTaskId);
        if (fromIndex === undefined || toIndex === undefined || !from || !to) return null;
        const geometry = dependencyGeometries.get(dependency.id);
        if (!geometry) return null;
        const selected = dependencyDraft?.id === dependency.id;
        const hovered = hoveredDependencyId === dependency.id;
        const conflict = conflicts.has(dependency.successorTaskId) && effectiveSchedule.tasks.some((task) => task.id === dependency.successorTaskId && !isTaskDone(task));
        const predecessorTitle =
          effectiveSchedule.tasks.find(
            (task) => task.id === dependency.predecessorTaskId,
          )?.title ?? "";
        const successorTitle =
          effectiveSchedule.tasks.find(
            (task) => task.id === dependency.successorTaskId,
          )?.title ?? "";
        const label = t("dependencyAriaLabel", {
          predecessor: predecessorTitle,
          successor: successorTitle,
          type: t(
            dependencyTypeTranslationKey(
              dependencyTypeOf(dependency),
            ),
          ),
        });
        return (
          <g key={dependency.id}>
            <path
              d={geometry.path}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={selected || hovered ? 2 : 1.4}
              opacity={selected || hovered ? 1 : selectedTaskId ? (dependency.predecessorTaskId === selectedTaskId || dependency.successorTaskId === selectedTaskId ? 0.95 : 0.25) : 0.75}
              markerEnd={
                conflict && (selected || hovered)
                  ? "url(#gantt-dependency-arrow-conflict)"
                  : selected || hovered
                    ? "url(#gantt-dependency-arrow-active)"
                    : "url(#gantt-dependency-arrow)"
              }
              className={cn(
                "transition-[stroke-width,color,opacity] duration-150 motion-reduce:transition-none",
                conflict && (selected || hovered)
                  ? "text-red-500"
                  : selected || hovered
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 dark:text-slate-400",
              )}
            />
            <path
              d={geometry.path}
              fill="none"
              stroke="transparent"
              strokeWidth="14"
              role="button"
              tabIndex={0}
              aria-label={label}
              style={{
                pointerEvents: "stroke",
                cursor: "pointer",
              }}
              onPointerEnter={() =>
                setHoveredDependencyId(dependency.id)
              }
              onPointerLeave={() =>
                setHoveredDependencyId((current) =>
                  current === dependency.id ? null : current,
                )
              }
              onFocus={() => setHoveredDependencyId(dependency.id)}
              onBlur={() => setHoveredDependencyId(null)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                scrollRef.current?.focus({ preventScroll: true });
                selectDependency(dependency);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Enter") {
                  openDependencyEditor(dependency);
                } else {
                  selectDependency(dependency);
                }
              }}
            />
            {selected &&
              !dependencyDraft?.isNew &&
              (["x", "y"] as const).map((axis) => {
                const handle = geometry.handles[axis];
                if (!handle) return null;
                return (
                  <DependencyRouteHandle
                    key={axis}
                    axis={axis}
                    point={handle}
                    dragging={dependencyRouteDragging === axis}
                    label={t(
                      axis === "x"
                        ? "dependencyRouteHandleX"
                        : "dependencyRouteHandleY",
                    )}
                    valueText={
                      dependency.routeOffsetDays === null &&
                      dependency.routeOffsetRows === null
                        ? t("dependencyRouteAutomatic")
                        : t("dependencyRouteManual")
                    }
                    onPointerDown={beginDependencyRouteDrag}
                    onKeyDown={nudgeDependencyRoute}
                  />
                );
              })}
          </g>
        );
        })}
      {dependencySourceId && dependencyHoverId && (() => {
        const fromIndex = rowIndex.get(dependencySourceId);
        const toIndex = rowIndex.get(dependencyHoverId);
        const from = taskRows.get(dependencySourceId);
        const to = taskRows.get(dependencyHoverId);
        if (fromIndex === undefined || toIndex === undefined || !from || !to) {
          return null;
        }
        const previewDependency: PortfolioDependency = {
          id: `preview-${dependencySourceId}-${dependencyHoverId}`,
          predecessorTaskId: dependencySourceId,
          successorTaskId: dependencyHoverId,
          dependencyType: "finish_to_start",
          lagDays: 0,
          routeOffsetDays: null,
          routeOffsetRows: null,
          createdAt: new Date(),
        };
        const geometry = dependencyPathGeometry({
          dependency: previewDependency,
          predecessor: from,
          successor: to,
          predecessorIndex: fromIndex,
          successorIndex: toIndex,
          rangeStart: range.start,
          dayWidth,
          obstacles: dependencyObstacles,
          occupiedRoutes: occupiedDependencyRoutes,
        });
        if (!geometry) return null;
        return (
          <path
            d={geometry.path}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 3"
            strokeWidth="2"
            markerEnd="url(#gantt-dependency-arrow-active)"
            className="text-indigo-500"
          />
        );
      })()}
    </svg>
  );
}
