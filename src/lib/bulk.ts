import { z } from "zod";

/** Upper bound for one bulk request; larger selections are refused, not truncated. */
export const MAX_BULK_IDS = 500;

export const bulkIdsSchema = z.array(z.string().min(1).max(128)).min(1).max(MAX_BULK_IDS)
  .transform((ids) => [...new Set(ids)]);

export type BulkSkipReason = "notFound" | "forbidden" | "blocked" | "busy" | "notTrashed" | "tooManyTags" | "locked";

/**
 * Result of every bulk server action. `succeededIds` are requested ids that went
 * through (no-ops included); `affectedIds` adds cascaded rows such as subpages, for
 * counts; skipped ids stay selected in the UI so the user sees what failed.
 */
export type BulkOutcome = {
  succeededIds: string[];
  affectedIds: string[];
  skipped: { id: string; reason: BulkSkipReason }[];
};

export function bulkOutcome(succeededIds: string[], skipped: BulkOutcome["skipped"] = [], affectedIds = succeededIds): BulkOutcome {
  return { succeededIds, affectedIds, skipped };
}
