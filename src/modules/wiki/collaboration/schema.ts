import { sqliteTable, text, integer, blob, primaryKey } from "drizzle-orm/sqlite-core";

export const wikiCollaborationRooms = sqliteTable("wiki_collaboration_rooms", {
  key: text("key").primaryKey(),
  state: blob("state", { mode: "buffer" }).notNull(),
  sequence: integer("sequence").notNull().default(0),
});
export const wikiCollaborationUpdates = sqliteTable("wiki_collaboration_updates", {
  room: text("room").notNull().references(() => wikiCollaborationRooms.key, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  update: blob("update", { mode: "buffer" }).notNull(),
}, table => [primaryKey({ columns: [table.room, table.sequence] })]);
export const wikiCollaborationPresence = sqliteTable("wiki_collaboration_presence", {
  room: text("room").notNull().references(() => wikiCollaborationRooms.key, { onDelete: "cascade" }),
  session: text("session").notNull(),
  userId: text("user_id").notNull(),
  awareness: text("awareness").notNull(),
  touchedAt: integer("touched_at").notNull(),
}, table => [primaryKey({ columns: [table.room, table.session] })]);
