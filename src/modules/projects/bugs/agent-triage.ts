// Read/tag helpers for the `triage-bugs` Claude Code skill (scripts/bug-reports.ts).
// Plain better-sqlite3 so the script can run as a bundled file inside the
// production container, without the Next.js runtime or the app's db module.
import path from "node:path";
import type Database from "better-sqlite3";

export type ExportedBugReport = {
  number: number;
  taskId: string;
  title: string;
  description: string;
  column: string | null;
  pagePath: string;
  buildVersion: string;
  browser: string;
  reporter: string | null;
  createdAt: string;
  agentWorkedAt: string | null;
  agentBranch: string | null;
  agentNote: string | null;
  screenshots: Array<{ fileName: string; mimeType: string; path: string }>;
};

type ReportRow = Omit<ExportedBugReport, "createdAt" | "agentWorkedAt" | "screenshots"> & {
  createdAt: number;
  agentWorkedAt: number | null;
};

/**
 * Open bug reports: top-level tasks outside a completed column. Reports an
 * agent already worked on are left out unless `includeTagged` is set.
 */
export function exportBugReports(
  sqlite: Database.Database,
  { uploadsPath, includeTagged = false }: { uploadsPath: string; includeTagged?: boolean },
): ExportedBugReport[] {
  const rows = sqlite.prepare(`
    SELECT b.number, t.id AS taskId, t.title, t.description, c.name AS "column",
      b.page_path AS pagePath, b.build_version AS buildVersion, b.browser,
      u.name AS reporter, t.created_at AS createdAt,
      b.agent_worked_at AS agentWorkedAt, b.agent_branch AS agentBranch, b.agent_note AS agentNote
    FROM bug_reports b
    JOIN tasks t ON t.id = b.task_id
    LEFT JOIN project_columns c ON c.id = t.column_id
    LEFT JOIN user u ON u.id = t.created_by
    WHERE t.parent_task_id IS NULL
      AND COALESCE(c.is_completed, 0) = 0
      AND (? OR b.agent_worked_at IS NULL)
    ORDER BY b.number
  `).all(includeTagged ? 1 : 0) as ReportRow[];
  const screenshots = sqlite.prepare(`
    SELECT file_name AS fileName, mime_type AS mimeType, stored_name AS storedName
    FROM attachments WHERE entity_type = 'task' AND entity_id = ? ORDER BY created_at
  `);
  return rows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    agentWorkedAt: row.agentWorkedAt === null ? null : new Date(row.agentWorkedAt).toISOString(),
    screenshots: (screenshots.all(row.taskId) as Array<{ fileName: string; mimeType: string; storedName: string }>)
      .map(file => ({ fileName: file.fileName, mimeType: file.mimeType, path: path.join(uploadsPath, file.storedName) })),
  }));
}

/** Tags reports as worked on by an agent. Does not move the task on the board. */
export function markBugReports(
  sqlite: Database.Database,
  numbers: number[],
  { branch, note, now = new Date() }: { branch: string; note?: string; now?: Date },
) {
  if (!numbers.length || numbers.some(number => !Number.isInteger(number) || number < 1)) throw new Error("Pass report numbers, e.g. 12 13");
  if (!branch.trim()) throw new Error("--branch is required");
  const update = sqlite.prepare("UPDATE bug_reports SET agent_worked_at = ?, agent_branch = ?, agent_note = ? WHERE number = ?");
  return sqlite.transaction(() => {
    const missing = numbers.filter(number => update.run(now.getTime(), branch.trim(), note?.trim() || null, number).changes === 0);
    if (missing.length) throw new Error(`Unknown report numbers: ${missing.join(", ")}`);
    return numbers.length;
  }).immediate();
}
