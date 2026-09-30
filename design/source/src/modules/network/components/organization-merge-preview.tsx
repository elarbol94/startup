"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  organizationMergeFieldByKey,
  type NetworkOrganizationMergePreview,
  type OrganizationMergeChoice,
  type OrganizationMergeChoices,
} from "../organization-merge-fields";

/**
 * What an organisation merge will do: how many references move (counts only,
 * other people's private contacts are never named), a choice per conflicting
 * field (default: the surviving organisation's value) and what blocks it.
 */
export function OrganizationMergePreview({
  preview,
  choices,
  onChoose,
}: {
  preview: NetworkOrganizationMergePreview;
  choices: OrganizationMergeChoices;
  onChoose: (key: keyof OrganizationMergeChoices, choice: OrganizationMergeChoice) => void;
}) {
  const t = useTranslations("network");
  const { counts } = preview;
  const moves = [
    counts.contacts && t("organizationMerge.counts.contacts", { count: counts.contacts }),
    counts.leads && t("organizationMerge.counts.leads", { count: counts.leads }),
  ].filter(Boolean);

  return (
    <div className="space-y-3 text-sm" data-testid="network-organization-merge-preview">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border px-3 py-2">
          <div className="text-xs text-muted-foreground">{t("merge.keeps")}</div>
          <div className="font-medium break-words">{preview.keep.name}</div>
        </div>
        <div className="rounded-lg border border-dashed px-3 py-2">
          <div className="text-xs text-muted-foreground">{t("merge.removed")}</div>
          <div className="font-medium break-words">{preview.merge.name}</div>
        </div>
      </div>

      <div className="space-y-1 text-muted-foreground">
        <p>{moves.length ? t("merge.moves", { items: moves.join(", ") }) : t("organizationMerge.nothingToMove")}</p>
        {moves.length > 0 && <p className="text-xs">{t("organizationMerge.countsHint")}</p>}
      </div>
      {preview.filled.length > 0 && (
        <p className="text-muted-foreground">
          {t("merge.filled", { fields: preview.filled.map((key) => t(organizationMergeFieldByKey(key).label)).join(", ") })}
        </p>
      )}

      {preview.conflicts.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="font-medium">{t("merge.conflictsTitle")}</legend>
          <p className="text-xs text-muted-foreground">{t("organizationMerge.conflictsHint")}</p>
          {preview.conflicts.map((conflict) => {
            const field = organizationMergeFieldByKey(conflict.key);
            const chosen = choices[conflict.key] ?? "keep";
            return (
              <div key={conflict.key} className="space-y-1" role="radiogroup" aria-label={t(field.label)}>
                <div className="text-xs text-muted-foreground">{t(field.label)}</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(["keep", "merge"] as const).map((side) => (
                    <label
                      key={side}
                      className={cn(
                        "flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5",
                        chosen === side ? "border-primary bg-primary/5" : "hover:bg-muted",
                      )}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        name={`organization-merge-${conflict.key}`}
                        checked={chosen === side}
                        onChange={() => onChoose(conflict.key, side)}
                      />
                      <span className="min-w-0 break-words">{conflict[side]}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>
      )}

      {preview.blockers.map((blocker) => (
        <p key={blocker} className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive" role="alert">
          {t(`errors.${blocker}`)}
        </p>
      ))}
    </div>
  );
}
