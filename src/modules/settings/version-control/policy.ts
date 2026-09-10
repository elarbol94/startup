// Explicit exclusions: secrets and operational/derived data are not user versions.
export const excludedTables = new Set([
  "session", "account", "verification", "user_invitations", "wiki_presentation_access",
  "performance_events", "wiki_embeddings", "wiki_collaboration_rooms",
  "wiki_collaboration_updates", "wiki_collaboration_presence", "wiki_page_edit_leases",
  "wiki_presentation_edit_leases", "wiki_presentation_live_sessions",
  "calendar_reminder_deliveries", "wiki_notifications", "wiki_links",
]);

export function tracksTable(name: string) {
  return !excludedTables.has(name) && !name.startsWith("platform_");
}

// Domain transactions must remain authoritative for money, permissions and history.
export const protectedTables = new Set([
  "user",
  "entries", "entry_tax_lines", "entry_payment_lines", "entry_audit_log", "invoices", "invoice_items",
  "employees", "payroll_month_contexts", "accounting_vehicles", "accounting_assets", "budget_plans",
  "funding_program_templates", "funding_projects", "funding_budget_items", "funding_financing_sources",
  "funding_disbursements", "funding_booking_allocations", "funding_income_links", "funding_evidence_items",
  "employment_contract_periods", "personnel_tax_profiles", "personnel_scenarios", "project_hour_allocations",
  "funding_cost_profiles", "personnel_funding_project_links", "personnel_month_snapshots", "personnel_postings",
  "wiki_presentation_access", "wiki_presentation_members", "calendar_memberships", "task_assignees", "wiki_sources", "wiki_source_contributors", "wiki_source_tags", "calendar_events", "calendar_event_exceptions", "calendar_event_attendees", "calendar_reminders", "context_links", "task_contexts", "evidence_links", "wiki_pdf_annotations", "wiki_pdf_annotation_comments",
  "task_dependencies", "project_dependencies", "project_task_dependencies", "schedule_change_sets",
  "schedule_change_items", "project_schedule_change_items", "wiki_pdf_documents", "wiki_pdf_pages",
  "wiki_figure_assets", "wiki_figure_sources", "wiki_svg_assets",
]);

const restorableTables = new Set([
  "app_settings", "attachments", "user_profile_preferences", "business_locations", "categories", "customers",
  "projects", "tasks", "project_columns", "project_phases", "wiki_pages", "wiki_presentations",
  "wiki_categories", "wiki_comment_threads", "wiki_comments", "wiki_document_templates", "wiki_favorites",
  "wiki_page_sources", "wiki_page_tags", "wiki_proofing_words", "wiki_tags", "wiki_presentation_comments",
  "wiki_presentation_library", "calendar_preferences", "calendar_saved_views", "calendars",
  "municipality_analyses", "municipality_metrics",
]);
export function protectedTable(name: string) {
  return protectedTables.has(name) || !restorableTables.has(name);
}

// These fields participate in a multi-record schedule. Metadata can still be restored.
export const scheduleFields = new Set([
  "project_id", "column_id", "last_open_column_id", "phase_id", "parent_task_id", "start_date", "due_date",
  "planned_start_date", "target_end_date", "progress", "is_milestone", "constraint_type", "constraint_date",
  "status", "completed_at", "kind", "deadline_at", "is_completed",
]);
