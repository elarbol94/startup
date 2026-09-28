import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { attachments, user } from "@/db/core-schema";
import { wikiPages } from "../schema";

/**
 * Office (ONLYOFFICE / DOCX) documents. The committed DOCX versions are the
 * source of truth; `head_version_id` names the authoritative one and only the
 * office store advances it. See docs/office-documents.md.
 */
export const wikiOfficeDocuments = sqliteTable("wiki_office_documents", {
  pageId: text("page_id").primaryKey().references(() => wikiPages.id, { onDelete: "cascade" }),
  headVersionId: text("head_version_id"),
  currentSessionKey: text("current_session_key"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

export const officeSessionStates = ["open", "idle", "finalized", "superseded"] as const;

/** One ONLYOFFICE co-editing session; `key` is the document key the editors join. */
export const wikiOfficeSessions = sqliteTable("wiki_office_sessions", {
  key: text("key").primaryKey(),
  pageId: text("page_id").notNull().references(() => wikiPages.id, { onDelete: "cascade" }),
  baseVersionId: text("base_version_id").notNull(),
  state: text("state", { enum: officeSessionStates }).notNull().default("idle"),
  /** Monotonic: `lastsave` (ms) of the newest version from this session that became head. */
  headLastsave: integer("head_lastsave").notNull().default(0),
  lastError: text("last_error"),
  lastErrorAt: integer("last_error_at", { mode: "timestamp_ms" }),
  connectedUserIdsJson: text("connected_user_ids_json").notNull().default("[]"),
  openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
  lastCallbackAt: integer("last_callback_at", { mode: "timestamp_ms" }),
}, (table) => [index("wiki_office_sessions_page_idx").on(table.pageId, table.state)]);

export const officeVersionKinds = ["create", "import", "conversion", "forcesave", "final", "restore", "branch"] as const;

export const wikiOfficeVersions = sqliteTable("wiki_office_versions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  pageId: text("page_id").notNull().references(() => wikiPages.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  sessionKey: text("session_key"),
  kind: text("kind", { enum: officeVersionKinds }).notNull(),
  /** Document-server `lastsave` in ms; orders saves within one session. */
  lastsave: integer("lastsave"),
  attachmentId: text("attachment_id").notNull().references(() => attachments.id),
  changesAttachmentId: text("changes_attachment_id").references(() => attachments.id),
  historyJson: text("history_json"),
  previousVersionId: text("previous_version_id"),
  callbackDigest: text("callback_digest"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("wiki_office_versions_page_version_idx").on(table.pageId, table.version),
  uniqueIndex("wiki_office_versions_digest_idx").on(table.callbackDigest),
]);

export const officeOperationKinds = ["checkpoint", "restore"] as const;
export const officeOperationStates = ["created", "sent", "done", "failed"] as const;
export const officeOperationFailures = ["timeout", "conflict", "dropError", "nothingNew", "saveError"] as const;

/** Long-running operations persisted so a restart resumes or terminates them. */
export const wikiOfficeOperations = sqliteTable("wiki_office_operations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  pageId: text("page_id").notNull().references(() => wikiPages.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: officeOperationKinds }).notNull(),
  sessionKey: text("session_key"),
  targetVersionId: text("target_version_id"),
  expectedHeadId: text("expected_head_id"),
  state: text("state", { enum: officeOperationStates }).notNull().default("created"),
  failureReason: text("failure_reason", { enum: officeOperationFailures }),
  commandAttempts: integer("command_attempts").notNull().default(0),
  lastCommandResult: text("last_command_result"),
  resultVersionId: text("result_version_id"),
  deadlineAt: integer("deadline_at", { mode: "timestamp_ms" }).notNull(),
  requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  // At most one active operation per page.
  uniqueIndex("wiki_office_operations_active_idx").on(table.pageId).where(sql`state IN ('created', 'sent')`),
]);
