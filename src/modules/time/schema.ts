import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "@/db/core-schema";
import { projects, tasks } from "@/modules/projects/schema";
import { timeEntryKinds, timeEntrySources } from "./constants";

export { timeEntryKinds, timeEntrySources };
export type { TimeEntryKind, TimeEntrySource } from "./constants";

/**
 * One working-time record per row. Start/end are stored as instants (not only a
 * duration) so the records can serve as Arbeitszeitaufzeichnungen. `endedAt`
 * is null while a timer is running; at most one running entry per user.
 */
export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => user.id),
    /** Europe/Vienna calendar date of the start, YYYY-MM-DD. */
    workDate: text("work_date").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    breakMinutes: integer("break_minutes").notNull().default(0),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    kind: text("kind", { enum: timeEntryKinds }).notNull().default("work"),
    source: text("source", { enum: timeEntrySources }).notNull().default("manual"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("time_entries_user_date_idx").on(table.userId, table.workDate),
    index("time_entries_project_date_idx").on(table.projectId, table.workDate),
    uniqueIndex("time_entries_one_running_idx").on(table.userId).where(sql`${table.endedAt} IS NULL`),
  ],
);

export type TimeEntry = typeof timeEntries.$inferSelect;
