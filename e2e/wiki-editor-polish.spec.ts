import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Editor, JSONContent } from "@tiptap/core";
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loginAsAnyUser } from "./helpers/login";

// Always the disposable database started by the Playwright configuration.
function database() { return new Database(path.resolve("data/e2e.db")); }
type EditorElement = HTMLElement & { editor: Editor };

const login = loginAsAnyUser;

async function note(page: Page, content: JSONContent = { type: "doc", content: [{ type: "paragraph" }] }) {
  await login(page);
  const id = randomUUID();
  const db = database();
  try {
    const user = db.prepare('SELECT id FROM "user" LIMIT 1').get() as { id: string };
    db.prepare("INSERT INTO wiki_pages (id, title, slug, content_json, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, "Editor polish test", id, JSON.stringify(content), user.id, user.id, Date.now(), Date.now());
  } finally { db.close(); }
  await page.goto(`/wiki/pages/${id}`);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toHaveAttribute("contenteditable", "true", { timeout: 180_000 });
  return editor;
}

function paragraph(text: string): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

/** Double-clicks the given word inside the editor, the way a person selects it. */
async function doubleClickWord(page: Page, editor: Locator, word: string) {
  const box = await editor.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(target) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index); range.setEnd(node, index + target.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  }, word);
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x, box!.y);
  await expect.poll(() => editor.evaluate((element) => {
    const { state } = (element as EditorElement).editor;
    return state.doc.textBetween(state.selection.from, state.selection.to);
  })).toBe(word);
}

/** Text of every run carrying a link mark, with its href. */
function linkedRuns(editor: Locator) {
  return editor.evaluate((element) => {
    const runs: Array<{ text: string; href: string }> = [];
    (element as EditorElement).editor.state.doc.descendants((node) => {
      const link = node.marks.find((mark) => mark.type.name === "link");
      if (node.isText && link) runs.push({ text: node.text ?? "", href: String(link.attrs.href) });
    });
    return runs;
  });
}

async function paste(editor: Locator, data: Record<string, string>) {
  await editor.evaluate((element, entries) => {
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(entries)) transfer.setData(type, value);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, data);
}

test.describe.configure({ timeout: 600_000 });

test("a link entered after double-clicking a word covers exactly that word on every entry path", async ({ page }) => {
  const editor = await note(page, paragraph("Alpha wonderful omega"));
  const toolbar = page.getByTestId("document-toolbar");
  const url = page.getByRole("textbox", { name: "Webadresse", exact: true });

  // Toolbar button.
  await doubleClickWord(page, editor, "wonderful");
  await toolbar.getByRole("button", { name: "Link bearbeiten", exact: true }).click();
  await expect(url).toBeFocused();
  // The pending range stays visible while focus is in the URL field.
  await expect(editor.locator(".wiki-pending-link")).toHaveText("wonderful");
  await url.fill("example.org");
  await url.press("Enter");
  await expect.poll(() => linkedRuns(editor)).toEqual([{ text: "wonderful", href: "https://example.org" }]);
  await expect(editor.locator(".wiki-pending-link")).toHaveCount(0);

  // Selection bubble menu.
  await doubleClickWord(page, editor, "omega");
  await page.locator('button[aria-label="Link bearbeiten"]:not([data-testid="document-toolbar"] button)').click();
  await expect(url).toBeFocused();
  await url.fill("example.net");
  await url.press("Enter");
  await expect.poll(() => linkedRuns(editor)).toEqual([{ text: "wonderful", href: "https://example.org" }, { text: "omega", href: "https://example.net" }]);

  // Ctrl+K.
  await doubleClickWord(page, editor, "Alpha");
  await page.keyboard.press("Control+k");
  await expect(url).toBeFocused();
  await expect(editor.locator(".wiki-pending-link")).toHaveText("Alpha");
  await url.fill("example.com");
  await url.press("Enter");
  await expect.poll(() => linkedRuns(editor)).toEqual([
    { text: "Alpha", href: "https://example.com" },
    { text: "wonderful", href: "https://example.org" },
    { text: "omega", href: "https://example.net" },
  ]);
});

test("the command palette link command keeps the selected word", async ({ page }) => {
  const editor = await note(page, paragraph("Beta palette gamma"));
  await doubleClickWord(page, editor, "palette");
  await page.getByTestId("document-toolbar").getByRole("button", { name: "Befehl suchen", exact: true }).click();
  const search = page.getByRole("combobox", { name: "Befehl suchen", exact: true });
  await search.fill("Externen Link einfügen");
  await search.press("Enter");
  const url = page.getByRole("textbox", { name: "Webadresse", exact: true });
  await expect(url).toBeFocused();
  await url.fill("example.org");
  await url.press("Enter");
  await expect.poll(() => linkedRuns(editor)).toEqual([{ text: "palette", href: "https://example.org" }]);
});

test("pasting HTML with a data: URI image uploads it as a figure", async ({ page }) => {
  const editor = await note(page);
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  await editor.click();
  await paste(editor, { "text/html": `<p>Before image</p><img src="data:image/png;base64,${png}" alt="dot"><p>After image</p>`, "text/plain": "Before image After image" });
  await expect(editor).toContainText("Before image");
  await expect(editor.locator("figure[data-figure-view]")).toHaveCount(1, { timeout: 60_000 });
  const src = await editor.evaluate((element) => {
    let value = "";
    (element as EditorElement).editor.state.doc.descendants((node) => { if (node.type.name === "commentableImage") value = String(node.attrs.src); });
    return value;
  });
  expect(src).toMatch(/^\/api\//);
  await expect(page.getByText(/Bild.*nicht übernommen/)).toHaveCount(0);
});

test("the word count follows a large paste without a reload", async ({ page }) => {
  const editor = await note(page, paragraph("One two three"));
  const status = page.getByTestId("editor-writing-status");
  await expect(status).toContainText("3 Wörter");
  await editor.click();
  await page.keyboard.press("End");
  const text = Array.from({ length: 8800 }, (_, index) => `wort${index}`).join(" ");
  await paste(editor, { "text/plain": ` ${text}` });
  await expect(status).toContainText("8.803 Wörter");
});

test("undo and redo are only enabled when there is something to undo or redo", async ({ page }) => {
  const editor = await note(page, paragraph("Start"));
  const toolbar = page.getByTestId("document-toolbar");
  const undo = toolbar.getByRole("button", { name: "Rückgängig", exact: true });
  const redo = toolbar.getByRole("button", { name: "Wiederholen", exact: true });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" typed");
  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();
  await undo.click();
  await expect(redo).toBeEnabled();
  await expect(editor).not.toContainText("typed");
  await redo.click();
  await expect(editor).toContainText("typed");
  await expect(redo).toBeDisabled();
});
