import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// No foreign keys to live records: deletion must never erase recovery history.
export const platformVersions = sqliteTable("platform_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tableName: text("table_name").notNull(),
  recordKey: text("record_key").notNull(),
  operation: text("operation", { enum: ["baseline", "insert", "update", "delete"] }).notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("platform_versions_record_idx").on(table.tableName, table.recordKey, table.id),
  index("platform_versions_table_idx").on(table.tableName, table.id),
]);

export const platformRestores = sqliteTable("platform_restores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  versionId: integer("version_id").notNull(),
  side: text("side").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
  firstVersionId: integer("first_version_id").notNull(),
  lastVersionId: integer("last_version_id").notNull(),
});
