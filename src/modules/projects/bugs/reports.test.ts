import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ requireUserOrThrow: vi.fn(async () => ({ id: "reporter" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(":memory:"); sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite); migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});
const storage = vi.hoisted(() => { return { directory: "" }; });
vi.mock("@/lib/files", async importOriginal => {
  storage.directory = mkdtempSync(join(tmpdir(), "bug-reports-"));
  vi.stubEnv("UPLOADS_PATH", storage.directory);
  return await importOriginal();
});
import { db, sqlite } from "@/db";
import { attachments, projects, projectColumns, tasks, user } from "@/db/schema";
import { bugReports } from "./schema";
import { getBugReportContext, getBugReportDetails, submitBugReport } from "./actions";
import { saveBugScreenshot } from "./uploads";
import { requireUserOrThrow } from "@/lib/auth";

const input = () => ({ submissionId: randomUUID(), title: "Broken save", happened: "Button does nothing", steps: "Click save", expected: "Saved", pagePath: "/projects/p?secret=test#section", browser: "Test browser", locale: "en" as const });
const png = () => new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS6UAAAAASUVORK5CYII=", "base64")], "screen.png", { type: "image/png" });
async function create() { const result = await submitBugReport(input()); if ("error" in result) throw new Error(result.error); return result; }
beforeEach(() => {
  vi.mocked(requireUserOrThrow).mockResolvedValue({ id: "reporter" } as Awaited<ReturnType<typeof requireUserOrThrow>>);
  sqlite.exec("DELETE FROM bug_report_uploads; DELETE FROM bug_reports; DELETE FROM bug_report_project; DELETE FROM attachments; DELETE FROM tasks; DELETE FROM project_columns; DELETE FROM projects;");
  db.insert(user).values({ id: "reporter", name: "Reporter", email: "reporter@example.com", createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().run();
});
afterAll(() => { rmSync(storage.directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe("bug reporting", () => {
  it("creates one shared project under concurrent submissions and preserves ordinary task behavior", async () => {
    const reports = await Promise.all([create(), create(), create()]);
    expect(new Set(reports.map(report => report.projectId)).size).toBe(1);
    expect(db.select().from(projects).all()).toHaveLength(1);
    const columns = db.select().from(projectColumns).all();
    expect(columns.map(column => [column.name, column.workflowStage, column.isCompleted])).toEqual([["New", "todo", false], ["Investigating", "in_progress", false], ["Fixed", "todo", true]]);
    const task = db.select().from(tasks).where(eq(tasks.id, reports[0].taskId)).get()!;
    expect(task).toMatchObject({ title: "Broken save", createdBy: "reporter", assigneeId: null, priority: "medium", status: "open" });
    expect(task.description).toContain("Expected behavior\nSaved");
    expect(await getBugReportDetails(task.id)).toMatchObject({ pagePath: "/projects/p", browser: "Test browser", reporter: "Reporter" });
  });
  it("retries return the same task even after renaming or archiving the project", async () => {
    const data = input(); const first = await submitBugReport(data); if ("error" in first) throw new Error();
    db.update(projects).set({ name: "Renamed" }).where(eq(projects.id, first.projectId)).run();
    await create(); expect(db.select().from(projects).all()).toHaveLength(1);
    db.update(projects).set({ status: "archived" }).where(eq(projects.id, first.projectId)).run();
    expect(await submitBugReport(data)).toEqual(first);
    expect(await submitBugReport(input())).toEqual({ error: "archived" });
    expect(db.select().from(bugReports).all()).toHaveLength(2);
    vi.mocked(requireUserOrThrow).mockResolvedValue({ id: "another-user" } as Awaited<ReturnType<typeof requireUserOrThrow>>);
    await expect(submitBugReport(data)).rejects.toThrow("another user");
    expect((await getBugReportDetails(first.taskId))?.number).toBe(first.number);
  });
  it("rejects invalid or unauthenticated submissions without creating a project", async () => {
    await expect(submitBugReport({ ...input(), title: " " })).rejects.toThrow();
    await expect(submitBugReport({ ...input(), pagePath: "//external.example" })).rejects.toThrow();
    vi.mocked(requireUserOrThrow).mockRejectedValue(new Error("Unauthorized"));
    await expect(submitBugReport(input())).rejects.toThrow("Unauthorized");
    await expect(getBugReportContext()).rejects.toThrow("Unauthorized");
    expect(db.select().from(projects).all()).toHaveLength(0);
  });
  it("persists screenshots once across concurrent retries, enforces limits, and preserves the report after failures", async () => {
    const report = await create(); const uploadId = randomUUID();
    const results = await Promise.all([saveBugScreenshot(png(), report.taskId, "reporter", uploadId), saveBugScreenshot(png(), report.taskId, "reporter", uploadId)]);
    expect(results[0].id).toBe(results[1].id);
    await expect(saveBugScreenshot(new File(["<html>"], "bad.png", { type: "image/png" }), report.taskId, "reporter", randomUUID())).rejects.toThrow("Invalid screenshot");
    await expect(saveBugScreenshot(png(), report.taskId, "another-user", randomUUID())).rejects.toThrow("Only the reporter");
    await expect(saveBugScreenshot(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }), report.taskId, "reporter", randomUUID())).rejects.toThrow("10 MB");
    for (let i = 0; i < 4; i++) await saveBugScreenshot(png(), report.taskId, "reporter", randomUUID());
    await expect(saveBugScreenshot(png(), report.taskId, "reporter", randomUUID())).rejects.toThrow("Maximum five");
    expect(db.select().from(attachments).all()).toHaveLength(5);
    expect(db.select().from(bugReports).all()).toHaveLength(1);
    expect((await getBugReportDetails(report.taskId))?.screenshots).toHaveLength(5);
  });
});
