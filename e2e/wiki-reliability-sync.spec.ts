import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Two tabs, renames and connection drops: the QA session that lost edits (C1),
// showed contradicting save labels (H2) and broke undo (H3).
test.describe.configure({ timeout: 240_000 });
test.use({ actionTimeout: 30_000 });

async function login(page: Page) {
  let response = await page.request.post("/api/auth/sign-in/username", { data: { username: "admin", password: "super-secret-1" } });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { username: "admin", name: "Admin", email: "admin@example.com", password: "super-secret-1" } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await (await page.request.get("/api/auth/get-session")).json()).user.id as string;
}

function seedPage(userId: string, title: string) {
  const sqlite = new Database(path.resolve("data/e2e.db"));
  const id = randomUUID();
  try {
    sqlite.prepare("INSERT INTO wiki_pages (id, title, slug, content_json, content_text, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'Seed', ?, ?, ?, ?)")
      .run(id, title, id, JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Seed" }] }] }), userId, userId, Date.now(), Date.now());
  } finally { sqlite.close(); }
  return id;
}

function storedContent(id: string) {
  const sqlite = new Database(path.resolve("data/e2e.db"));
  try { return (sqlite.prepare("SELECT content_json FROM wiki_pages WHERE id = ?").get(id) as { content_json: string }).content_json; }
  finally { sqlite.close(); }
}

/** Collects React update loops and other uncaught errors of a tab. */
function watchErrors(page: Page, errors: string[]) {
  page.on("pageerror", (error) => { errors.push(error.message); console.log("pageerror:", error.message.slice(0, 500)); });
  page.on("console", (message) => { if (message.type() === "error" && /React error|Maximum update depth/.test(message.text())) errors.push(message.text()); });
}

async function openEditor(page: Page, id: string) {
  await page.goto(`/wiki/pages/${id}`);
  const editor = page.locator(".ProseMirror").filter({ visible: true }).first();
  await expect(editor).toHaveAttribute("contenteditable", "true", { timeout: 120_000 });
  return editor;
}

const status = (page: Page) => page.getByTestId("document-save-status").filter({ visible: true });
const saved = (page: Page) => expect(status(page)).toHaveText("Gespeichert", { timeout: 30_000 });
// TipTap moves the DOM caret in an animation frame; typing before it lands is lost.
const toEnd = (editor: Locator) => editor.evaluate((element) => new Promise<void>((resolve) => {
  (element as HTMLElement & { editor?: { commands: { focus(position: string): void } } }).editor?.commands.focus("end");
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
}));
const text = (editor: Locator) => editor.evaluate((element) => (element as HTMLElement & { editor?: { getText(): string } }).editor?.getText() ?? "");

async function rename(page: Page, title: string) {
  page.once("dialog", (dialog) => void dialog.accept(title));
  await page.getByRole("button", { name: /^Umbenennen:/ }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: `Umbenennen: ${title}` }).filter({ visible: true })).toBeVisible();
}

