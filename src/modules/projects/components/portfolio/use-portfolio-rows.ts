// Visible Gantt rows and their derived data: focus subtree, filters, search, conflicts,
// critical path and the flattened project/task tree. Used by portfolio-client.tsx.
"use client";

import { useEffect, useMemo } from "react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import {
  containerOverflow,
  criticalPathTaskIds,
  dependencyConflicts,
  leafTasks,
  suggestTaskPlacement,
  taskAncestors,
  taskDescendants,
  weightedProgress,
} from "@/modules/projects/schedule";
import {
  classifyFocusDependencies,
  resolveFocusedTaskSubtree,
} from "@/modules/projects/focus";
import type { EmbeddedProjectPlanner, Row, SetState } from "./portfolio-types";
import { projectRisk } from "./portfolio-utils";

export function usePortfolioRows({
  schedule,
  effectiveSchedule,
  embedded,
  selectedTaskId,
  focusedTaskId,
  criticalVisible,
  owner,
  health,
  today,
  query,
  expandedProjects,
  expandedTasks,
  setExpandedProjects,
  setExpandedTasks,
}: {
  schedule: PortfolioSchedule;
  effectiveSchedule: PortfolioSchedule;
  embedded?: EmbeddedProjectPlanner;
  selectedTaskId: string | null;
  focusedTaskId: string | null;
  criticalVisible: boolean;
  owner: string;
  health: "all" | "risk" | "track";
  today: string;
  query: string;
  expandedProjects: Set<string>;
  expandedTasks: Set<string>;
  setExpandedProjects: SetState<Set<string>>;
  setExpandedTasks: SetState<Set<string>>;
}) {
  const selectedTask =
    effectiveSchedule.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const focusedTask =
    effectiveSchedule.tasks.find((task) => task.id === focusedTaskId) ?? null;
  const focusedProject = focusedTask
    ? effectiveSchedule.projects.find((project) => project.id === focusedTask.projectId) ?? null
    : null;
  const focusedSubtree = useMemo(
    () =>
      focusedTask
        ? resolveFocusedTaskSubtree(effectiveSchedule.tasks, focusedTask.id)
        : null,
    [focusedTask, effectiveSchedule.tasks],
  );
  const focusedTaskIds = useMemo(
    () => new Set(focusedSubtree?.taskIds ?? []),
    [focusedSubtree],
  );
  const focusDependencies = useMemo(
    () =>
      classifyFocusDependencies(effectiveSchedule.dependencies, focusedTaskIds),
    [effectiveSchedule.dependencies, focusedTaskIds],
  );
  const visibleFocusDependencyIds = useMemo(() => {
    if (!focusedTask) return null;
    if (criticalVisible || !selectedTask || !focusedTaskIds.has(selectedTask.id)) {
      return new Set(focusDependencies.internal.map((dependency) => dependency.id));
    }
    const branchIds = new Set([
      selectedTask.id,
      ...taskAncestors(effectiveSchedule.tasks, selectedTask.id).map((task) => task.id),
      ...taskDescendants(effectiveSchedule.tasks, selectedTask.id).map((task) => task.id),
    ]);
    return new Set(
      focusDependencies.internal
        .filter(
          (dependency) =>
            branchIds.has(dependency.predecessorTaskId) &&
            branchIds.has(dependency.successorTaskId),
        )
        .map((dependency) => dependency.id),
    );
  }, [
    focusedTask,
    focusedTaskIds,
    focusDependencies.internal,
    selectedTask,
    effectiveSchedule.tasks,
    criticalVisible,
  ]);

  // Summaries take part in dependencies now (R6), so conflicts and the critical
  // path are computed over the whole tree rather than just its leaves.
  const conflicts = useMemo(
    () => dependencyConflicts(effectiveSchedule.tasks, effectiveSchedule.dependencies),
    [effectiveSchedule],
  );
  const critical = useMemo(
    () =>
      criticalVisible
        ? criticalPathTaskIds(effectiveSchedule.tasks, effectiveSchedule.dependencies)
        : new Set<string>(),
    [effectiveSchedule, criticalVisible],
  );
  const tasksByProject = useMemo(() => {
    const map = new Map<string, PortfolioTask[]>();
    for (const task of effectiveSchedule.tasks) {
      const list = map.get(task.projectId) ?? [];
      list.push(task);
      map.set(task.projectId, list);
    }
    return map;
  }, [effectiveSchedule.tasks]);

  const visibleProjects = useMemo(() => {
    if (focusedTask) {
      return effectiveSchedule.projects.filter((project) => project.id === focusedTask.projectId);
    }
    return effectiveSchedule.projects.filter((project) => {
      if (embedded && project.id !== embedded.projectId) return false;
      const projectTasks = tasksByProject.get(project.id) ?? [];
      const matchesOwner =
        owner === "all" ||
        project.managerId === owner ||
        projectTasks.some((task) => task.assigneeIds.includes(owner));
      const risk = projectRisk(project, projectTasks, today);
      const matchesHealth = health === "all" || (health === "risk" ? risk : !risk);
      return matchesOwner && matchesHealth;
    });
  }, [effectiveSchedule.projects, tasksByProject, owner, health, today, focusedTask, embedded]);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return { projects: [], tasks: [] };
    return {
      projects: effectiveSchedule.projects
        .filter((project) => (!embedded || project.id === embedded.projectId) && project.name.toLocaleLowerCase().includes(needle))
        .slice(0, 5),
      tasks: effectiveSchedule.tasks
        .filter((task) => (!embedded || task.projectId === embedded.projectId) && task.title.toLocaleLowerCase().includes(needle))
        .slice(0, 8),
    };
  }, [query, effectiveSchedule.projects, effectiveSchedule.tasks, embedded]);

  const portfolioRows = useMemo(() => {
    const result: Row[] = [];
    for (const project of visibleProjects) {
      const projectTasks = tasksByProject.get(project.id) ?? [];
      const projectLeaves = leafTasks(projectTasks);
      // A project bar shows the window that was authored for it, not the span of
      // its work — so work reaching past it is drawn as overflow instead (R3/R4).
      const projectStart = project.plannedStartDate;
      const projectDue = project.targetEndDate;
      const overflow = containerOverflow(
        { startDate: projectStart, dueDate: projectDue },
        projectTasks,
      );
      result.push({
        id: `project-${project.id}`,
        kind: "project",
        projectId: project.id,
        label: project.name,
        color: project.color,
        progress: weightedProgress(projectLeaves),
        startDate: projectStart ?? overflow.startDate,
        dueDate: projectDue ?? overflow.dueDate,
        isMilestone: false,
        overflowStart: overflow.clampedStart ? overflow.startDate : null,
        overflowEnd: overflow.clampedEnd ? overflow.dueDate : null,
        placement: suggestTaskPlacement({
          today,
          siblings: [],
          days: 20,
        }),
      });
      if (!expandedProjects.has(project.id)) continue;
      const appendTask = (
        task: PortfolioTask,
        depth: number,
      ) => {
        const childTasks = projectTasks.filter(
          (candidate) => candidate.parentTaskId === task.id,
        );
        const renderDraftTask = (candidate: PortfolioTask) => candidate;
        const descendantTasks = taskDescendants(projectTasks, task.id).map(renderDraftTask);
        const isSummary = childTasks.length > 0;
        const renderedTask = renderDraftTask(task);
        const siblings = projectTasks.filter(
          (candidate) => candidate.parentTaskId === task.parentTaskId && candidate.id !== task.id,
        );
        const parent = task.parentTaskId
          ? projectTasks.find((candidate) => candidate.id === task.parentTaskId)
          : {
              startDate: project.plannedStartDate,
              dueDate: project.targetEndDate,
            };
        result.push({
          id: task.id,
          kind: depth === 0 ? "task" : "subtask",
          projectId: project.id,
          label: task.title,
          color: project.color,
          progress: task.progress,
          startDate: renderedTask.startDate,
          dueDate: renderedTask.dueDate,
          isMilestone: task.isMilestone,
          isSummary,
          unscheduledCount: leafTasks(descendantTasks).filter(
            (child) => !child.startDate || !child.dueDate,
          ).length,
          childTasks: descendantTasks,
          task,
          depth,
          placement: suggestTaskPlacement({
            today,
            parent,
            siblings,
            days: task.isMilestone ? 1 : 5,
          }),
        });
        if (isSummary && expandedTasks.has(task.id)) {
          for (const child of childTasks) {
            appendTask(child, depth + 1);
          }
        }
      };
      for (const task of projectTasks.filter(
        (candidate) => !candidate.parentTaskId,
      )) {
        appendTask(task, 0);
      }
    }
    return result;
  }, [visibleProjects, tasksByProject, expandedProjects, expandedTasks, today]);

  const rows = useMemo(() => {
    if (!focusedSubtree) return portfolioRows;
    return portfolioRows
      .filter((row) => Boolean(row.task && focusedTaskIds.has(row.task.id)))
      .map((row) => ({
        ...row,
        kind: (row.task?.id === focusedSubtree.root.id ? "task" : "subtask") as Row["kind"],
        depth: focusedSubtree.depthByTaskId[row.task!.id] ?? 0,
      }));
  }, [portfolioRows, focusedSubtree, focusedTaskIds]);

  useEffect(() => {
    if (!focusedSubtree) return;
    const frame = requestAnimationFrame(() => {
      setExpandedProjects((current) => new Set(current).add(focusedSubtree.root.projectId));
      setExpandedTasks((current) => {
        const next = new Set(current);
        for (const task of focusedSubtree.tasks) {
          if (schedule.tasks.some((candidate) => candidate.parentTaskId === task.id)) {
            next.add(task.id);
          }
        }
        for (const ancestor of focusedSubtree.ancestors) next.add(ancestor.id);
        return next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedSubtree, schedule.tasks, setExpandedProjects, setExpandedTasks]);

  return {
    selectedTask, focusedTask, focusedProject, focusedSubtree, focusedTaskIds, focusDependencies,
    visibleFocusDependencyIds, conflicts, critical, tasksByProject, visibleProjects, searchResults, rows,
  };
}
