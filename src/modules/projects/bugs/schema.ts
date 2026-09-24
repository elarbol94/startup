import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { projects, tasks } from "../schema";
import { attachments } from "@/db/core-schema";

export const bugReportProject = sqliteTable("bug_report_project", {
  key: text("key").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
});
export const bugReports = sqliteTable("bug_reports", {
  number: integer("number").primaryKey({ autoIncrement: true }),
  taskId: text("task_id").notNull().unique().references(() => tasks.id, { onDelete: "cascade" }),
  submissionId: text("submission_id").notNull().unique(),
  pagePath: text("page_path").notNull(),
  buildVersion: text("build_version").notNull(),
  browser: text("browser").notNull(),
  // Set by `npm run bugs -- mark` once a coding agent has worked on the report.
  // Only tags the report; the task keeps its board column.
  agentWorkedAt: integer("agent_worked_at", { mode: "timestamp_ms" }),
  agentBranch: text("agent_branch"),
  agentNote: text("agent_note"),
});
export const bugReportUploads = sqliteTable("bug_report_uploads", {
  attachmentId: text("attachment_id").primaryKey().references(() => attachments.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  uploadId: text("upload_id").notNull(),
}, table => [uniqueIndex("bug_upload_retry_idx").on(table.taskId, table.uploadId)]);