test("edits made in two tabs around a rename reach both tabs and survive reloads", async ({ page, context }) => {
  const errors: string[] = [];
  const userId = await login(page);
  const id = seedPage(userId, `Sync ${randomUUID().slice(0, 8)}`);
  const second = await context.newPage();
  watchErrors(page, errors); watchErrors(second, errors);
  const editorA = await openEditor(page, id);
  const editorB = await openEditor(second, id);

  await toEnd(editorA);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Heading from A");
  await page.getByRole("button", { name: "Textstil", exact: true }).filter({ visible: true }).click();
  await page.getByRole("menuitem", { name: /Überschrift 2/ }).click();
  await expect(editorA.locator("h2")).toContainText("Heading from A");
  await toEnd(editorA);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+b"); await page.keyboard.insertText("bold");
  await page.keyboard.press("Control+b"); await page.keyboard.press("Control+i"); await page.keyboard.insertText(" italic");
  await page.keyboard.press("Control+i"); await page.keyboard.press("Control+u"); await page.keyboard.insertText(" underline");
  await page.keyboard.press("Control+u");
  await expect(editorB).toContainText("bold italic underline");
  await saved(page);

  await rename(page, `Renamed ${randomUUID().slice(0, 8)}`);
  await expect(page).not.toHaveURL(new RegExp(id));
  await saved(page);

  await toEnd(editorA);
  await page.keyboard.insertText(" after-rename-A");
  await expect(editorB).toContainText("after-rename-A");
  await toEnd(editorB);
  await second.keyboard.insertText(" typed-in-B");
  await expect(editorA).toContainText("typed-in-B");
  await saved(page); await saved(second);

  await page.reload();
  const reloadedA = page.locator(".ProseMirror").filter({ visible: true }).first();
  await expect(reloadedA).toHaveAttribute("contenteditable", "true", { timeout: 120_000 });
  for (const expected of ["Heading from A", "bold italic underline", "after-rename-A", "typed-in-B"]) {
    await expect(reloadedA).toContainText(expected);
    await expect(editorB).toContainText(expected);
  }
  await expect(reloadedA.locator("strong")).toContainText("bold");
  await expect(reloadedA.locator("em")).toContainText("italic");
  await expect(reloadedA.locator("u")).toContainText("underline");
  await expect.poll(() => storedContent(id)).toContain("typed-in-B");
  expect(storedContent(id)).toContain("after-rename-A");
  expect(errors).toEqual([]);
});

test("undo still works after a rename", async ({ page }) => {
  const errors: string[] = [];
  watchErrors(page, errors);
  const userId = await login(page);
  const id = seedPage(userId, `Undo ${randomUUID().slice(0, 8)}`);
  const editor = await openEditor(page, id);
  await toEnd(editor);
  await page.keyboard.insertText(" before-rename");
  await saved(page);
  await rename(page, `Undo renamed ${randomUUID().slice(0, 8)}`);
  await toEnd(editor);
  await page.keyboard.insertText(" after-rename");
  await expect(editor).toContainText("after-rename");
  await page.waitForTimeout(700); // separate undo steps (UndoManager capture timeout)
  await editor.press("Control+z");
  await expect.poll(() => text(editor)).not.toContain("after-rename");
  await expect(editor).toContainText("before-rename");
  await editor.press("Control+Shift+z");
  await expect(editor).toContainText("after-rename");
  await page.getByRole("button", { name: /^Rückgängig/ }).filter({ visible: true }).click();
  await expect.poll(() => text(editor)).not.toContain("after-rename");
  await saved(page);
  expect(errors).toEqual([]);
});

test("the single save status reports a lost collaboration connection and recovers", async ({ page, context }) => {
  const errors: string[] = [];
  watchErrors(page, errors);
  const userId = await login(page);
  const id = seedPage(userId, `Offline ${randomUUID().slice(0, 8)}`);
  const editor = await openEditor(page, id);
  await toEnd(editor);
  await page.keyboard.insertText(" online");
  await saved(page);
  // Exactly one visible save label.
  await expect(page.getByText("Gespeichert", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect(status(page)).toHaveAttribute("title", /Zuletzt gespeichert/);

  await context.setOffline(true);
  await page.keyboard.insertText(" offline-edit");
  await expect(status(page)).toContainText("Offline");
  await expect(status(page)).not.toHaveText("Gespeichert");
  await context.setOffline(false);
  await saved(page);
  await expect.poll(() => storedContent(id)).toContain("offline-edit");

  // Undo keeps working after the reconnect.
  await page.waitForTimeout(700);
  await page.keyboard.insertText(" post-reconnect");
  await page.waitForTimeout(700);
  await editor.press("Control+z");
  await expect.poll(() => text(editor)).not.toContain("post-reconnect");
  await expect(editor).toContainText("offline-edit");
  expect(errors).toEqual([]);
});
