/**
 * Recovery for a forgotten password when no administrator can sign in.
 *
 *   npm run user:reset-password -- <username>
 *
 * In the production container the bundled copy runs as
 *   docker exec -it management-platform-app-1 node dist-scripts/reset-password.mjs <username>
 * The new password is read from the terminal without echo, never from argv.
 * All sessions of the user are revoked.
 */
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { hashPassword } from "better-auth/crypto";

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

function askHidden(question: string) {
  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    process.stdout.write(question);
    output._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const username = process.argv[2]?.toLowerCase();
  if (!username) throw new Error("Usage: reset-password <username>");
  if (!process.stdin.isTTY) throw new Error("Run this in an interactive terminal (docker exec -it).");

  const sqlite = new Database(dbPath, { fileMustExist: true });
  sqlite.pragma("busy_timeout = 5000");
  const found = sqlite.prepare(
    "SELECT u.id, a.id AS accountId FROM user u JOIN account a ON a.userId = u.id AND a.providerId = 'credential' WHERE lower(u.username) = ? AND u.removedAt IS NULL",
  ).get(username) as { id: string; accountId: string } | undefined;
  if (!found) throw new Error(`No active password account for "${username}".`);

  const password = await askHidden("New password: ");
  if (password.length < 8 || password.length > 128) throw new Error("Passwords must contain 8–128 characters.");
  if (password !== await askHidden("Repeat password: ")) throw new Error("Passwords do not match.");

  const hashed = await hashPassword(password);
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE account SET password = ?, updatedAt = ? WHERE id = ?").run(hashed, Date.now(), found.accountId);
    sqlite.prepare("DELETE FROM session WHERE userId = ?").run(found.id);
  })();
  console.log(`Password for "${username}" reset; existing sessions signed out.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
