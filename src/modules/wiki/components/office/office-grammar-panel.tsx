"use client";

import { useTranslations } from "next-intl";
import { BookPlus, Check, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GrammarIssue } from "./use-office-grammar";

/** LanguageTool results for the open document: jump to, replace, ignore or learn a word. */
export function OfficeGrammarPanel({ issues, state, onSelect, onReplace, onIgnore, onLearn, onRecheck, onClose }: {
  issues: GrammarIssue[] | null;
  state: "idle" | "checking" | "error";
  onSelect: (issue: GrammarIssue) => void;
  onReplace: (issue: GrammarIssue, replacement: string) => void;
  onIgnore: (issue: GrammarIssue) => void;
  onLearn: (issue: GrammarIssue) => void;
  onRecheck: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("officeDocuments.grammar");
  return <section aria-labelledby="office-grammar-title" className="flex min-h-0 flex-col gap-3">
    <div className="flex items-center gap-2">
      <h2 id="office-grammar-title" className="flex-1 text-sm font-medium">{t("title")}{issues ? ` (${issues.length})` : ""}</h2>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("recheck")} title={t("recheck")} disabled={state === "checking"} onClick={onRecheck}><RefreshCw className="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("close")} title={t("close")} onClick={onClose}><X className="size-4" /></Button>
    </div>
    {state === "checking" && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{t("checking")}</p>}
    {state === "error" && <p className="text-xs text-destructive">{t("unavailable")}</p>}
    {state !== "checking" && issues?.length === 0 && <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400"><Check className="size-3.5" />{t("clean")}</p>}
    <ul className="space-y-2">
      {issues?.map((issue) => <li key={issue.id} className="rounded-md border p-2 text-sm">
        <button type="button" className="w-full text-left" title={t("jump")} onClick={() => onSelect(issue)}>
          <p className="text-xs text-muted-foreground">
            …{issue.context.before}<mark className={`rounded-sm px-0.5 ${issue.kind === "spelling" ? "bg-red-500/15 text-red-800 dark:text-red-300" : "bg-amber-500/20 text-amber-900 dark:text-amber-200"}`}>{issue.expected}</mark>{issue.context.after}…
          </p>
          <p className="mt-1">{issue.message}</p>
        </button>
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.replacements.map((replacement) => <Button key={replacement} type="button" size="xs" variant="secondary" onClick={() => onReplace(issue, replacement)}>{replacement || t("remove")}</Button>)}
          <Button type="button" size="xs" variant="ghost" onClick={() => onIgnore(issue)}>{t("ignore")}</Button>
          {issue.kind === "spelling" && <Button type="button" size="xs" variant="ghost" onClick={() => onLearn(issue)}><BookPlus className="size-3.5" />{t("learn")}</Button>}
        </div>
      </li>)}
    </ul>
  </section>;
}
