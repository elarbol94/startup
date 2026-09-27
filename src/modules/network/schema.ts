import { createId } from "@paralleldrive/cuid2";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { user } from "@/db/core-schema";
import { tasks } from "@/modules/projects/schema";
import {
  contactClosenessLevels,
  contactRelationships,
  contactVisibilities,
  interactionChannels,
  leadKinds,
  leadStatuses,
} from "./constants";

export { contactClosenessLevels, contactRelationships, contactVisibilities, interactionChannels, leadKinds, leadStatuses };

/**
 * A person in the founders' network. Private to its owner unless shared with
 * the team: these are notes about private individuals, so nothing is visible
 * to others by default.
 */
export const networkContacts = sqliteTable(
  "network_contacts",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    visibility: text("visibility", { enum: contactVisibilities }).notNull().default("private"),
    name: text("name").notNull(),
    /** Free text for now ("Klimabündnis Österreich"); organisations get their own table later. */
    organization: text("organization").notNull().default(""),
    role: text("role").notNull().default(""),
    relationship: text("relationship", { enum: contactRelationships }),
    closeness: text("closeness", { enum: contactClosenessLevels }),
    /** Where or how we met: "Party at Lukas's", "Startup meetup Graz". */
    metContext: text("met_context").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    linkedinUrl: text("linkedin_url").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** YYYY-MM-DD */
    lastContactOn: text("last_contact_on"),
    /** Reserved for a later sync to an external CRM such as Twenty. */
    externalCrmId: text("external_crm_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("network_contacts_owner_name_idx").on(table.ownerId, table.name),
    index("network_contacts_visibility_idx").on(table.visibility),
  ],
);

/**
 * Something a contact could do for us: "knows someone at Klimabündnis
 * Österreich", "offered help with graphic design". The introduced person may
 * be unknown (only `targetName`/`targetOrganization`) or, once met, a contact
 * of their own (`targetContactId`).
 */
export const networkLeads = sqliteTable(
  "network_leads",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    contactId: text("contact_id").notNull().references(() => networkContacts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: leadKinds }).notNull().default("info"),
    summary: text("summary").notNull(),
    targetName: text("target_name").notNull().default(""),
    targetOrganization: text("target_organization").notNull().default(""),
    targetContactId: text("target_contact_id").references((): AnySQLiteColumn => networkContacts.id, { onDelete: "set null" }),
    status: text("status", { enum: leadStatuses }).notNull().default("open"),
    nextStep: text("next_step").notNull().default(""),
    /** YYYY-MM-DD */
    dueOn: text("due_on"),
    /** Set when the next step was turned into a task. */
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("network_leads_contact_idx").on(table.contactId),
    index("network_leads_status_due_idx").on(table.status, table.dueOn),
  ],
);

export const networkTags = sqliteTable(
  "network_tags",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("network_tags_normalized_unique").on(table.normalizedName)],
);

export const networkContactTags = sqliteTable(
  "network_contact_tags",
  {
    contactId: text("contact_id").notNull().references(() => networkContacts.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => networkTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.tagId] }), index("network_contact_tags_tag_idx").on(table.tagId)],
);

/**
 * One touchpoint with a contact: "met at the Gründerstammtisch", "called about
 * the intro". The contact's `lastContactOn` follows the latest entry.
 */
export const networkInteractions = sqliteTable(
  "network_interactions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    contactId: text("contact_id").notNull().references(() => networkContacts.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD */
    occurredOn: text("occurred_on").notNull(),
    channel: text("channel", { enum: interactionChannels }).notNull().default("meeting"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("network_interactions_contact_date_idx").on(table.contactId, table.occurredOn)],
);
