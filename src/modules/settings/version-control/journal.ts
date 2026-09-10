import type Database from "better-sqlite3";
import { tracksTable } from "./policy";

export type Column = { name: string; type: string; pk: number };
export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function columnsFor(sqlite: Database.Database, table: string) {
  return sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all() as Column[];
}
function snapshot(columns: Column[], prefix: string) {
  // Chunking avoids SQLite's function argument limit on wide business tables.
  const chunks: string[] = [];
  for (let i = 0; i < columns.length; i += 40) {
    chunks.push(`json_object(${columns.slice(i, i + 40).flatMap(column => [literal(column.name), `${prefix}.${quote(column.name)}`]).join(",")})`);
  }
  // Concatenation preserves SQL NULL values, unlike json_patch (which removes them).
  return chunks.length === 1 ? chunks[0] : `('{' || ${chunks.map(chunk => `substr(${chunk}, 2, length(${chunk}) - 2)`).join(" || ',' || ")} || '}')`;
}

/** Called after migrations, inside a transaction: baseline + triggers have no capture gap.
 * Persistent SQL-only triggers cover ORM writes, workers and standalone DB connections.
 */
export function installVersionJournal(sqlite: Database.Database, schemaTables: string[]) {
  sqlite.transaction(() => {
    for (const table of schemaTables.filter(tracksTable)) {
      const columns = columnsFor(sqlite, table);
      if (!columns.length) continue;
      if (columns.some(column => column.type.toUpperCase() === "BLOB")) throw new Error(`Unclassified binary table: ${table}`);
      const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk);
      if (!keys.length) throw new Error(`Versioned table requires a primary key: ${table}`);
      const key = (prefix: string) => snapshot(keys, prefix);
      const before = snapshot(columns, "old"), after = snapshot(columns, "new");
      const known = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(`platform_version_${table}_insert`);
      if (!known) {
        sqlite.exec(`INSERT INTO platform_versions (table_name, record_key, operation, before_json, after_json, created_at)
          SELECT ${literal(table)}, ${key("initial")}, 'baseline', NULL, ${snapshot(columns, "initial")}, CAST(unixepoch('subsec') * 1000 AS INTEGER)
          FROM ${quote(table)} AS initial`);
      }
      for (const operation of ["insert", "update", "delete"] as const) {
        const trigger = quote(`platform_version_${table}_${operation}`);
        sqlite.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
        sqlite.exec(`CREATE TRIGGER ${trigger} AFTER ${operation.toUpperCase()} ON ${quote(table)}
          ${operation === "update" ? `WHEN ${before} IS NOT ${after}` : ""}
          BEGIN INSERT INTO platform_versions (table_name, record_key, operation, before_json, after_json, created_at)
          VALUES (${literal(table)}, ${key(operation === "delete" ? "old" : "new")}, ${literal(operation)},
          ${operation === "insert" ? "NULL" : before}, ${operation === "delete" ? "NULL" : after}, CAST(unixepoch('subsec') * 1000 AS INTEGER)); END`);
      }
    }
  }).immediate();
}
