/*
 * Office conversion dry run (read-only on a database COPY).
 *
 *   DATABASE_PATH=/path/to/copy/app.db UPLOADS_PATH=/path/to/copy/uploads \
 *     npx tsx scripts/office-conversion-dry-run.ts --out ./dry-run [--origin https://host] [--page <id>]
 *
 * For every TipTap page with document layout it converts the current body
 * (the live collaboration state when present) to DOCX, re-reads the DOCX and
 * checks that citations, PDF evidence, wiki links, tasks, deadlines and text
 * survived. It writes the DOCX files and report.md/report.json to --out and
 * never changes the database. See docs/office-documents.md.
 */
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";

// App modules guard themselves with `import "server-only"`, which only Next.js
// resolves; outside it the guard is a no-op.
const localRequire = createRequire(path.join(process.cwd(), "package.json"));
const serverOnly = localRequire.resolve("next/dist/compiled/server-only/empty.js");
const resolver = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...rest) { return request === "server-only" ? serverOnly : resolve.call(this, request, ...rest); };

const { values } = parseArgs({ options: { out: { type: "string" }, origin: { type: "string", default: "https://startup.elarbol.me" }, page: { type: "string" } } });
if (!process.env.DATABASE_PATH || !values.out) {
  console.error("Usage: DATABASE_PATH=<copy of app.db> UPLOADS_PATH=<copy of uploads> tsx scripts/office-conversion-dry-run.ts --out <dir> [--origin <url>] [--page <id>]");
  process.exit(2);
}
// Never touch the working development database by accident.
if (path.resolve(process.env.DATABASE_PATH) === path.resolve("data/app.db")) {
  console.error("Refusing to run against data/app.db: pass a copy.");
  process.exit(2);
}

async function main() {
  const { db } = await import("@/db");
  const { wikiPages } = await import("@/db/schema");
  const { and, eq, isNull } = await import("drizzle-orm");
  const { planConversion } = await import("@/modules/wiki/office/convert");

  const pages = db.select({ id: wikiPages.id, title: wikiPages.title }).from(wikiPages)
    .where(and(isNull(wikiPages.deletedAt), eq(wikiPages.documentEngine, "tiptap"), values.page ? eq(wikiPages.id, values.page) : undefined))
    .all();
  const out = path.resolve(values.out!);
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  for (const page of pages) {
    try {
      const plan = await planConversion(page.id, { origin: values.origin! });
      const file = `${plan.page.slug}.docx`;
      fs.writeFileSync(path.join(out, file), plan.prepared.buffer);
      const { prepared, ...summary } = plan;
      results.push({ ...summary, file, docxBytes: prepared.buffer.byteLength });
    } catch (error) {
      results.push({ page, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(results, null, 2));
  const lines = ["# Office conversion dry run", "", `Database: ${process.env.DATABASE_PATH}`, `Pages: ${results.length}, convertible: ${results.filter((result) => result.ok).length}`, ""];
  for (const result of results) {
    if ("error" in result) { lines.push(`## ✗ ${result.page.title}`, "", `Error: ${result.error}`, ""); continue; }
    lines.push(`## ${result.ok ? "✓" : "✗"} ${result.page.title}`, "",
      `- Source: ${result.source === "room" ? "live collaboration state" : "stored JSON"}, file: ${result.file} (${Math.round(result.docxBytes / 1024)} KB)`,
      `- Content: ${Object.entries(result.nodes).filter(([type]) => !["doc", "text"].includes(type)).map(([type, count]) => `${type} ${count}`).join(", ")}`,
      `- Images: ${result.images.resolved}/${result.images.total}; comments exported: ${result.comments.exported} (empty open threads ${result.comments.emptyThreads}, resolved ${result.comments.resolvedThreads})`,
      `- Connections kept: citations ${result.actual.citations.length}/${result.expected.citations.length}, evidence ${result.actual.evidence.length}/${result.expected.evidence.length}, wiki links ${result.actual.slugs.length}/${result.expected.slugs.length}, tasks ${result.actual.tasks.length}/${result.expected.tasks.length}, deadlines ${result.actual.deadlines.length}/${result.expected.deadlines.length}`,
      ...(result.issues.length ? result.issues.map((issue) => `- ${issue.severity === "blocking" ? "**Blocking**" : "Warning"}: ${issue.code} – ${issue.detail}`) : ["- No issues"]),
      "");
  }
  fs.writeFileSync(path.join(out, "report.md"), lines.join("\n"));
  console.log(lines.join("\n"));
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
