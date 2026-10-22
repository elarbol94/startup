// Predecessor/successor links of an existing project: lists them, adds a predecessor
// and removes a link. Used by project-form.tsx.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addProjectPredecessor,
  getProjectLinks,
  removeProjectDependency,
} from "@/modules/projects/project-actions";
import type { ProjectLinkSummary } from "@/modules/projects/project-links";
import { PredecessorSelect } from "./predecessor-select";
import type { ProjectPredecessorOption, ProjectRecord } from "./project-dialog-types";
import { optionKey } from "./project-dialog-utils";

const linkErrorKey = {
  notFound: "projectLinkNotFound",
  self: "projectLinkSelf",
  exists: "projectLinkExists",
  cycle: "projectLinkCycle",
} as const;

export function ProjectLinksEditor({
  project,
  options,
  onProjectChanged,
}: {
  project: ProjectRecord;
  options: ProjectPredecessorOption[];
  onProjectChanged: (project: ProjectRecord) => void;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [links, setLinks] = useState<ProjectLinkSummary | null>(null);
  const [choice, setChoice] = useState("none");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProjectLinks(project.id)
      .then((result) => {
        if (!cancelled) setLinks(result);
      })
      .catch(() => {
        if (!cancelled) toast.error(tCommon("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, tCommon]);

  const linked = new Set(links?.predecessors.map((link) => `${link.type}:${link.targetId}`));
  const available = options.filter((option) => !linked.has(optionKey(option)));

  async function add() {
    const selected = available.find((option) => optionKey(option) === choice);
    if (!selected) return;
    setPending(true);
    try {
      const result = await addProjectPredecessor({
        projectId: project.id,
        predecessor: { type: selected.type, id: selected.id },
      });
      if (!result.ok) {
        toast.error(t(linkErrorKey[result.code]));
        return;
      }
      setLinks(result.links);
      setChoice("none");
      onProjectChanged(result.project);
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      await removeProjectDependency({ id });
      setLinks((current) =>
        current && {
          predecessors: current.predecessors.filter((link) => link.id !== id),
          successors: current.successors.filter((link) => link.id !== id),
        },
      );
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  const linkRow = (id: string, title: string, meta: string | null) => (
    <li key={id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate" title={title}>
        {title}
        {meta && <span className="ml-1 text-xs text-muted-foreground">· {meta}</span>}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={pending}
        aria-label={t("removeProjectLink", { name: title })}
        title={t("removeProjectLink", { name: title })}
        onClick={() => remove(id)}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  );

  return (
    <section className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3" aria-label={t("dependencies")}>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("projectPredecessors")}</span>
        <p className="text-xs text-muted-foreground">{t("projectPredecessorNote")}</p>
        {links && links.predecessors.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("noProjectPredecessors")}</p>
        )}
        {links && links.predecessors.length > 0 && (
          <ul className="flex flex-col gap-1">
            {links.predecessors.map((link) =>
              linkRow(
                link.id,
                link.title,
                link.type === "project"
                  ? t("projectLinkKindProject")
                  : [t("projectLinkKindTask"), link.projectName].filter(Boolean).join(" · "),
              ),
            )}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <PredecessorSelect
              id="project-add-predecessor"
              value={choice}
              options={available}
              onChange={setChoice}
            />
          </div>
          <Button type="button" variant="outline" size="sm" disabled={pending || choice === "none"} onClick={add}>
            {t("addPredecessor")}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("projectSuccessors")}</span>
        {links && links.successors.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("noProjectSuccessors")}</p>
        )}
        {links && links.successors.length > 0 && (
          <ul className="flex flex-col gap-1">
            {links.successors.map((link) => linkRow(link.id, link.title, t("projectLinkKindProject")))}
          </ul>
        )}
      </div>
    </section>
  );
}
