import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Editor, JSONContent } from "@tiptap/core";
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Markdown shortcuts while typing and the "/" block menu of the wiki editor.

function database() { return new Database(path.resolve("data/e2e.db")); }

async function login(page: Page) {
  let response = await page.request.post("/api/auth/sign-in/username", { data: { username: "markdown-editor", password: "super-secret-1" } });
  // Sign-up is only open for the first account, so reuse the ones other specs create.
  for (const username of ["admin", "document-editor"]) {
    if (!response.ok()) response = await page.request.post("/api/auth/sign-in/username", { data: { username, password: "super-secret-1" } });
  }
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { username: "markdown-editor", displayUsername: "markdown-editor", name: "Markdown Editor", email: "markdown-editor@example.com", password: "super-secret-1" } });
  expect(response.ok()).toBe(true);
}

async function openEmptyPage(page: Page) {
  await login(page);
  const id = randomUUID();
  const db = database();
  try {
    const user = db.prepare('SELECT id FROM "user" LIMIT 1').get() as { id: string };
    db.prepare("INSERT INTO wiki_pages (id, title, slug, content_json, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, "Markdown typing test", id, JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), user.id, user.id, Date.now(), Date.now());
  } finally { db.close(); }
  await page.goto(`/wiki/pages/${id}`);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toHaveAttribute("contenteditable", "true", { timeout: 180_000 });
  return editor;
}

/** Replaces the document with `content` and puts the caret at the end of its first block. */
async function reset(editor: Locator, content: JSONContent = { type: "doc", content: [{ type: "paragraph" }] }) {
  await editor.evaluate((element, doc) => {
    const instance = (element as HTMLElement & { editor: Editor }).editor;
    instance.commands.setContent(doc);
    // Not focus("end"): the trailing-node plugin may append an empty paragraph after the block.
    instance.commands.focus(instance.state.doc.firstChild!.nodeSize - 1);
  }, content);
  await expect(editor).toBeFocused();
}

async function firstBlock(editor: Locator): Promise<JSONContent | undefined> {
  return editor.evaluate((element) => (element as HTMLElement & { editor: Editor }).editor.getJSON().content?.[0]);
}

async function typeKeys(page: Page, text: string) {
  // One key at a time, like a person typing, so every input rule sees each character.
  for (const key of text) await page.keyboard.type(key);
}

test.describe.configure({ timeout: 300_000 });

test("block Markdown shortcuts convert while typing", async ({ page }) => {
  const editor = await openEmptyPage(page);

  const blockCases: Array<{ input: string; expected: (node: JSONContent | undefined) => void }> = [
    { input: "# ", expected: (node) => expect(node).toMatchObject({ type: "heading", attrs: { level: 1 } }) },
    { input: "## ", expected: (node) => expect(node).toMatchObject({ type: "heading", attrs: { level: 2 } }) },
    { input: "### ", expected: (node) => expect(node).toMatchObject({ type: "heading", attrs: { level: 3 } }) },
    { input: "- ", expected: (node) => expect(node).toMatchObject({ type: "bulletList", content: [{ type: "listItem" }] }) },
    { input: "* ", expected: (node) => expect(node).toMatchObject({ type: "bulletList", content: [{ type: "listItem" }] }) },
    { input: "1. ", expected: (node) => expect(node).toMatchObject({ type: "orderedList", content: [{ type: "listItem" }] }) },
    { input: "> ", expected: (node) => expect(node).toMatchObject({ type: "blockquote" }) },
    { input: "[ ] ", expected: (node) => expect(node).toMatchObject({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: false } }] }) },
    { input: "[x] ", expected: (node) => expect(node).toMatchObject({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true } }] }) },
    { input: "``` ", expected: (node) => expect(node).toMatchObject({ type: "codeBlock" }) },
    { input: "---", expected: (node) => expect(node).toMatchObject({ type: "horizontalRule" }) },
  ];
  for (const { input, expected } of blockCases) {
    await reset(editor);
    await typeKeys(page, input);
    expected(await firstBlock(editor));
  }

  // Text typed into the converted block stays inside it.
  await reset(editor);
  await typeKeys(page, "## Title");
  expect(await firstBlock(editor)).toMatchObject({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] });

  // ``` followed by Enter also opens a code block.
  await reset(editor);
  await typeKeys(page, "```");
  await page.keyboard.press("Enter");
  expect(await firstBlock(editor)).toMatchObject({ type: "codeBlock" });
});

