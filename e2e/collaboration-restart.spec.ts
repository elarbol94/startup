import { test, expect, type Locator } from "@playwright/test";
import type { Editor } from "@tiptap/core";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

// Read document content without the collaborator cursor labels rendered in the DOM.
async function expectRecoveredText(editor: Locator) {
  await expect.poll(() => editor.evaluate(element =>
    (element as HTMLElement & { editor?: Editor }).editor?.getText(),
  )).toBe("Accepted before crash plus downtime edit");
}

// This test owns a separate application process and database so it can crash the
// server without affecting the suite's web server or another worktree.
test("durable updates replay after a server crash and recover edits made during downtime", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const baseURL = `http://localhost:${port}`;
  const database = info.outputPath("restart.db");
  let server: ChildProcess | undefined;
  let log = "";
  const start = async () => {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_PATH: database, UPLOADS_PATH: info.outputPath("uploads"), BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-32-bytes-minimum", E2E_TEST: "true", LOCAL_AUTH_BYPASS: "false" }, stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", chunk => { log += chunk.toString(); }); server.stderr?.on("data", chunk => { log += chunk.toString(); });
    await expect.poll(async () => { try { return (await fetch(`${baseURL}/login`)).status; } catch { return 0; } }, { timeout: 45_000 }).toBe(200);
  };
  const crash = async () => { if (server && server.exitCode === null && server.signalCode === null) { const exited = once(server, "exit"); server.kill("SIGKILL"); await exited; } };
  const context = await browser.newContext({ baseURL });
  try {
    await start();
    const page = await context.newPage();
    const login = await page.request.post("/api/auth/sign-up/email", { data: { name: "Restart tester", username: "restart", email: "restart@example.com", password: "restart-test-password" } });
    expect(login.ok(), await login.text()).toBe(true);
    const session = await (await page.request.get("/api/auth/get-session")).json();
    const id = randomUUID(); const sqlite = new Database(path.resolve(database));
    sqlite.prepare("INSERT INTO wiki_pages (id, title, slug, content_json, created_by, updated_by, created_at, updated_at) VALUES (?, 'Restart', ?, ?, ?, ?, ?, ?)").run(id, id, JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Seed" }] }] }), session.user.id, session.user.id, Date.now(), Date.now()); sqlite.close();
    await page.goto(`/wiki/pages/${id}`);
    const editor = page.locator(".ProseMirror").first(); await expect(editor).toHaveAttribute("contenteditable", "true");
    await editor.fill("Accepted before crash");
    await expect(page.getByTestId("collaboration-status")).toContainText("Gespeichert");
    await crash();
    await editor.press("Control+End"); await page.keyboard.insertText(" plus downtime edit");
    await expect(page.getByTestId("collaboration-status")).not.toContainText("Gespeichert");
    await start();
    await expect(page.getByTestId("collaboration-status")).toContainText("Gespeichert", { timeout: 30_000 });
    const joined = await context.newPage(); await joined.goto(`/wiki/pages/${id}`);
    await expectRecoveredText(joined.locator(".ProseMirror").first());
    await page.reload(); await expectRecoveredText(editor);
  } finally {
    await context.close(); await crash();
    if (info.status !== info.expectedStatus) await info.attach("server-log", { body: log, contentType: "text/plain" });
  }
});
