"use server";

import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projects, projectColumns, tasks, user } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { listAttachmentsFor } from "@/lib/files";
import { performanceBuildId } from "@/lib/performance";
import { bugReportProject, bugReports } from "./schema";

const inputSchema = z.object({
  submissionId: z.string().uuid(), title: z.string().trim().min(1).max(300),
  happened: z.string().trim().min(1).max(2000), steps: z.string().trim().max(1200).default(""),
  expected: z.string().trim().max(1200).default(""),
  pagePath: z.string().max(2000).refine(value => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")),
  browser: z.string().max(500), locale: z.enum(["de", "en"]).default("de"),
});

export async function getBugReportContext() {
  await requireUserOrThrow();
  const project = db.select({ id: projects.id, status: projects.status }).from(bugReportProject)
    .innerJoin(projects, eq(projects.id, bugReportProject.projectId)).where(eq(bugReportProject.key, "bugs")).get();
  return { project: project ?? null, buildVersion: performanceBuildId, time: new Date().toISOString() };
}

export async function submitBugReport(input: z.input<typeof inputSchema>) {
  const actor = await requireUserOrThrow();
  const data = inputSchema.parse(input);
  const result = db.transaction(() => {
    const previous = db.select({ number: bugReports.number, taskId: tasks.id, projectId: tasks.projectId, reporter: tasks.createdBy })
      .from(bugReports).innerJoin(tasks, eq(tasks.id, bugReports.taskId)).where(eq(bugReports.submissionId, data.submissionId)).get();
    if (previous) {
      if (previous.reporter !== actor.id) throw new Error("Submission belongs to another user");
      return { number: previous.number, taskId: previous.taskId, projectId: previous.projectId! };
    }
    let project = db.select().from(projects).innerJoin(bugReportProject, eq(projects.id, bugReportProject.projectId))
      .where(eq(bugReportProject.key, "bugs")).get()?.projects;
    if (!project) {
      project = db.insert(projects).values({ name: "Bugs", createdBy: actor.id, color: "#e11d48" }).returning().get();
      db.insert(bugReportProject).values({ key: "bugs", projectId: project.id }).run();
      db.insert(projectColumns).values([
        { projectId: project.id, name: data.locale === "de" ? "Neu" : "New", sortOrder: 1000, workflowStage: "todo" as const },
        { projectId: project.id, name: data.locale === "de" ? "In Untersuchung" : "Investigating", sortOrder: 2000, workflowStage: "in_progress" as const },
        { projectId: project.id, name: data.locale === "de" ? "Behoben" : "Fixed", sortOrder: 3000, isCompleted: true },
      ]).run();
    }
    if (project.status === "archived") return { error: "archived" as const };
    let column = db.select().from(projectColumns).where(and(eq(projectColumns.projectId, project.id), eq(projectColumns.isCompleted, false), eq(projectColumns.workflowStage, "todo")))
      .orderBy(asc(projectColumns.sortOrder)).get();
    if (!column) column = db.insert(projectColumns).values({ projectId: project.id, name: data.locale === "de" ? "Neu" : "New", sortOrder: 0 }).returning().get();
    const labels = data.locale === "de" ? ["Was ist passiert?", "Schritte zum Reproduzieren", "Erwartetes Verhalten"] : ["What happened?", "Steps to reproduce", "Expected behavior"];
    const description = [data.happened, data.steps, data.expected].flatMap((value, i) => value ? [`${labels[i]}\n${value}`] : []).join("\n\n");
    const last = db.select({ order: max(tasks.sortOrder) }).from(tasks).where(eq(tasks.columnId, column.id)).get()?.order ?? 0;
    const task = db.insert(tasks).values({ title: data.title, description, projectId: project.id, columnId: column.id, createdBy: actor.id, sortOrder: last + 1000 }).returning().get();
    const report = db.insert(bugReports).values({ taskId: task.id, submissionId: data.submissionId, pagePath: data.pagePath.split(/[?#]/)[0], buildVersion: performanceBuildId, browser: data.browser }).returning().get();
    return { number: report.number, taskId: task.id, projectId: project.id };
  }, { behavior: "immediate" });
  if (!("error" in result)) { revalidatePath("/"); revalidatePath("/projects"); revalidatePath(`/projects/${result.projectId}`); }
  return result;
}

export async function getBugReportDetails(taskId: string) {
  await requireUserOrThrow();
  const report = db.select({ number: bugReports.number, description: tasks.description, pagePath: bugReports.pagePath, buildVersion: bugReports.buildVersion, browser: bugReports.browser, createdAt: tasks.createdAt, reporter: user.name })
    .from(bugReports).innerJoin(tasks, eq(tasks.id, bugReports.taskId)).innerJoin(user, eq(user.id, tasks.createdBy)).where(eq(bugReports.taskId, taskId)).get();
  return report ? { ...report, screenshots: listAttachmentsFor("task", taskId).map(file => ({ id: file.id, name: file.fileName, mimeType: file.mimeType })) } : null;
}
