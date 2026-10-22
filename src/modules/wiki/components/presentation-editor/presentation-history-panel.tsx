"use client";
// The revision list of the "Verlauf" dialog: who saved when, and a restore button each.
// Used by presentation-editor.tsx.
import { useFormatter, useTranslations } from "next-intl";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserIdentity } from "@/components/user-identity";
import type { PresentationRevisionItem } from "../../presentation-queries";

export function PresentationHistoryPanel({ revisions, readOnly, restoring, onRestore }: {
  revisions: PresentationRevisionItem[];
  readOnly: boolean;
  restoring: string | null;
  onRestore: (revisionId: string) => Promise<void>;
}) {
  const t = useTranslations("wiki");
  const format = useFormatter();
  return (
    <section className="mt-5 border-t pt-4">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <History className="size-3.5" />{t("presentations.history")}
      </h2>
      {revisions.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("presentations.noRevisions")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {revisions.map((revision) => (
            <li key={revision.id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{format.dateTime(revision.createdAt, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Vienna" })}</span>
                <span className="block truncate text-muted-foreground"><UserIdentity userId={revision.createdBy} name={revision.createdByName} compact /></span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={readOnly || restoring !== null}
                onClick={() => onRestore(revision.id)}
              >
                {restoring === revision.id ? <Loader2 className="size-3.5 animate-spin" /> : t("presentations.restore")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
