import { sqlite } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { listVersions, previewRestore, type Side } from "./store";

export async function getVersionHistory(input: { table?: string; before?: number; query?: string }) {
  await requireAdmin();
  const rows = listVersions(sqlite, input);
  const tables = sqlite.prepare("SELECT DISTINCT table_name FROM platform_versions ORDER BY table_name").all() as { table_name: string }[];
  const since = sqlite.prepare("SELECT MIN(created_at) AS since FROM platform_versions").get() as { since: number | null };
  return { rows: rows.slice(0, 50), hasMore: rows.length > 50, tables: tables.map(row => row.table_name), since: since.since };
}

export async function getRestorePreview(id: number, side: Side) {
  await requireAdmin();
  return previewRestore(sqlite, id, side);
}