test("inline Markdown marks convert on their closing delimiter", async ({ page }) => {
  const editor = await openEmptyPage(page);
  const markCases: Array<{ input: string; mark: string; text: string }> = [
    { input: "**bold**", mark: "bold", text: "bold" },
    { input: "*italic*", mark: "italic", text: "italic" },
    { input: "_italic_", mark: "italic", text: "italic" },
    { input: "~~strike~~", mark: "strike", text: "strike" },
    { input: "`code`", mark: "code", text: "code" },
    { input: "==highlight==", mark: "highlight", text: "highlight" },
  ];
  for (const { input, mark, text } of markCases) {
    await reset(editor);
    await typeKeys(page, `say ${input}`);
    const paragraph = await firstBlock(editor);
    expect(paragraph?.type).toBe("paragraph");
    expect(paragraph?.content?.find((node) => node.text === text)?.marks?.map((item) => item.type)).toContain(mark);
    expect(JSON.stringify(paragraph)).not.toContain(input);
  }

  // Links still convert at the following space.
  await reset(editor);
  await typeKeys(page, "[Docs](https://example.com) ");
  expect((await firstBlock(editor))?.content?.[0]).toMatchObject({ text: "Docs", marks: [{ type: "link", attrs: { href: "https://example.com" } }] });
});

test("undo restores the literal Markdown and code blocks never convert", async ({ page }) => {
  const editor = await openEmptyPage(page);
  // Ctrl+Z right after a conversion restores the literal Markdown ...
  await reset(editor);
  await typeKeys(page, "# ");
  expect(await firstBlock(editor)).toMatchObject({ type: "heading" });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await firstBlock(editor)).toMatchObject({ type: "paragraph", content: [{ type: "text", text: "# " }] });
  // ... and typing continues as plain text.
  await typeKeys(page, "literal");
  expect(await firstBlock(editor)).toMatchObject({ type: "paragraph", content: [{ type: "text", text: "# literal" }] });

  // Backspace does the same for inline marks.
  await reset(editor);
  await typeKeys(page, "**bold**");
  await page.keyboard.press("Backspace");
  expect(await firstBlock(editor)).toMatchObject({ type: "paragraph", content: [{ type: "text", text: "**bold**" }] });

  // Nothing converts inside a code block.
  await reset(editor, { type: "doc", content: [{ type: "codeBlock" }] });
  await typeKeys(page, "# **not bold** - ");
  expect(await firstBlock(editor)).toMatchObject({ type: "codeBlock", content: [{ type: "text", text: "# **not bold** - " }] });
});

test("the slash menu filters block commands and inserts them", async ({ page }) => {
  const editor = await openEmptyPage(page);
  const menu = page.getByTestId("slash-command-menu");

  await reset(editor);
  await typeKeys(page, "/");
  await expect(menu).toBeVisible();
  const allCount = await menu.getByRole("option").count();
  expect(allCount).toBeGreaterThan(10);
  await expect(menu.getByRole("option", { name: /Überschrift 1/ })).toContainText("#");

  await typeKeys(page, "tabel");
  await expect(menu.getByRole("option", { name: /^Tabelle/ })).toBeVisible();
  expect(await menu.getByRole("option").count()).toBeLessThan(allCount);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(editor.locator("table[data-markdown-table]")).toHaveCount(1);
  await expect(editor).not.toContainText("/tabel");
  // The caret lands in the first cell.
  await typeKeys(page, "Cell");
  await expect(editor.locator("table[data-markdown-table] th").first()).toHaveText("Cell");

  // Escape closes the menu and keeps the typed text.
  await reset(editor);
  await typeKeys(page, "/head");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  expect(await firstBlock(editor)).toMatchObject({ type: "paragraph", content: [{ type: "text", text: "/head" }] });

  // Arrow keys and Enter pick a command; the "/query" text is removed.
  await reset(editor);
  await typeKeys(page, "Intro /uberschrift");
  await expect(menu.getByRole("option").first()).toContainText("Überschrift 1");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  expect(await firstBlock(editor)).toMatchObject({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro " }] });

  // "/" inside a word or a path does not open the menu.
  await reset(editor);
  await typeKeys(page, "and/or");
  await expect(menu).toBeHidden();

  // The command search shows the Markdown shortcut next to the command.
  // (Opened from the toolbar: double Shift is timing-sensitive on a busy test machine.)
  await page.getByRole("button", { name: "Befehl suchen", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Befehl suchen" });
  await search.getByRole("combobox").fill("Überschrift 1");
  await expect(search.getByRole("option").first().locator("kbd").first()).toHaveText("#");
});
