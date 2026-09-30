// Task focus mode: syncing the focused task with the route, saving/restoring the portfolio
// view around focus, and entering/leaving focus. Used by portfolio-client.tsx.
"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import {
  projectsFocusHref,
  resolveFocusedTaskSubtree,
} from "@/modules/projects/focus";
import { MAX_DAY_WIDTH, MIN_DAY_WIDTH } from "./portfolio-constants";
import type {
  EmbeddedProjectPlanner,
  PortfolioViewState,
  SetState,
} from "./portfolio-types";
import { zoomModeForDayWidth } from "./portfolio-utils";
import {
  clearStoredPortfolioView,
  readStoredPortfolioView,
  storePortfolioView,
} from "./portfolio-view-storage";
import type { useTaskTreeActions } from "./use-task-tree-actions";
import type { useTimelineViewport } from "./use-timeline-viewport";

export function usePortfolioFocus({
  initialFocusedTaskId,
  embedded,
  schedule,
  focusedTaskId,
  setFocusedTaskId,
  selectedTaskId,
  setSelectedTaskId,
  inspectorOpen,
  setInspectorOpen,
  expandedProjects,
  setExpandedProjects,
  expandedTasks,
  setExpandedTasks,
  treeWidth,
  setTreeWidth,
  dayWidthRef,
  setDayWidth,
  setZoom,
  scrollRef,
  setTimelineDayWidth,
  openTask,
}: Pick<
  ReturnType<typeof useTimelineViewport>,
  "treeWidth" | "setTreeWidth" | "setDayWidth" | "setZoom" | "scrollRef" | "setTimelineDayWidth"
> &
  Pick<ReturnType<typeof useTaskTreeActions>, "openTask"> & {
    initialFocusedTaskId: string | null;
    embedded?: EmbeddedProjectPlanner;
    schedule: PortfolioSchedule;
    focusedTaskId: string | null;
    setFocusedTaskId: SetState<string | null>;
    selectedTaskId: string | null;
    setSelectedTaskId: SetState<string | null>;
    inspectorOpen: boolean;
    setInspectorOpen: SetState<boolean>;
    expandedProjects: Set<string>;
    setExpandedProjects: SetState<Set<string>>;
    expandedTasks: Set<string>;
    setExpandedTasks: SetState<Set<string>>;
    dayWidthRef: RefObject<number>;
  }) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const portfolioViewRef = useRef<PortfolioViewState | null>(null);
  const fittedFocusRef = useRef<string | null>(null);
  const routeFocusedTaskRef = useRef<string | null>(initialFocusedTaskId);
  // True only when this page pushed the focus URL itself. Then the previous
  // history entry is the portfolio and leaving focus can go back to it; after
  // a direct load it may be another site, so leaving focus replaces instead.
  const focusPushedRef = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const previousFocusedTaskId = routeFocusedTaskRef.current;
      routeFocusedTaskRef.current = initialFocusedTaskId;
      if (!initialFocusedTaskId) focusPushedRef.current = false;
      setFocusedTaskId(initialFocusedTaskId);
      if (initialFocusedTaskId) {
        if (!portfolioViewRef.current) {
          portfolioViewRef.current = readStoredPortfolioView(initialFocusedTaskId);
        }
        if (portfolioViewRef.current) {
          storePortfolioView(initialFocusedTaskId, portfolioViewRef.current);
        }
        setSelectedTaskId(initialFocusedTaskId);
        setInspectorOpen(true);
      }
      if (previousFocusedTaskId && !initialFocusedTaskId && portfolioViewRef.current) {
        fittedFocusRef.current = null;
        const savedView = portfolioViewRef.current;
        const restoredDayWidth = Math.min(
          MAX_DAY_WIDTH,
          Math.max(MIN_DAY_WIDTH, savedView.dayWidth),
        );
        dayWidthRef.current = restoredDayWidth;
        setDayWidth(restoredDayWidth);
        setZoom(zoomModeForDayWidth(restoredDayWidth));
        setTreeWidth(savedView.treeWidth);
        setExpandedProjects(savedView.expandedProjects);
        setExpandedTasks(savedView.expandedTasks);
        setSelectedTaskId(savedView.selectedTaskId);
        setInspectorOpen(savedView.inspectorOpen);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            left: savedView.scrollLeft,
            behavior: "auto",
          });
        });
        clearStoredPortfolioView();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    initialFocusedTaskId,
    dayWidthRef,
    scrollRef,
    setDayWidth,
    setExpandedProjects,
    setExpandedTasks,
    setFocusedTaskId,
    setInspectorOpen,
    setSelectedTaskId,
    setTreeWidth,
    setZoom,
  ]);

  function enterTaskFocus(task: PortfolioTask) {
    if (embedded) { openTask(task); return; }
    if (!focusedTaskId) {
      portfolioViewRef.current = {
        dayWidth: dayWidthRef.current,
        scrollLeft: scrollRef.current?.scrollLeft ?? 0,
        treeWidth,
        expandedProjects: new Set(expandedProjects),
        expandedTasks: new Set(expandedTasks),
        selectedTaskId,
        inspectorOpen,
      };
    }
    if (portfolioViewRef.current) {
      storePortfolioView(task.id, portfolioViewRef.current);
    }
    setSelectedTaskId(task.id);
    setFocusedTaskId(task.id);
    setInspectorOpen(true);
    fittedFocusRef.current = null;
    const subtree = resolveFocusedTaskSubtree(schedule.tasks, task.id);
    if (subtree) {
      setExpandedProjects((current) => new Set(current).add(task.projectId));
      setExpandedTasks((current) => {
        const next = new Set(current);
        for (const candidate of [...subtree.ancestors, ...subtree.tasks]) {
          if (schedule.tasks.some((child) => child.parentTaskId === candidate.id)) {
            next.add(candidate.id);
          }
        }
        return next;
      });
    }
    if (focusedTaskId) {
      router.replace(projectsFocusHref(task.id), { scroll: false });
    } else {
      focusPushedRef.current = true;
      router.push(projectsFocusHref(task.id), { scroll: false });
    }
  }

  function exitTaskFocus() {
    const savedView = portfolioViewRef.current;
    setFocusedTaskId(null);
    fittedFocusRef.current = null;
    if (savedView) {
      setTimelineDayWidth(savedView.dayWidth);
      setTreeWidth(savedView.treeWidth);
      setExpandedProjects(savedView.expandedProjects);
      setExpandedTasks(savedView.expandedTasks);
      setSelectedTaskId(savedView.selectedTaskId);
      setInspectorOpen(savedView.inspectorOpen);
      clearStoredPortfolioView();
      if (focusPushedRef.current) router.back();
      else router.replace(projectsFocusHref(null), { scroll: false });
      focusPushedRef.current = false;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          left: savedView.scrollLeft,
          behavior: "auto",
        });
      });
    } else {
      router.replace(projectsFocusHref(null), { scroll: false });
    }
  }

  async function copyFocusLink() {
    if (!focusedTaskId) return;
    try {
      await navigator.clipboard.writeText(
        new URL(projectsFocusHref(focusedTaskId), window.location.origin).toString(),
      );
      toast.success(t("focusLinkCopied"));
    } catch {
      toast.error(tCommon("error"));
    }
  }

  return { fittedFocusRef, enterTaskFocus, exitTaskFocus, copyFocusLink };
}
