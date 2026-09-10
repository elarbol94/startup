import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { columnsFor, quote } from "./journal";
import { protectedTable, scheduleFields, tracksTable } from "./policy";

export type Snapshot = Record<string, string | number | null>;
export type Version = { id: number; table_name: string; record_key: string; operation: string; before_json: string | null; after_json: string | null; created_at: number; restore_reason?: string | null };
export type Side = "before" | "after";
export type RestoreProblem = "protected" | "missingVersion" | "schemaChanged" | "absentVersion" | "schedule" | "conflict" | "unchanged" | "dependencies" | "fileMissing";
export class RestoreError extends Error {
  constructor(public readonly code: RestoreProblem) { super(code); }
}
export type Preview = {
  version: Version; side: Side; current: Snapshot | null; target: Snapshot | null; token: string;
  changes: { field: string; current: string | number | null; target: string | number | null }[];
  problem: RestoreProblem | null;
};
const parse = (json: string | null): Snapshot | null => json === null ? null : JSON.parse(json);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const managedFields = new Set(["updated_at", "updated_by", "version", "content_version"]);

export function listVersions(sqlite: Database.Database, input: { table?: string; before?: number; query?: string }) {
  const where = ["1=1"];
  const values: (string | number)[] = [];
  if (input.table) { where.push("v.table_name = ?"); values.push(input.table); }
  if (input.before) { where.push("v.id < ?"); values.push(input.before); }
  if (input.query) {
    where.push("(record_key LIKE ? ESCAPE '\\' OR after_json LIKE ? ESCAPE '\\' OR before_json LIKE ? ESCAPE '\\')");
    const query = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`; values.push(query, query, query);
  }
  return sqlite.prepare(`SELECT v.*, r.reason AS restore_reason FROM platform_versions v LEFT JOIN platform_restores r ON v.id BETWEEN r.first_version_id AND r.last_version_id WHERE ${where.join(" AND ")} ORDER BY v.id DESC LIMIT 51`).all(...values) as Version[];
}

export function previewRestore(sqlite: Database.Database, id: number, side: Side): Preview {
  const version = sqlite.prepare("SELECT * FROM platform_versions WHERE id = ?").get(id) as Version | undefined;
  if (!version) throw new RestoreError("missingVersion");
  const columns = columnsFor(sqlite, version.table_name);
  const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk);
  const recordKey = parse(version.record_key)!;
  const target = parse(side === "before" ? version.before_json : version.after_json);
  if (!tracksTable(version.table_name) || !keys.length || JSON.stringify(keys.map(key => key.name)) !== JSON.stringify(Object.keys(recordKey))) {
    return { version, side, current: null, target, token: hash(null), problem: "schemaChanged",
      changes: Object.entries(target ?? {}).map(([field, value]) => ({ field, current: null, target: value })) };
  }
  const current = sqlite.prepare(`SELECT * FROM ${quote(version.table_name)} WHERE ${keys.map(key => `${quote(key.name)} IS ?`).join(" AND ")}`).get(...Object.values(recordKey)) as Snapshot | undefined;
  const head = sqlite.prepare("SELECT MAX(id) AS id FROM platform_versions WHERE table_name = ? AND record_key = ?").get(version.table_name, version.record_key);
  const changes = [...new Set([...Object.keys(current ?? {}), ...Object.keys(target ?? {})])]
    .filter(field => !managedFields.has(field) && (current?.[field] ?? null) !== (target?.[field] ?? null))
    .map(field => ({ field, current: current?.[field] ?? null, target: target?.[field] ?? null }));
  let problem: RestoreProblem | null = null;
  if (protectedTable(version.table_name)) problem = "protected";
  else if (!target) problem = "absentVersion";
  else if (columns.length !== Object.keys(target).length || columns.some(column => !(column.name in target)) || keys.some(key => target[key.name] !== recordKey[key.name])) problem = "schemaChanged";
  else if (["projects", "tasks", "project_columns", "project_phases"].includes(version.table_name) && current && changes.some(change => scheduleFields.has(change.field))) problem = "schedule";
  else if (!changes.length) problem = "unchanged";
  return { version, side, current: current ?? null, target, token: hash([current ?? null, head]), changes, problem };
}

export type RestoreHook = (table: string, target: Snapshot, current: Snapshot | null, actorId: string) => boolean;

/** Compare and apply under one write lock; triggers record the restore as a new version. */
export function restoreVersion(sqlite: Database.Database, input: { id: number; side: Side; token: string; reason: string }, actorId: string, hook?: RestoreHook) {
  return sqlite.transaction(() => {
    const preview = previewRestore(sqlite, input.id, input.side);
    if (preview.token !== input.token) throw new RestoreError("conflict");
    if (preview.problem) throw new RestoreError(preview.problem);
    const { version, current } = preview;
    const target = { ...preview.target! };
    const max = (sqlite.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM platform_versions").get() as { id: number }).id;
    if ("updated_at" in target) target.updated_at = Math.max(Date.now(), Number(current?.updated_at ?? 0) + 1);
    if ("updated_by" in target) target.updated_by = actorId;
    for (const field of ["version", "content_version"]) if (field in target) target[field] = Math.max(Number(target[field]), Number(current?.[field] ?? 0)) + 1;
    if (sqlite.pragma("foreign_keys", { simple: true }) !== 1) throw new RestoreError("dependencies");
    const parentField = "parent_id" in target ? "parent_id" : "parent_task_id" in target ? "parent_task_id" : null;
    if (parentField && "id" in target) {
      const seen = new Set([target.id]);
      let parent = target[parentField];
      while (parent !== null && parent !== undefined) {
        if (seen.has(parent)) throw new RestoreError("dependencies");
        seen.add(parent);
        const row = sqlite.prepare(`SELECT ${quote(parentField)} AS parent FROM ${quote(version.table_name)} WHERE id = ?`).get(parent) as { parent: string | null } | undefined;
        parent = row?.parent ?? null;
      }
    }
    const columns = columnsFor(sqlite, version.table_name);
    const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk);
    try {
      if (!hook?.(version.table_name, target, current, actorId)) {
        if (current) {
          const fields = columns.filter(column => !column.pk).map(column => column.name);
          sqlite.prepare(`UPDATE ${quote(version.table_name)} SET ${fields.map(field => `${quote(field)} = ?`).join(",")} WHERE ${keys.map(key => `${quote(key.name)} IS ?`).join(" AND ")}`)
            .run(...fields.map(field => target[field]), ...keys.map(key => current[key.name]));
        } else {
          const fields = columns.map(column => column.name);
          sqlite.prepare(`INSERT INTO ${quote(version.table_name)} (${fields.map(quote).join(",")}) VALUES (${fields.map(() => "?").join(",")})`).run(...fields.map(field => target[field]));
        }
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && String(error.code).startsWith("SQLITE_CONSTRAINT")) throw new RestoreError("dependencies");
      throw error;
    }
    const last = (sqlite.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM platform_versions").get() as { id: number }).id;
    sqlite.prepare("INSERT INTO platform_restores (version_id, side, actor_id, reason, created_at, first_version_id, last_version_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(input.id, input.side, actorId, input.reason, Date.now(), max + 1, last);
    return { firstVersionId: max + 1, lastVersionId: last };
  }).immediate();
}
