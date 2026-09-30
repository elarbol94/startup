"use client";

// The shared "Projects" field: project chips plus a searchable "+ Project" picker.
// `ProjectPicker` is controlled (forms save it with the record), `LiveProjectLinks`
// saves every change right away (detail pages), `useProjectLinkDraft` loads and
// saves the tags of a record edited in a form.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ProjectChip, ProjectDot } from "@/modules/projects/components/project-chip";
import {
  getProjectLinks,
  listProjectLinkOptions,
  saveProjectLinks,
} from "../project-link-actions";
import type { ProjectRefDto } from "../project-link-refs";
import type { ProjectLinkTargetType } from "../schema";

let optionsRequest: Promise<ProjectRefDto[]> | null = null;

function loadOptions() {
  optionsRequest ??= listProjectLinkOptions().catch((error) => {
    optionsRequest = null;
    throw error;
  });
  return optionsRequest;
}

export function ProjectPicker({
  value,
  onChange,
  options: providedOptions,
  disabled = false,
  className,
}: {
  value: ProjectRefDto[];
  onChange: (next: ProjectRefDto[]) => void;
  /** Skips loading the list when the page already has it. */
  options?: ProjectRefDto[];
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("projectLinks");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<ProjectRefDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const options = providedOptions ?? loaded;
  const selected = new Set(value.map((project) => project.id));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      return;
    }
    if (providedOptions || loaded) return;
    setFailed(false);
    void loadOptions().then(setLoaded).catch(() => setFailed(true));
  }

  const search = query.trim().toLocaleLowerCase();
  // Archived projects only show up when searched for (or already selected).
  const visible = (options ?? []).filter((project) =>
    search ? project.name.toLocaleLowerCase().includes(search) : !project.archived || selected.has(project.id),
  );

  function toggle(project: ProjectRefDto) {
    onChange(selected.has(project.id) ? value.filter((item) => item.id !== project.id) : [...value, project]);
  }

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {value.map((project) => (
        <ProjectChip
          key={project.id}
          project={project}
          onRemove={disabled ? undefined : () => toggle(project)}
          removeLabel={t("remove", { name: project.name })}
        />
      ))}
      {!disabled && (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-xs text-muted-foreground hover:border-solid hover:bg-muted hover:text-foreground"
              />
            }
          >
            <Plus className="size-3" />
            {value.length === 0 ? t("addProject") : t("addAnother")}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-1.5 p-1.5">
            <label className="flex items-center gap-2 rounded-md border px-2">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (visible[0]) toggle(visible[0]);
                  }
                }}
                placeholder={t("search")}
                aria-label={t("search")}
                className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            <div className="max-h-64 overflow-y-auto" role="listbox" aria-multiselectable aria-label={t("projects")}>
              {!options && !failed && <Loader2 className="m-2 size-4 animate-spin text-muted-foreground" />}
              {failed && <p className="p-2 text-xs text-destructive">{t("loadError")}</p>}
              {options && visible.length === 0 && <p className="p-2 text-xs text-muted-foreground">{t("noProjects")}</p>}
              {visible.map((project) => {
                const checked = selected.has(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(project)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <ProjectDot color={project.color} />
                    <span className={cn("min-w-0 flex-1 truncate", project.archived && "text-muted-foreground")}>
                      {project.name}
                    </span>
                    {project.archived && <span className="text-[10px] text-muted-foreground">{t("archived")}</span>}
                    {checked && <Check className="size-3.5" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/**
 * Draft of a record's project tags inside a form: loads the saved tags for an
 * existing record and writes them after the record itself has been saved.
 */
export function useProjectLinkDraft(
  targetType: ProjectLinkTargetType,
  targetId: string | null,
  preset: ProjectRefDto[] = [],
  /** Starts over when this changes, e.g. each time a dialog opens. Defaults to `targetId`. */
  resetKey?: string | null,
) {
  const key = resetKey === undefined ? targetId : resetKey;
  const fresh = () => ({ key, value: targetId ? [] : preset, loading: Boolean(targetId), dirty: false });
  const [draft, setDraft] = useState(fresh);
  if (draft.key !== key) setDraft(fresh());

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    void getProjectLinks({ targetType, targetId })
      .catch(() => null)
      .then((projects) => {
        if (cancelled) return;
        setDraft((current) =>
          current.key !== key
            ? current
            : { ...current, loading: false, value: projects && !current.dirty ? projects : current.value },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [key, targetId, targetType]);

  return {
    value: draft.value,
    loading: draft.loading,
    onChange(next: ProjectRefDto[]) {
      setDraft((current) => ({ ...current, value: next, dirty: true }));
    },
    /** Saves the tags for the saved record: when changed, or when it is a new (or copied) record. */
    async persist(savedId: string) {
      const changed = draft.dirty || (savedId !== targetId && draft.value.length > 0);
      if (!changed) return;
      await saveProjectLinks({ targetType, targetId: savedId, projectIds: draft.value.map((project) => project.id) });
      setDraft((current) => ({ ...current, dirty: false }));
    },
  };
}

/** Tags that save on every change, for pages that show a single record. */
export function LiveProjectLinks({
  targetType,
  targetId,
  initial,
  label = true,
  className,
}: {
  targetType: ProjectLinkTargetType;
  targetId: string;
  initial: ProjectRefDto[];
  label?: boolean;
  className?: string;
}) {
  const t = useTranslations("projectLinks");
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  function change(next: ProjectRefDto[]) {
    const previous = value;
    setValue(next);
    setSaving(true);
    void saveProjectLinks({ targetType, targetId, projectIds: next.map((project) => project.id) })
      .then(() => router.refresh())
      .catch(() => {
        setValue(previous);
        toast.error(t("saveError"));
      })
      .finally(() => setSaving(false));
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {label && <span className="shrink-0 text-xs font-medium text-muted-foreground">{t("projects")}</span>}
      <ProjectPicker value={value} onChange={change} />
      {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
