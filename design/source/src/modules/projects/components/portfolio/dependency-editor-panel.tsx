// Dependency editor UI: the type/lag/route panel and the on-timeline popovers that host it.
// Used by schedule-inspector.tsx and portfolio-client.tsx.
"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, LocateFixed, Trash2 } from "lucide-react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { layoutDependencyRoutes } from "./dependency-geometry";
import {
  dependencyDraftIsInvalid,
  dependencyTypeCodeKey,
  dependencyTypeHintKey,
  dependencyTypeTranslationKey,
} from "./dependency-utils";
import { DEPENDENCY_TYPE_OPTIONS, HEADER_HEIGHT } from "./portfolio-constants";
import type { DependencyDraft } from "./portfolio-types";
import type { useDependencyEditor } from "./use-dependency-editor";

export function DependencyEditorPanel({
  draft,
  tasks,
  pending,
  invalid = false,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: DependencyDraft;
  tasks: PortfolioTask[];
  pending: boolean;
  invalid?: boolean;
  onChange: (draft: DependencyDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const predecessor = tasks.find(
    (task) => task.id === draft.predecessorTaskId,
  );
  const successor = tasks.find(
    (task) => task.id === draft.successorTaskId,
  );

  return (
    <div className="grid gap-3" data-testid="dependency-editor">
      <div className="rounded-md border-l-2 border-l-indigo-500 bg-muted/35 px-3 py-2">
        <p className="truncate text-xs font-medium">{predecessor?.title}</p>
        <div className="my-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.08em] text-indigo-600 dark:text-indigo-400">
          <span>{t(dependencyTypeCodeKey(draft.dependencyType))}</span>
          <ArrowRight className="size-3" aria-hidden />
        </div>
        <p className="truncate text-xs font-medium">{successor?.title}</p>
      </div>

      <div className="grid gap-1.5">
        <Label>{t("dependencyType")}</Label>
        <div
          className="grid grid-cols-2 gap-1.5"
          role="radiogroup"
          aria-label={t("dependencyType")}
        >
          {DEPENDENCY_TYPE_OPTIONS.map((type, index) => {
            const selected = draft.dependencyType === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  "group/type rounded-md border px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none",
                  selected
                    ? "border-indigo-500 bg-indigo-50 shadow-[inset_0_0_0_1px_color-mix(in_oklab,#4f46e5_24%,transparent)] dark:bg-indigo-950/35"
                    : "border-border bg-card hover:border-indigo-300 hover:bg-muted/45",
                )}
                onClick={() =>
                  onChange({ ...draft, dependencyType: type })
                }
                onKeyDown={(event) => {
                  if (
                    event.key !== "ArrowLeft" &&
                    event.key !== "ArrowRight" &&
                    event.key !== "ArrowUp" &&
                    event.key !== "ArrowDown"
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const delta =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? 1
                      : -1;
                  const nextIndex =
                    (index + delta + DEPENDENCY_TYPE_OPTIONS.length) %
                    DEPENDENCY_TYPE_OPTIONS.length;
                  onChange({
                    ...draft,
                    dependencyType: DEPENDENCY_TYPE_OPTIONS[nextIndex],
                  });
                  const buttons =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="radio"]',
                    );
                  buttons?.[nextIndex]?.focus();
                }}
              >
                <span className="block font-mono text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  {t(dependencyTypeCodeKey(type))}
                </span>
                <span className="mt-0.5 block text-xs font-medium">
                  {t(dependencyTypeTranslationKey(type))}
                </span>
                <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                  {t(dependencyTypeHintKey(type))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`dependency-lag-${draft.id}`}>{t("lagDays")}</Label>
        <Input
          id={`dependency-lag-${draft.id}`}
          type="number"
          min={-365}
          max={365}
          value={draft.lagDays}
          onChange={(event) =>
            onChange({
              ...draft,
              lagDays: Math.min(
                365,
                Math.max(-365, Number(event.target.value) || 0),
              ),
            })
          }
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t("dependencyLagHint")}
        </p>
        {invalid && (
          <p className="text-xs font-medium text-destructive" role="alert">
            {t("dependencyInvalid")}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/25 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">
            {draft.routeOffsetDays === null && draft.routeOffsetRows === null
              ? t("dependencyRouteAutomatic")
              : t("dependencyRouteManual")}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {t("dependencyRouteHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={
            pending ||
            (draft.routeOffsetDays === null && draft.routeOffsetRows === null)
          }
          onClick={() =>
            onChange({
              ...draft,
              routeOffsetDays: null,
              routeOffsetRows: null,
            })
          }
        >
          <LocateFixed className="size-3.5" />
          {t("dependencyRouteReset")}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-2">
        {!draft.isNew && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            {tCommon("delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || invalid}
            onClick={onSave}
          >
            {draft.isNew ? t("createDependency") : tCommon("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DependencyEditorPopovers({
  linesVisible,
  renderedDependencies,
  rowIndex,
  taskRows,
  dependencyGeometries,
  dependencyDraft,
  dependencyEditorOpen,
  openDependencyEditor,
  cancelDependencyEditor,
  treeWidth,
  deadlineLaneHeight,
  effectiveSchedule,
  dependencyCommitPending,
  schedule,
  setDependencyDraft,
  saveGraphicalDependency,
  deleteGraphicalDependency,
}: Pick<
  ReturnType<typeof layoutDependencyRoutes>,
  "renderedDependencies" | "rowIndex" | "taskRows" | "dependencyGeometries"
> &
  Pick<
    ReturnType<typeof useDependencyEditor>,
    | "dependencyDraft"
    | "dependencyEditorOpen"
    | "openDependencyEditor"
    | "cancelDependencyEditor"
    | "dependencyCommitPending"
    | "setDependencyDraft"
    | "saveGraphicalDependency"
    | "deleteGraphicalDependency"
  > & {
    linesVisible: boolean;
    treeWidth: number;
    deadlineLaneHeight: number;
    effectiveSchedule: PortfolioSchedule;
    schedule: PortfolioSchedule;
  }) {
  const t = useTranslations("projects");
  return (
    <>
      {(linesVisible ? renderedDependencies : []).map((dependency) => {
        const fromIndex = rowIndex.get(dependency.predecessorTaskId);
        const toIndex = rowIndex.get(dependency.successorTaskId);
        const from = taskRows.get(dependency.predecessorTaskId);
        const to = taskRows.get(dependency.successorTaskId);
        if (fromIndex === undefined || toIndex === undefined || !from || !to) return null;
        const geometry = dependencyGeometries.get(dependency.id);
        if (!geometry) return null;
        const selected =
          dependencyDraft?.id === dependency.id &&
          dependencyEditorOpen;
        return (
          <Popover
            key={`label-${dependency.id}`}
            open={selected}
            onOpenChange={(nextOpen) => {
              if (nextOpen) openDependencyEditor(dependency);
              else if (selected) cancelDependencyEditor();
            }}
          >
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={t("dependencyRouteHandle")}
                  title={t("dependencyRouteHandle")}
                  className={cn(
                    "pointer-events-none absolute z-[6] size-1 -translate-x-1/2 -translate-y-1/2 opacity-0",
                  )}
                  style={{
                    left: treeWidth + geometry.labelX,
                    top:
                      HEADER_HEIGHT +
                      deadlineLaneHeight +
                      geometry.labelY,
                  }}
                />
              }
            />
            <PopoverContent
              side="bottom"
              align="center"
              className="w-[min(25rem,calc(100vw-2rem))] p-3"
            >
              <div className="mb-1">
                <h3 className="text-sm font-semibold">
                  {dependencyDraft?.isNew
                    ? t("createDependency")
                    : t("editDependency")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("dependencyEditorDescription")}
                </p>
              </div>
              {dependencyDraft &&
                dependencyDraft.id === dependency.id && (
                  <DependencyEditorPanel
                    draft={dependencyDraft}
                    tasks={effectiveSchedule.tasks}
                    pending={dependencyCommitPending}
                    invalid={dependencyDraftIsInvalid(
                      schedule.tasks,
                      schedule.dependencies,
                      dependencyDraft,
                    )}
                    onChange={setDependencyDraft}
                    onSave={() => void saveGraphicalDependency()}
                    onCancel={cancelDependencyEditor}
                    onDelete={() =>
                      void deleteGraphicalDependency()
                    }
                  />
                )}
            </PopoverContent>
          </Popover>
        );
      })}
    </>
  );
}
