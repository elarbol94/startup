import { expect, test } from "@playwright/test";

test("dashboard board creates, moves, edits, filters and remembers the view", async ({ page }) => {
  test.setTimeout(180_000);
  const credentials = { username: "admin", password: "super-secret-1" };
  let response = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  const panel = page.locator('[data-overview-section="tasks"]');
  await panel.getByRole("button", { name: "Board", exact: true }).click();
  const board = page.getByTestId("dashboard-task-board");
  await expect(board).toBeVisible();
  const todo = board.locator('[data-board-stage="todo"]');
  const doing = board.locator('[data-board-stage="in_progress"]');
  const done = board.locator('[data-board-stage="done"]');
  await todo.getByRole("button", { name: "Aufgabe in Offen hinzufügen" }).click();
  const title = `Board test ${Date.now()}`;
  await todo.getByRole("textbox", { name: "Aufgabe", exact: true }).fill(title);
  await todo.getByRole("textbox", { name: "Aufgabe", exact: true }).press("Enter");
  const card = board.locator("[data-task-card]").filter({ has: page.getByRole("button", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  await expect(board).toHaveAttribute("aria-busy", "false");
  await card.getByRole("combobox").selectOption("in_progress");
  await expect(doing.getByRole("button", { name: title, exact: true })).toBeVisible();
  await page.reload();
  await expect(board).toBeVisible();
  await expect(doing.getByRole("button", { name: title, exact: true })).toBeVisible();

  // The whole card is draggable; the status selector above covers the non-drag fallback.
  await expect(card).toHaveAttribute("aria-label", `${title} verschieben`);
  const handle = await card.getByRole("button", { name: title, exact: true }).boundingBox();
  const destination = await todo.boundingBox();
  expect(handle).not.toBeNull(); expect(destination).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination!.x + 50, destination!.y + 45, { steps: 12 });
  await page.mouse.up();
  await expect(todo.getByRole("button", { name: title, exact: true })).toBeVisible();
  await expect(board).toHaveAttribute("aria-busy", "false");
  await card.getByRole("button", { name: title, exact: true }).click();
  await page.locator("#context-task-title").fill(`${title} edited`);
  await page.getByRole("dialog").getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  const edited = board.locator("[data-task-card]").filter({ hasText: `${title} edited` });
  await expect(edited).toBeVisible();
  await edited.getByRole("combobox").selectOption("done");
  await expect(done.getByRole("button", { expanded: false })).toBeVisible();
  await done.getByRole("button", { expanded: false }).click();
  await expect(done.getByText(`${title} edited`, { exact: true })).toBeVisible();
  await expect(board).toHaveAttribute("aria-busy", "false");
  await edited.getByRole("combobox").selectOption("todo");
  await expect(todo.getByText(`${title} edited`, { exact: true })).toBeVisible();
  // Search lives in the filter menu (design 1b).
  await panel.getByRole("button", { name: "Filter", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Aufgaben suchen" });
  await search.fill("does-not-match-any-task");
  await expect(board.locator("[data-task-card]")).toHaveCount(0);
  await search.fill("");
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(board).toHaveCount(0);
  await page.reload();
  await expect(panel.getByRole("button", { name: "Board", exact: true })).toBeVisible();
  await expect(board).toHaveCount(0);
  await panel.getByRole("button", { name: "Board", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(board).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/dashboard-board-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/dashboard-board-desktop.png", fullPage: true });
});

test("dashboard list groups tasks by due date and checks them off in place", async ({ page }) => {
  const credentials = { username: "admin", password: "super-secret-1" };
  let response = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  const panel = page.locator('[data-overview-section="tasks"]');
  await panel.getByRole("radio", { name: "Alle", exact: true }).click();
  const title = `Overdue list task ${Date.now()}`;
  await page.getByRole("button", { name: "Aufgabe erstellen", exact: true }).first().click();
  await page.locator("#context-task-title").fill(title);
  await page.locator("#context-task-due").fill("2020-01-15");
  await page.getByRole("dialog").getByRole("button", { name: "Aufgabe erstellen", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const overdue = panel.getByRole("group", { name: /^Überfällig · \d+$/ });
  const row = overdue.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  // Checking it off strikes it through and keeps it where it was until the page reloads.
  await row.getByRole("checkbox", { name: "Als erledigt markieren" }).click();
  await expect(row.getByRole("checkbox", { name: "Wieder öffnen" })).toHaveAttribute("aria-checked", "true");
  await expect(row.getByText(title, { exact: true })).toHaveClass(/line-through/);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(panel.getByText(title, { exact: true })).toHaveCount(0);
});
