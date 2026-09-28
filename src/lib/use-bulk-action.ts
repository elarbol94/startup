"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { BulkOutcome } from "@/lib/bulk";

/**
 * Runs a bulk server action: toasts the outcome, refreshes the route and
 * deselects the rows that went through. Skipped rows stay selected.
 */
export function useBulkAction(deselect: (ids: readonly string[]) => void) {
  const t = useTranslations("common.selection");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = useCallback((action: () => Promise<BulkOutcome>, messages?: { done?: (outcome: BulkOutcome) => string }) => new Promise<BulkOutcome | null>((resolve) => {
    startTransition(async () => {
      try {
        const outcome = await action();
        deselect(outcome.succeededIds);
        if (outcome.skipped.length === 0) toast.success(messages?.done?.(outcome) ?? t("done", { count: outcome.affectedIds.length }));
        else if (outcome.succeededIds.length === 0) toast.error(t("allSkipped", { count: outcome.skipped.length }));
        else toast.warning(t("partial", { done: outcome.succeededIds.length, skipped: outcome.skipped.length }));
        router.refresh();
        resolve(outcome);
      } catch (error) {
        toast.error(error instanceof Error && error.message ? error.message : t("failed"));
        resolve(null);
      }
    });
  }), [deselect, router, t]);
  return { run, pending };
}
