"use client";

import { useTranslations } from "next-intl";
import { Bug, Lightbulb, MessageSquare, Sparkles, type LucideIcon } from "lucide-react";
import { REPORT_KINDS, type ReportKind } from "./kinds";

export const KIND_ICONS: Record<ReportKind, LucideIcon> = { bug: Bug, feature: Lightbulb, improvement: Sparkles, other: MessageSquare };

/** Native radio buttons styled as a segmented control: arrow keys and labels work for free. */
export function KindPicker({ value, onChange, disabled }: { value: ReportKind; onChange: (kind: ReportKind) => void; disabled?: boolean }) {
  const t = useTranslations("bugReports");
  return <fieldset className="space-y-1" disabled={disabled}>
    <legend className="mb-1 text-sm font-medium">{t("kind")}</legend>
    {/* Two columns at every width: German labels ("Funktionswunsch") overflow four. */}
    <div className="grid grid-cols-2 gap-2">
      {REPORT_KINDS.map(kind => {
        const Icon = KIND_ICONS[kind];
        return <label key={kind} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          <input type="radio" name="bug-kind" value={kind} checked={value === kind} onChange={() => onChange(kind)} className="sr-only" />
          <Icon className="size-4 shrink-0" aria-hidden="true" />{t(`kinds.${kind}.label`)}
        </label>;
      })}
    </div>
  </fieldset>;
}
