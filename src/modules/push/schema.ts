import { createId } from "@paralleldrive/cuid2";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "@/db/core-schema";

/** One browser/device that accepted Web Push for a user (e.g. the installed phone app). */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // Push texts are rendered on the server, in the language the device last used.
    locale: text("locale", { enum: ["de", "en"] }).notNull().default("de"),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
    index("push_subscriptions_user_idx").on(table.userId),
  ],
);

/** Which push categories a user wants; a missing row means all categories are on. */
export const pushPreferences = sqliteTable("push_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  activity: integer("activity", { mode: "boolean" }).notNull().default(true),
  calendar: integer("calendar", { mode: "boolean" }).notNull().default(true),
  tasksDue: integer("tasks_due", { mode: "boolean" }).notNull().default(true),
});

/** Idempotency log: each (user, key) is pushed at most once, across restarts and workers. */
export const pushDeliveries = sqliteTable(
  "push_deliveries",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("push_deliveries_user_key_idx").on(table.userId, table.key),
    index("push_deliveries_created_idx").on(table.createdAt),
  ],
);
