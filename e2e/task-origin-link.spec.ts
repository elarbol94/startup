import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

function taskContext(title: string) {
  const sqlite = new Database(path.resolve("data/e2e.db"), { readonly: true });
  try {
    return sqlite.prepare(
      "SELECT t.description, c.route FROM tasks t LEFT JOIN task_contexts c ON c.task_id = t.id WHERE t.title = ?",
    ).get(title) as { description: string; route: string | null } | undefined;
  } finally {
    sqlite.close();
  }
}

async function createWithShortcut(page: Page, title: string, link: boolean) {
  const dialog = page.getByRole("dialog");
  // Retry until the client shortcut listener is attached after hydration.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("Control+Shift+A");
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  const checkbox = dialog.getByRole("checkbox", { name: "Mit dieser Seite verknüpfen" });
  // The generic shortcut starts without a link to the current page.
  await expect(checkbox).not.toBeChecked();
  if (link) await checkbox.click();
  await page.locator("#context-task-title").fill(title);
  await page.locator("#context-task-description").fill(`${title} details`);
  await dialog.getByRole("button", { name: "Aufgabe erstellen", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("the task shortcut links to the current page only when asked", async ({ page }) => {
  const credentials = { username: "admin", password: "super-secret-1" };
  let response = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(response.ok()).toBe(true);
  await page.goto("/calendar");
  await expect(page.locator("main")).toBeVisible();

  const standalone = `Standalone ${Date.now()}`;
  await createWithShortcut(page, standalone, false);
  await expect.poll(() => taskContext(standalone)).toEqual({ description: `${standalone} details`, route: null });

  const linked = `Linked ${Date.now()}`;
  await createWithShortcut(page, linked, true);
  await expect.poll(() => taskContext(linked)?.route).toBe("/calendar");
});
