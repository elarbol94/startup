/**
 * Bug report access for the `triage-bugs` Claude Code skill.
 *
 *   npm run bugs -- export [--include-tagged]          open reports as JSON on stdout
 *   npm run bugs -- mark 12 13 --branch <name> [--note <text>]   tag reports as agent-worked
 *
 * In the production container the bundled copy runs as
 *   docker exec management-platform-app-1 node dist-scripts/bug-reports.mjs export
 * `mark` only tags reports; it never moves a task to another board column.
 */
import path from "node:path";
import Database from "better-sqlite3";
import { exportBugReports, markBugReports } from "../src/modules/projects/bugs/agent-triage";

const [command, ...args] = process.argv.slice(2);
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
const uploadsPath = process.env.UPLOADS_PATH ?? path.join(process.cwd(), "data", "uploads");

function option(name: string) {
  const index = args.indexOf(name);
  return index > -1 ? args[index + 1] : undefined;
}

function main() {
  if (command === "export") {
    const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
    sqlite.pragma("busy_timeout = 5000");
    const reports = exportBugReports(sqlite, { uploadsPath, includeTagged: args.includes("--include-tagged") });
    process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
    return;
  }
  if (command === "mark") {
    const values = new Set([option("--branch"), option("--note")]);
    const numbers = args.filter(arg => !arg.startsWith("--") && !values.has(arg)).map(Number);
    const sqlite = new Database(dbPath, { fileMustExist: true });
    sqlite.pragma("busy_timeout = 5000");
    const count = markBugReports(sqlite, numbers, { branch: option("--branch") ?? "", note: option("--note") });
    console.log(`Tagged ${count} report(s).`);
    return;
  }
  throw new Error("Usage: bug-reports export [--include-tagged] | mark <number...> --branch <name> [--note <text>]");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
