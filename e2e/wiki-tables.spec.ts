import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Editor, JSONContent } from "@tiptap/core";
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loginAsAnyUser } from "./helpers/login";

// Tables in the wiki editor: block insertions must never split a table, and Tab/Shift+Tab
// move between cells instead of leaving the editor.
test.describe.configure({ timeout: 300_000 });
test.use({ actionTimeout: 45_000, screenshot: "only-on-failure", trace: "retain-on-failure" });

const artwork = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect x="20" y="40" width="160" height="120" fill="#315EFB"/></svg>');

const login = loginAsAnyUser;

const text = (value: string) => value ? [{ type: "paragraph", content: [{ type: "text", text: value }] }] : [{ type: "paragraph" }];
function table(rows: string[][]): JSONContent {
  return {
    type: "markdownTable",
    attrs: { tableId: "qa-table", caption: "", includeInTableIndex: true },
    content: rows.map((row, index) => ({
      type: "markdownTableRow",
      content: row.map((cell) => ({ type: index === 0 ? "markdownTableHeader" : "markdownTableCell", attrs: { alignment: "left" }, content: text(cell) })),
    })),
  };
}

async function openDocument(page: Page, content: JSONContent[]) {
  await login(page);
  const id = randomUUID();
  const db = new Database(path.resolve("data/e2e.db"));
  try {
    const user = db.prepare('SELECT id FROM "user" LIMIT 1').get() as { id: string };
    db.prepare("INSERT INTO wiki_pages (id, title, slug, content_json, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, "Table editor test", id, JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), user.id, user.id, Date.now(), Date.now());
  } finally { db.close(); }
  await page.goto(`/wiki/pages/${id}`);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toHaveAttribute("contenteditable", "true", { timeout: 180_000 });
  await editor.evaluate((element, doc) => {
    (element as HTMLElement & { editor: Editor }).editor.commands.setContent(doc);
  }, { type: "doc", content });
  return editor;
}

async function documentJson(editor: Locator) {
  return editor.evaluate((element) => (element as HTMLElement & { editor: Editor }).editor.getJSON());
}
function cellTexts(node: JSONContent) {
  return (node.content ?? []).map((row) => (row.content ?? []).map((cell) => (cell.content ?? []).map((block) => (block.content ?? []).map((item) => item.text ?? "").join("")).join("\n")));
}
async function topLevelTypes(editor: Locator) {
  return ((await documentJson(editor)).content ?? []).map((node) => node.type);
}
async function onlyTable(editor: Locator) {
  const tables = ((await documentJson(editor)).content ?? []).filter((node) => node.type === "markdownTable");
  expect(tables).toHaveLength(1);
  return cellTexts(tables[0]);
}
/** Focuses the editor with the caret at the end of the text `value` (a cell's content). */
async function clickCellEnd(editor: Locator, value: string) {
  await expect(editor.locator("td, th").filter({ hasText: new RegExp(`^${value}$`) })).toBeVisible();
  await editor.evaluate((element, value) => {
    const instance = (element as HTMLElement & { editor: Editor }).editor;
    let at = -1;
    instance.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text === value) at = pos + value.length; });
    instance.chain().focus().setTextSelection(at).run();
  }, value);
  await expect(editor).toBeFocused();
}

test("inserting figures and diagrams from a table cell keeps the table whole", async ({ page }) => {
  const editor = await openDocument(page, [...text("Before the table"), table([["q1", "q2"], ["q3", "q4"]]), ...text("After the table")]);

  // Upload through the insert-figure dialog (Ctrl+Alt+I) while the caret is in a cell.
  await clickCellEnd(editor, "q1");
  await page.keyboard.press("Control+Alt+i");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByTestId("figure-picker-upload").setInputFiles({ name: "table-figure.svg", mimeType: "image/svg+xml", buffer: artwork });
  await expect(editor.locator("figure[data-figure-view]")).toHaveCount(1);
  expect(await onlyTable(editor)).toEqual([["q1", "q2"], ["q3", "q4"]]);
  expect(await topLevelTypes(editor)).toEqual(["paragraph", "markdownTable", "commentableImage", "paragraph"]);

  // Insert the now existing library figure from another cell.
  await clickCellEnd(editor, "q4");
  await page.keyboard.press("Control+Alt+i");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("button:has(img)").first().click();
  await expect(editor.locator("figure[data-figure-view]")).toHaveCount(2);
  expect(await onlyTable(editor)).toEqual([["q1", "q2"], ["q3", "q4"]]);

  // A Mermaid diagram from the same dialog also lands after the table.
  await clickCellEnd(editor, "q3");
  await page.keyboard.press("Control+Alt+i");
  await page.getByRole("dialog").getByRole("button", { name: "Mermaid-Diagramm", exact: true }).click();
  await expect.poll(async () => (await topLevelTypes(editor)).filter((type) => type === "mermaidDiagram").length).toBe(1);
  expect(await onlyTable(editor)).toEqual([["q1", "q2"], ["q3", "q4"]]);
  const types = await topLevelTypes(editor);
  expect(types.indexOf("mermaidDiagram")).toBeGreaterThan(types.indexOf("markdownTable"));
});

test("Tab and Shift+Tab move between cells and Tab in the last cell adds a row", async ({ page }) => {
  const editor = await openDocument(page, [table([["Name", "Value"], ["", ""]]), ...text("Paragraph")]);
  await clickCellEnd(editor, "Value");

  await page.keyboard.press("Tab");
  await expect(editor).toBeFocused();
  await page.keyboard.type("alpha");
  await page.keyboard.press("Tab");
  await page.keyboard.type("beta");
  expect(await onlyTable(editor)).toEqual([["Name", "Value"], ["alpha", "beta"]]);

  // Shift+Tab selects the previous cell's text; End collapses the caret behind it.
  await page.keyboard.press("Shift+Tab");
  await expect(editor).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  expect(await onlyTable(editor)).toEqual([["Name", "Value"], ["alpha!", "beta"]]);

  // Tab in the last cell appends a row and continues typing there.
  await clickCellEnd(editor, "beta");
  await page.keyboard.press("Tab");
  await page.keyboard.type("gamma");
  await expect(editor).toBeFocused();
  expect(await onlyTable(editor)).toEqual([["Name", "Value"], ["alpha!", "beta"], ["gamma", ""]]);

  // Shift+Tab in the first cell keeps focus and changes nothing.
  await clickCellEnd(editor, "Name");
  await page.keyboard.press("Shift+Tab");
  await expect(editor).toBeFocused();
  expect(await onlyTable(editor)).toEqual([["Name", "Value"], ["alpha!", "beta"], ["gamma", ""]]);
});

test("Tab in a paragraph stays in the editor and Escape then Tab leaves it", async ({ page }) => {
  const editor = await openDocument(page, [...text("Indented")]);
  await editor.getByText("Indented", { exact: true }).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await page.keyboard.type("x");
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((element) => (element as HTMLElement & { editor: Editor }).editor.state.doc.firstChild?.textContent)).toBe("\txIndented");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(editor).not.toBeFocused();
});
