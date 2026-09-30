"use client";

// The one way a project appears outside its own page: colour dot + name, with a
// hover card (status, manager, open work, next due item) and a link to the board.
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { PreviewCard } from "@base-ui/react/preview-card";
import { AlertTriangle, CalendarClock, Diamond, Loader2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadProjectPreview } from "../preview-actions";
import type { ProjectPreview } from "../pulse";

export type ProjectChipProject = { id: string; name: string; color: string; archived?: boolean };

// One request per project and page load, shared by every chip that shows it.
const previewCache = new Map<string, Promise<ProjectPreview | null>>();

function fetchPreview(projectId: string) {
  let request = previewCache.get(projectId);
  if (!request) {
    request = loadProjectPreview(projectId).catch(() => {
      previewCache.delete(projectId);
      return null;
    });
    previewCache.set(projectId, request);
  }
  return request;
}

export function ProjectDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ backgroundColor: color }} />;
}

export function ProjectChip({
  project,
  size = "sm",
  onRemove,
  removeLabel,
  className,
}: {
  project: ProjectChipProject;
  size?: "xs" | "sm";
  /** Shows a remove button next to the name. */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  const [preview, setPreview] = useState<ProjectPreview | null | undefined>(undefined);

  function handleOpenChange(open: boolean) {
    if (!open || preview !== undefined) return;
    void fetchPreview(project.id).then(setPreview);
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center rounded-full border bg-background align-middle",
        size === "xs" ? "h-5 text-[11px]" : "h-6 text-xs",
        project.archived && "opacity-70",
        className,
      )}
    >
      <PreviewCard.Root onOpenChange={handleOpenChange}>
        <PreviewCard.Trigger
          delay={350}
          closeDelay={120}
          render={<Link href={`/projects/${encodeURIComponent(project.id)}`} />}
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 rounded-full font-medium text-foreground/90 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            size === "xs" ? "px-1.5" : "px-2",
            onRemove && "pr-1",
          )}
        >
          <ProjectDot color={project.color} />
          <span className="truncate">{project.name}</span>
        </PreviewCard.Trigger>
        <PreviewCard.Portal>
          <PreviewCard.Positioner sideOffset={6} className="isolate z-50">
            <PreviewCard.Popup className="w-72 origin-(--transform-origin) rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
              <ProjectPreviewBody project={project} preview={preview} />
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          className="mr-1 grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

function Line({ icon, children, tone }: { icon: ReactNode; children: ReactNode; tone?: "danger" }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs", tone === "danger" ? "text-destructive" : "text-muted-foreground")}>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

function ProjectPreviewBody({ project, preview }: { project: ProjectChipProject; preview: ProjectPreview | null | undefined }) {
  const t = useTranslations("projectLinks.preview");
  const format = useFormatter();
  const date = (value: string) => format.dateTime(new Date(`${value}T00:00:00`), { day: "numeric", month: "short" });
  const total = preview ? preview.open + preview.done : 0;
  const percent = preview && total > 0 ? Math.round((preview.done / total) * 100) : 0;

  return (
    <div className="grid gap-2.5">
      <div className="flex items-start gap-2">
        <ProjectDot color={project.color} className="mt-1.5 size-2.5" />
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{project.name}</p>
          {preview?.archived && <p className="text-xs text-muted-foreground">{t("archived")}</p>}
          {preview?.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{preview.description}</p>}
        </div>
      </div>
      {preview === undefined ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : preview === null ? (
        <p className="text-xs text-muted-foreground">{t("unavailable")}</p>
      ) : (
        <>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{t("tasks", { open: preview.open, done: preview.done })}</span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: project.color }} />
            </div>
          </div>
          {preview.overdue > 0 && (
            <Line icon={<AlertTriangle className="size-3.5 shrink-0" />} tone="danger">
              {t("overdue", { count: preview.overdue })}
            </Line>
          )}
          {preview.next && (
            <Line icon={preview.next.milestone ? <Diamond className="size-3.5 shrink-0" /> : <CalendarClock className="size-3.5 shrink-0" />}>
              {t("next", { title: preview.next.title, date: date(preview.next.dueDate) })}
            </Line>
          )}
          <Line icon={<UserRound className="size-3.5 shrink-0" />}>
            {preview.managerName ? t("manager", { name: preview.managerName }) : t("noManager")}
          </Line>
          {preview.targetEndDate && (
            <Line icon={<CalendarClock className="size-3.5 shrink-0" />}>{t("targetEnd", { date: date(preview.targetEndDate) })}</Line>
          )}
        </>
      )}
    </div>
  );
}
