import { test, expect, type Page } from "@playwright/test";

// Keyboard shortcuts of /projects (timeline, focus mode) and the project page. Self-contained:
// reuses only the admin account created by accounting.spec.ts.

test.describe.configure({ mode: "serial" });

const PROJECT = "Kürzel-Projekt";
const TASK = "Kürzel-Aufgabe";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("super-secret-1");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Willkommen, E2E Admin!" })).toBeVisible();
}

/** Page shortcuts are ignored while a control has focus, as they are for a user typing. */
async function press(page: Page, key: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(key);
}

function projectRow(page: Page) {
  return page.locator('[data-row-kind="project"]').filter({ hasText: PROJECT });
}

test("project page: N creates a task, 1–3 switch views", async ({ page }) => {
  await login(page);
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");

  await press(page, "n");
  await page.locator("#project-name").fill(PROJECT);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(projectRow(page)).toBeVisible();
  await projectRow(page).getByRole("link", { name: new RegExp(PROJECT) }).click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+$/);
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-column-name="Offen"]')).toBeVisible();

  await press(page, "n");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Neue Aufgabe" })).toBeVisible();
  await dialog.locator("#task-title").fill(TASK);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator(`[data-task-title="${TASK}"]`)).toBeVisible();

  await press(page, "2");
  await expect(page).toHaveURL(/view=knowledge/);
  await page.waitForLoadState("networkidle");
  await press(page, "3");
  await expect(page).toHaveURL(/view=activity/);
  await page.waitForLoadState("networkidle");
  await press(page, "1");
  await expect(page).not.toHaveURL(/view=/);
  await expect(page.locator('[data-column-name="Offen"]')).toBeVisible();
});

test("timeline: K toggles the critical path, Shift+N adds a subtask in focus mode", async ({ page }) => {
  await login(page);
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");

  const viewOptions = page.getByRole("button", { name: "Ansichtsoptionen" });
  const criticalPath = page.getByRole("menuitemcheckbox", { name: /Kritischer Pfad/ });
  await press(page, "k");
  await viewOptions.click();
  await expect(criticalPath).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await press(page, "k");
  await viewOptions.click();
  await expect(criticalPath).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  const row = projectRow(page);
  if (await row.getAttribute("aria-expanded") !== "true") {
    await row.getByRole("button", { name: "Projekt ein- oder ausklappen", exact: true }).click();
  }
  await page.locator('[data-row-kind="task"]').filter({ hasText: TASK })
    .getByRole("button", { name: `Aktionen für ${TASK}` }).click();
  await page.getByRole("menuitem", { name: "Auf Aufgabe fokussieren" }).click();
  const focusRail = page.getByTestId("gantt-focus-rail");
  await expect(focusRail).toContainText(TASK);

  await press(page, "Shift+N");
  await expect(
    page.getByTestId("schedule-inspector-dock").getByRole("heading", { name: "Unteraufgabe hinzufügen" }),
  ).toBeVisible();
});

test("timeline: the focus mode shortcut leaves focused planning", async ({ page }) => {
  await login(page);
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");

  const row = projectRow(page);
  if (await row.getAttribute("aria-expanded") !== "true") {
    await row.getByRole("button", { name: "Projekt ein- oder ausklappen", exact: true }).click();
  }
  await page.locator('[data-row-kind="task"]').filter({ hasText: TASK })
    .getByRole("button", { name: `Aktionen für ${TASK}` }).click();
  await page.getByRole("menuitem", { name: "Auf Aufgabe fokussieren" }).click();
  await expect(page.getByTestId("gantt-focus-rail")).toContainText(TASK);
  await expect(page).toHaveURL(/[?&]focus=/);
  await expect(page.getByTestId("app-sidebar").filter({ visible: true })).toHaveCount(0);

  await press(page, "Control+Shift+F");
  await expect(page.getByTestId("gantt-focus-rail")).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]focus=/);
  await expect(page.getByTestId("app-sidebar").filter({ visible: true })).toBeVisible();
  // Leaving planning must not switch the global focus mode on instead.
  await expect(page.getByTestId("focus-pill")).toHaveCount(0);
});
