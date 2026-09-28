import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { UPLOADS_PATH } from "@/lib/files";
import { officeConfig } from "./config";
import { defaultOperationDeps, recoverOfficeOperations } from "./operations";

const ORPHAN_AGE_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Removes office version files that were staged but never registered (the
 * process died between writing the file and committing its row). Only files
 * older than an hour are considered, so in-flight saves are never touched.
 */
export function sweepOrphanedOfficeFiles(now = Date.now()) {
  const known = new Set(db.all<{ stored_name: string }>(sql`SELECT stored_name FROM attachments`).map((row) => row.stored_name));
  let removed = 0;
  if (!fs.existsSync(UPLOADS_PATH)) return removed;
  for (const shard of fs.readdirSync(UPLOADS_PATH, { withFileTypes: true })) {
    if (!shard.isDirectory() || !/^[0-9a-f]{2}$/.test(shard.name)) continue;
    for (const file of fs.readdirSync(path.join(UPLOADS_PATH, shard.name))) {
      if (!/\.(docx|zip)$/.test(file)) continue;
      const storedName = `${shard.name}/${file}`;
      if (known.has(storedName)) continue;
      const absolute = path.join(UPLOADS_PATH, storedName);
      const stat = fs.statSync(absolute);
      if (now - stat.mtimeMs < ORPHAN_AGE_MS) continue;
      // Files of deleted attachments are retained under .history, never in the shards.
      fs.rmSync(absolute, { force: true });
      removed++;
    }
  }
  return removed;
}

/** Startup: resume or terminate persisted office operations and sweep orphans daily. */
export function startOfficeMaintenance() {
  const config = officeConfig();
  if (config) void recoverOfficeOperations(defaultOperationDeps(config));
  const sweep = () => {
    try {
      const removed = sweepOrphanedOfficeFiles();
      if (removed) console.info(JSON.stringify({ event: "office_orphans_removed", removed }));
    } catch (error) {
      console.warn(JSON.stringify({ event: "office_orphan_sweep_failed", reason: error instanceof Error ? error.message : String(error) }));
    }
  };
  sweep();
  setInterval(sweep, SWEEP_INTERVAL_MS).unref?.();
}
