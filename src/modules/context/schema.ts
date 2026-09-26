import { createId } from "@paralleldrive/cuid2";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/db/core-schema";

export const contextOwnerTypes = ["project", "task"] as const;
export type ContextOwnerType = (typeof contextOwnerTypes)[number];

export const contextTargetTypes = [
  "wikiPage",
  "wikiSource",
  "pdf",
  "app",
  "calendarEvent",
  "invoice",
  "accountingEntry",
  "customer",
] as const;
export type ContextTargetType = (typeof contextTargetTypes)[number];

/** Wiki knowledge and app routes shown in the context panel. */
export const knowledgeTargetTypes = ["wikiPage", "wikiSource", "pdf", "app"] as const;
export type KnowledgeTargetType = (typeof knowledgeTargetTypes)[number];

/** Records from other modules that can be tagged with projects (owner "project"). */
export const projectLinkTargetTypes = [
  "calendarEvent",
  "invoice",
  "accountingEntry",
  "customer",
] as const;
export type ProjectLinkTargetType = (typeof projectLinkTargetTypes)[number];

export const contextRelationTypes = ["origin", "related"] as const;
export type ContextRelationType = (typeof contextRelationTypes)[number];

export const contextLinks = sqliteTable(
  "context_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    ownerType: text("owner_type", { enum: contextOwnerTypes }).notNull(),
    ownerId: text("owner_id").notNull(),
    targetType: text("target_type", { enum: contextTargetTypes }).notNull(),
    targetId: text("target_id").notNull().default(""),
    relation: text("relation", { enum: contextRelationTypes })
      .notNull()
      .default("related"),
    route: text("route").notNull(),
    label: text("label").notNull().default(""),
    anchorJson: text("anchor_json").notNull().default("{}"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("context_links_owner_idx").on(table.ownerType, table.ownerId),
    index("context_links_target_idx").on(table.targetType, table.targetId),
    uniqueIndex("context_links_unique").on(
      table.ownerType,
      table.ownerId,
      table.targetType,
      table.targetId,
      table.relation,
      table.route,
    ),
  ],
);
