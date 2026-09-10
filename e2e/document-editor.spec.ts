import { expect, test, type Page, type Locator } from "@playwright/test";
import type { Editor, JSONContent } from "@tiptap/core";
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Always the disposable database started by the Playwright configuration.
function database() { return new Database(path.resolve("data/e2e.db")); }
let currentPageId = "";
function savedTasks(title: string) {
  const db = database();
  try {
    const query = "SELECT id, project_id, start_date, due_date FROM tasks WHERE title = ?";
    return title === "Existing scheduled task"
      ? db.prepare(query).all(title)
      : db.prepare(query + " AND id IN (SELECT task_id FROM task_contexts WHERE entity_id = ?)").all(title, currentPageId);
  }
  finally { db.close(); }
}
async function login(page: Page) {
  let response = await page.request.post("/api/auth/sign-in/username", { data: { username: "document-editor", password: "super-secret-1" } });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-in/username", { data: { username: "admin", password: "super-secret-1" } });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { username: "document-editor", displayUsername: "document-editor", name: "Document Editor", email: "document-editor@example.com", password: "super-secret-1" } });
  expect(response.ok()).toBe(true);
}
async function note(page: Page) {
  await login(page);
  const id = randomUUID();
  currentPageId = id;
  const db = database();
  try {
    const user = db.prepare('SELECT id FROM "user" LIMIT 1').get() as { id: string };
    db.prepare("INSERT INTO wiki_pages (id, title, slug, content_json, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, "Document editor test", id, JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), user.id, user.id, Date.now(), Date.now());
  } finally { db.close(); }
  await page.goto(`/wiki/pages/${id}`);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toHaveAttribute("contenteditable", "true", { timeout: 180_000 });
  return editor;
}
async function setDocument(editor: Locator, content: JSONContent) {
  await editor.evaluate((element, doc) => {
    const instance = (element as HTMLElement & { editor: Editor }).editor;
    instance.commands.setContent(doc);
    instance.commands.setTextSelection({ from: 1, to: instance.state.doc.content.size - 1 });
  }, content);
}
async function snapshot(editor: Locator) {
  return editor.evaluate((element) => (element as HTMLElement & { editor: Editor }).editor.getJSON());
}
async function createTask(page: Page, editor: Locator) {
  await editor.press("Control+Shift+a");
  await expect(page.locator("#context-task-title")).toBeVisible();
}
async function chooseProject(page: Page, name: string) {
  await page.locator("#context-task-project").click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByTestId("document-task-planner")).toBeVisible();
  await expect(page.getByTestId("portfolio-gantt")).toBeVisible();
  await expect(page.getByText("Projektzeitplan wird geladen …")).toHaveCount(0);
}
function seedProjects() {
  const db = database();
  try {
    const user = db.prepare('SELECT id FROM "user" LIMIT 1').get() as { id: string };
    for (const id of ["doc-plan-a", "doc-plan-b"]) {
      db.prepare("INSERT OR IGNORE INTO projects (id, name, created_by, created_at, updated_at, planned_start_date, target_end_date) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, id, user.id, Date.now(), Date.now(), "2026-09-01", "2026-09-30");
      db.prepare("INSERT OR IGNORE INTO project_columns (id, project_id, name) VALUES (?, ?, ?)").run(id + "-open", id, "Offen");
    }
    db.prepare("INSERT INTO tasks (id, project_id, column_id, title, created_by, created_at, updated_at, start_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET start_date = excluded.start_date, due_date = excluded.due_date, updated_at = excluded.updated_at").run("doc-existing", "doc-plan-a", "doc-plan-a-open", "Existing scheduled task", user.id, Date.now(), Date.now(), "2026-09-10", "2026-09-12");
  } finally { db.close(); }
}

test.describe.configure({ timeout: 300_000 });

test("creating tasks retains paragraphs, headings, lists and marks", async ({ page }) => {
  const editor = await note(page);
  for (const type of ["paragraph", "heading", "bulletList"]) {
    const title = `Preserved ${type}`;
    const paragraph: JSONContent = { type: type === "heading" ? "heading" : "paragraph", ...(type === "heading" ? { attrs: { level: 2 } } : {}), content: [{ type: "text", text: title, marks: [{ type: "bold" }, { type: "italic" }] }] };
    await setDocument(editor, { type: "doc", content: [type === "bulletList" ? { type, content: [{ type: "listItem", content: [paragraph] }] } : paragraph] });
    const before = await snapshot(editor);
    await createTask(page, editor);
    await page.locator("#context-task-title").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Aufgabe erstellen", exact: true }).click();
    await expect(page.locator("#context-task-title")).toHaveCount(0);
    await expect.poll(() => savedTasks(title).length).toBe(1);
    expect(await snapshot(editor)).toEqual(before);
    await expect(editor.locator("[data-task-reference]")).toHaveCount(0);
  }
});

test("external and wiki links stop at the next space and retain bold", async ({ page }) => {
  const editor = await note(page);
  for (const selected of [true, false]) {
    for (const internal of [false, true]) {
      await setDocument(editor, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bold link", marks: [{ type: "bold" }] }] }] });
      if (!selected) await editor.evaluate((element) => (element as HTMLElement & { editor: Editor }).editor.commands.setTextSelection(10));
      await page.getByTestId("document-toolbar").getByRole("button", { name: "Link bearbeiten", exact: true }).click();
      await page.getByRole("textbox", { name: "Linktext", exact: true }).fill("Linked text");
      await page.getByRole("textbox", { name: "Webadresse", exact: true }).fill(internal ? "/wiki/pages/example" : "https://example.com");
      await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
      await page.keyboard.type(" after");
      await expect(editor.locator("a")).not.toContainText("after");
      await expect(editor).toContainText(" after");
      expect(await editor.evaluate((element) => {
        const doc = (element as HTMLElement & { editor: Editor }).editor.getJSON() as JSONContent;
        const last = doc.content![0].content!.at(-1)!;
        return { text: last.text, marks: last.marks?.map((mark) => mark.type) };
      })).toMatchObject({ text: expect.stringContaining(" after"), marks: ["bold"] });
    }
  }
});

test("Gantt drafts move and resize locally; project switches and cancellation preserve existing edits", async ({ page }) => {
  const editor = await note(page);
  seedProjects();
  await editor.fill("Uncommitted document task");
  await editor.press("Control+a");
  await createTask(page, editor);
  await chooseProject(page, "doc-plan-a");
  const planner = page.getByTestId("document-task-planner");
  await planner.locator("#draft-task-start").fill("2026-09-14");
  await planner.locator("#draft-task-end").fill("2026-09-16");
  const draft = planner.locator('[data-task-id="document-task-draft"]');
  await draft.locator('[data-resize-edge="end"]').press("ArrowRight");
  await expect(planner.locator("#draft-task-end")).toHaveValue("2026-09-17");
  const bar = draft.locator("button.cursor-grab").last();
  await bar.press("ArrowRight");
  await bar.press("Enter");
  await expect(planner.locator("#draft-task-start")).toHaveValue("2026-09-15");
  expect(savedTasks("Uncommitted document task")).toHaveLength(0);
  await expect(draft.locator('[aria-label^="Aktionen"]')).toHaveCount(0);
  await planner.locator('[data-task-id="doc-existing"] [data-resize-edge="end"]').press("ArrowRight");
  await expect.poll(() => savedTasks("Existing scheduled task")).toMatchObject([{ due_date: "2026-09-13" }]);
  await planner.getByRole("button", { name: "Zurück zur Aufgabe" }).click();
  await chooseProject(page, "doc-plan-b");
  await expect(planner.locator('[data-task-id="doc-existing"]')).toHaveCount(0);
  await expect(planner.locator("#draft-task-start")).toHaveValue("2026-09-15");
  await planner.getByRole("button", { name: "Zurück zur Aufgabe" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Abbrechen", exact: true }).click();
  expect(savedTasks("Uncommitted document task")).toHaveLength(0);
  expect(savedTasks("Existing scheduled task")).toMatchObject([{ due_date: "2026-09-13" }]);
});

test("Gantt dates survive reopen and save exactly one task with its document origin", async ({ page }) => {
  const editor = await note(page);
  seedProjects();
  await editor.fill("Saved document task");
  await editor.press("Control+a");
  const before = await snapshot(editor);
  await createTask(page, editor);
  await chooseProject(page, "doc-plan-a");
  const planner = page.getByTestId("document-task-planner");
  await planner.locator("#draft-task-start").fill("2026-09-18");
  await planner.locator("#draft-task-end").fill("2026-09-21");
  await planner.getByRole("button", { name: "Zurück zur Aufgabe" }).click();
  await page.getByRole("button", { name: "Gantt-Zeitplanung öffnen" }).click();
  await expect(planner.locator("#draft-task-start")).toHaveValue("2026-09-18");
  await planner.getByRole("button", { name: "Zurück zur Aufgabe" }).click();
  // Two immediate submissions must still create only one task.
  await page.getByRole("dialog").getByRole("button", { name: "Aufgabe erstellen", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.locator("#context-task-title")).toHaveCount(0);
  expect(savedTasks("Saved document task")).toMatchObject([{ project_id: "doc-plan-a", start_date: "2026-09-18", due_date: "2026-09-21" }]);
  expect(await snapshot(editor)).toEqual(before);
  const db = database();
  try {
    const origin = db.prepare("SELECT anchor_json FROM task_contexts WHERE entity_id = ?").get(currentPageId) as { anchor_json: string };
    expect(JSON.parse(origin.anchor_json).quote).toBe("Saved document task");
  } finally { db.close(); }
});

test("checkboxes are 14px and centered on the first line, including nested lists", async ({ page }) => {
  const editor = await note(page);
  const task = (text: string): JSONContent => ({ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const outer = task("A long first line ".repeat(20));
  outer.content!.push({ type: "taskList", content: [task("Nested entry")] });
  await setDocument(editor, { type: "doc", content: [{ type: "taskList", content: [outer] }] });
  const metrics = await editor.locator('input[type="checkbox"]').evaluateAll((inputs) => inputs.map((input) => {
    const box = input.getBoundingClientRect();
    const paragraph = input.closest("li")!.querySelector("p")!;
    const line = parseFloat(getComputedStyle(paragraph).lineHeight);
    return { width: box.width, height: box.height, difference: Math.abs(box.y + box.height / 2 - (paragraph.getBoundingClientRect().y + line / 2)) };
  }));
  expect(metrics).toHaveLength(2);
  for (const metric of metrics) { expect(metric.width).toBe(14); expect(metric.height).toBe(14); expect(metric.difference).toBeLessThan(1); }
  await page.screenshot({ path: "output/playwright/document-editor-checkboxes.png" });
});


test("schedule loading and task saving can be retried without losing the draft", async ({ page }) => {
  const editor = await note(page);
  seedProjects();
  await editor.fill("Retry document task");
  await editor.press("Control+a");
  await createTask(page, editor);
  await page.locator("#context-task-project").click();
  // Options are loaded before intercepting the planner's first server action.
  await expect(page.getByRole("option", { name: "doc-plan-a", exact: true })).toBeVisible();
  let failNext = true;
  await page.route("**/wiki/pages/**", async (route) => {
    if (failNext && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      failNext = false;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("option", { name: "doc-plan-a", exact: true }).click();
  const planner = page.getByTestId("document-task-planner");
  await expect(planner.getByRole("alert")).toBeVisible();
  await planner.locator("#draft-task-start").fill("2026-09-22");
  await planner.locator("#draft-task-end").fill("2026-09-24");
  await planner.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(planner.getByTestId("portfolio-gantt")).toBeVisible();
  await expect(planner.locator("#draft-task-start")).toHaveValue("2026-09-22");
  await planner.getByRole("button", { name: "Zurück zur Aufgabe" }).click();
  failNext = true;
  await page.getByRole("dialog").getByRole("button", { name: "Aufgabe erstellen", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(page.locator("#context-task-title")).toHaveValue("Retry document task");
  expect(savedTasks("Retry document task")).toHaveLength(0);
  await page.getByRole("dialog").getByRole("button", { name: "Aufgabe erstellen", exact: true }).click();
  await expect(page.locator("#context-task-title")).toHaveCount(0);
  expect(savedTasks("Retry document task")).toMatchObject([{ start_date: "2026-09-22", due_date: "2026-09-24" }]);
});


test("planner remains usable on narrow screens and pointer drags stay local", async ({ page }) => {
  const editor = await note(page);
  seedProjects();
  await editor.fill("Visual planning draft");
  await editor.press("Control+a");
  await createTask(page, editor);
  await chooseProject(page, "doc-plan-a");
  const planner = page.getByTestId("document-task-planner");
  await planner.locator("#draft-task-start").fill("2026-09-14");
  await planner.locator("#draft-task-end").fill("2026-09-17");
  const bar = planner.locator('[data-task-id="document-task-draft"] [data-task-bar="true"]').last();
  const bounds = await bar.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 35, bounds!.y + bounds!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(planner.locator("#draft-task-start")).not.toHaveValue("2026-09-14");
  expect(savedTasks("Visual planning draft")).toHaveLength(0);
  await page.screenshot({ path: "output/playwright/document-editor-gantt.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(planner.getByTestId("portfolio-gantt")).toBeVisible();
  await expect.poll(async () => (await planner.boundingBox())!.width).toBeLessThanOrEqual(390);
  await expect.poll(async () => {
    const chart = await planner.getByTestId("portfolio-gantt").boundingBox();
    const tree = await planner.locator('[data-task-id="document-task-draft"] > div').first().boundingBox();
    return chart!.width - tree!.width;
  }).toBeGreaterThan(100);
  await page.screenshot({ path: "output/playwright/document-editor-gantt-mobile.png" });
  await planner.getByRole("button", { name: "Zurück zur Aufgabe" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Abbrechen", exact: true }).click();
});
