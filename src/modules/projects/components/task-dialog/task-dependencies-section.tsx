// Dependencies section of the task dialog: the task's predecessor and successor links,
// legacy project predecessors, and the add-link form. Used by task-dialog.tsx.
"use client";

import { useTranslations } from "next-intl";
import { GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import type { TaskDialogDetails } from "@/modules/projects/task-dialog-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEPENDENCY_TYPES, type DependencyType } from "@/modules/projects/schedule";
import type { useTaskLinks } from "./use-task-links";

const DEPENDENCY_TYPE_KEYS = {
  finish_to_start: ["dependencyTypeFinishStart", "dependencyTypeFinishStartCode"],
  start_to_start: ["dependencyTypeStartStart", "dependencyTypeStartStartCode"],
  finish_to_finish: ["dependencyTypeFinishFinish", "dependencyTypeFinishFinishCode"],
  start_to_finish: ["dependencyTypeStartFinish", "dependencyTypeStartFinishCode"],
} as const satisfies Record<DependencyType, readonly [string, string]>;

export function TaskDependenciesSection({
  details,
  readOnly,
  linkDirection,
  setLinkDirection,
  linkTaskId,
  setLinkTaskId,
  linkType,
  setLinkType,
  linkLagDays,
  setLinkLagDays,
  linkPending,
  addLink,
  removeLink,
}: {
  details: TaskDialogDetails | null;
  readOnly: boolean;
} & ReturnType<typeof useTaskLinks>) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const linkCandidates = (details?.linkableTasks ?? []).filter((candidate) =>
    !(linkDirection === "predecessor" ? details?.predecessors : details?.successors)
      ?.some((link) => link.taskId === candidate.id),
  );
  const candidateLabel = (candidate: { title: string; projectName: string | null }) =>
    candidate.projectName ? `${candidate.title} · ${candidate.projectName}` : candidate.title;

  function linkRow(link: NonNullable<TaskDialogDetails>["predecessors"][number]) {
    const [, codeKey] = DEPENDENCY_TYPE_KEYS[link.dependencyType];
    return (
      <div key={link.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
        <GitBranch className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate">{candidateLabel(link)}</span>
        <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-ink">
          {t(codeKey)}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{link.lagDays >= 0 ? "+" : ""}{link.lagDays}d</span>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={tCommon("delete")}
            disabled={linkPending}
            onClick={() => removeLink({ id: link.id, name: link.title })}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-medium">{t("dependencies")}</h3>
        <p className="text-xs text-muted-foreground">{t("dependenciesDescription")}</p>
      </div>
      {!details ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="grid gap-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">{t("taskPredecessors")}</h4>
            {details.predecessors.map(linkRow)}
            {details.projectPredecessors.map((link) => (
              <div key={link.id} className="grid gap-1 rounded-md border border-dashed px-2 py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {t("projectPredecessor", { name: link.projectName })}
                  </span>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={tCommon("delete")}
                      disabled={linkPending}
                      onClick={() => removeLink({ id: link.id, name: link.projectName, legacyProject: true })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("projectPredecessorHint")}</p>
              </div>
            ))}
            {details.predecessors.length === 0 && details.projectPredecessors.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("noTaskDependencies")}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">{t("taskSuccessors")}</h4>
            {details.successors.map(linkRow)}
            {details.successors.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("noTaskDependencies")}</p>
            )}
          </div>
          {!readOnly && (
            <div className="grid gap-2 rounded-md border border-dashed p-2">
              <div className="grid grid-cols-[8.5rem_1fr] gap-2">
                <Select
                  value={linkDirection}
                  onValueChange={(value) => {
                    setLinkDirection((value ?? "predecessor") as typeof linkDirection);
                    setLinkTaskId("none");
                  }}
                >
                  <SelectTrigger className="w-full" aria-label={t("dependencies")}>
                    <SelectValue>
                      {linkDirection === "predecessor" ? t("taskPredecessors") : t("taskSuccessors")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="predecessor">{t("taskPredecessors")}</SelectItem>
                    <SelectItem value="successor">{t("taskSuccessors")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={linkTaskId} onValueChange={(value) => setLinkTaskId(value ?? "none")}>
                  <SelectTrigger
                    className="w-full"
                    aria-label={linkDirection === "predecessor" ? t("choosePredecessor") : t("chooseSuccessor")}
                  >
                    <SelectValue>
                      {linkTaskId === "none"
                        ? linkDirection === "predecessor" ? t("choosePredecessor") : t("chooseSuccessor")
                        : (() => {
                            const candidate = linkCandidates.find((row) => row.id === linkTaskId);
                            return candidate ? candidateLabel(candidate) : "";
                          })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {linkDirection === "predecessor" ? t("choosePredecessor") : t("chooseSuccessor")}
                    </SelectItem>
                    {linkCandidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>{candidateLabel(candidate)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-[1fr_5.5rem_auto] gap-2">
                <Select value={linkType} onValueChange={(value) => setLinkType((value ?? "finish_to_start") as DependencyType)}>
                  <SelectTrigger className="w-full" aria-label={t("dependencyType")}>
                    <SelectValue>{t(DEPENDENCY_TYPE_KEYS[linkType][0])}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DEPENDENCY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{t(DEPENDENCY_TYPE_KEYS[type][0])}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={-365}
                  max={365}
                  value={linkLagDays}
                  onChange={(event) => setLinkLagDays(Number(event.target.value))}
                  aria-label={t("lagDays")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={addLink}
                  disabled={linkTaskId === "none" || linkPending}
                  aria-label={t("addDependency")}
                >
                  {linkPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
