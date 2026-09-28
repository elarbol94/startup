import { test, expect, type Page, type Browser } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

test.use({ actionTimeout: 30_000 });

const password = "collaboration-test-password";
async function users(page: Page, browser: Browser, baseURL: string) {
  let login = await page.request.post("/api/auth/sign-in/username", { data: { username: "admin", password: "super-secret-1" } });
  if (!login.ok()) login = await page.request.post("/api/auth/sign-up/email", { data: { username: "admin", name: "Alice", email: "admin@example.com", password: "super-secret-1" } });
  expect(login.ok(), await login.text()).toBe(true);
  const peers = [page]; const contexts = [];
  for (const name of ["Bob", "Carol"]) {
    const email = `${name}-${randomUUID()}@example.com`;
    const created = await page.request.post("/api/auth/admin/create-user", { headers: { Origin: baseURL }, data: { name, email, password, role: "member" } });
    expect(created.ok(), await created.text()).toBe(true);
    const context = await browser.newContext({ baseURL }); contexts.push(context);
    const peer = await context.newPage();
    const login = await peer.request.post("/api/auth/sign-in/email", { data: { email, password } });
    expect(login.ok()).toBe(true); peers.push(peer);
  }
  return { peers, contexts };
}
function fixture(userId: string) {
  const sqlite = new Database(path.resolve("data/e2e.db"));
  const deckId = randomUUID();
  sqlite.prepare("INSERT INTO wiki_presentations (id, title, elements_json, path_json, created_by, updated_by, created_at, updated_at) VALUES (?, 'Together', ?, '[]', ?, ?, ?, ?)").run(deckId, JSON.stringify([{ id: "shared-text", type: "text", x: 100, y: 100, width: 500, height: 200, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" } }]), userId, userId, Date.now(), Date.now());
  sqlite.close(); return { deckId };
}
test.describe.configure({ timeout: 600_000 });
test("three accounts edit the same presentation text and see collaborators", async ({ page, browser, baseURL }) => {
  const { peers, contexts } = await users(page, browser, baseURL!);
  try {
    const session = await (await page.request.get("/api/auth/get-session")).json();
    const { deckId } = fixture(session.user.id);
    const errors: string[] = []; peers.forEach(peer => {
      peer.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
      peer.on("console", message => { if (message.type() === "error" && /React error|Maximum update depth/.test(message.text())) errors.push(message.text()); });
    });
    const initial = await page.request.get(`/api/wiki/collaboration/presentation/${deckId}`);
    expect(initial.ok(), await initial.text()).toBe(true);
    await Promise.all(peers.map(peer => peer.goto(`/wiki/presentations/${deckId}`)));
    for (const peer of peers) {
      await expect(peer.getByRole("button", { name: "Text", exact: true })).toBeEnabled({ timeout: 120_000 });
      await peer.locator('[data-testid="rf__node-shared-text"]').click();
      await peer.getByRole("button", { name: "Werkzeuge", exact: true }).click();
      await peer.getByRole("menuitem", { name: "Eigenschaften", exact: true }).click();
      await peer.locator("summary").filter({ hasText: /^Inhalte$/ }).click();
    }
    const editors = peers.map(peer => peer.getByRole("textbox", { name: "Formatierter Text" }));
    await Promise.all(editors.map(async (editor, index) => { await editor.click(); await editor.press("Control+End"); await peers[index].keyboard.insertText(` writer${index}`); }));
    for (const editor of editors) for (let index = 0; index < 3; index++) await expect(editor).toContainText(`writer${index}`);
    await editors[0].press("Control+End");
    const started = Date.now();
    await peers[0].keyboard.insertText(" presentation-probe");
    await expect(editors[2]).toContainText("presentation-probe", { timeout: 1000 });
    console.log(`Presentation remote update: ${Date.now() - started}ms`);
    await editors[0].press("Control+z");
    await expect(editors[2]).not.toContainText("presentation-probe");
    await expect(editors[2]).toContainText("writer1"); await expect(editors[2]).toContainText("writer2");
    await editors[0].press("Control+Shift+z"); await expect(editors[2]).toContainText("presentation-probe");
    await editors[0].press("Control+a"); await editors[0].press("Control+i");
    await expect(editors[2].locator("em")).toContainText("Hello");
    await expect(page.getByTestId("collaboration-status")).toContainText("Bob");
    await expect.poll(async () => (await (await page.request.get(`/api/wiki/presentations/${deckId}`)).json()).elements[0].content.text).toContain("writer2");
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test("live sessions stop on permission removal and session expiry", async ({ page, browser, baseURL }) => {
  const { peers, contexts } = await users(page, browser, baseURL!);
  const sqlite = new Database(path.resolve("data/e2e.db"));
  try {
    const sessions = await Promise.all(peers.map(async peer => (await peer.request.get("/api/auth/get-session")).json()));
    const { deckId } = fixture(sessions[0].user.id);
    await peers[1].goto(`/wiki/presentations/${deckId}`);
    await expect(peers[1].getByTestId("collaboration-status")).toContainText("Gespeichert");
    const prior = await (await peers[1].request.get(`/api/wiki/collaboration/presentation/${deckId}`)).json();
    sqlite.prepare("INSERT INTO wiki_presentation_members (id, presentation_id, user_id, role) VALUES (?, ?, ?, 'view')").run(randomUUID(), deckId, sessions[1].user.id);
    await expect(peers[1].getByTestId("collaboration-status")).toContainText(/zugriff/i);
    expect((await peers[1].request.post(`/api/wiki/collaboration/presentation/${deckId}`, { data: { client: randomUUID(), update: prior.update } })).status()).toBe(403);
    await peers[1].reload();
    await expect(peers[1].getByRole("button", { name: "Text", exact: true })).toBeDisabled();
    await peers[2].goto(`/wiki/presentations/${deckId}`);
    await expect(peers[2].getByTestId("collaboration-status")).toContainText("Gespeichert");
    sqlite.prepare('UPDATE session SET expiresAt = 1 WHERE id = ?').run(sessions[2].session.id);
    expect((await peers[2].request.post(`/api/wiki/collaboration/presentation/${deckId}`, { data: { client: randomUUID(), update: prior.update } })).status()).toBeGreaterThanOrEqual(401);
  } finally { sqlite.close(); await Promise.all(contexts.map(context => context.close())); }
});
