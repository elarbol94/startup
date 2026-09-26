import { test, expect, type Page } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

test.describe.configure({ mode: "serial" });

const PROJECT = "Verbindungstest";
const SHOTS = process.env.PROJECT_CONNECTIONS_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function openProject(page: Page) {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  const row = page.locator('[data-row-kind="project"]').filter({ hasText: PROJECT });
  await row.getByRole("button", { name: `Aktionen für ${PROJECT}` }).click();
  await page.getByRole("menuitem", { name: "Kanban-Board öffnen" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/?#]+$/);
  await page.waitForLoadState("networkidle");
  return page.url();
}

test("a project links events and customers and shows them on its page", async ({ page }) => {
  await loginAsAnyUser(page);

  await page.goto("/projects");
  await page.getByRole("button", { name: "Neues Projekt" }).click();
  await page.locator("#project-name").fill(PROJECT);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator('[data-row-kind="project"]').filter({ hasText: PROJECT })).toBeVisible();

  const projectUrl = await openProject(page);
  const overview = page.getByLabel("Projektüberblick");
  await expect(overview.getByText("0 offen")).toBeVisible();
  await expect(overview.getByText(/h diesen Monat/)).toBeVisible();
  await shot(page, "1-project-header");

  // "+ Neu → Termin" opens the calendar with the project already chosen.
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Termin" }).click();
  await expect(page).toHaveURL(/\/calendar\?.*new=event/);
  const dialog = page.getByRole("dialog", { name: "Neuer Termin" });
  await expect(dialog.getByRole("link", { name: PROJECT })).toBeVisible();
  await dialog.getByLabel("Titel", { exact: true }).fill("Kickoff Verbindung");
  await shot(page, "2-event-dialog");
  await dialog.getByRole("button", { name: "Termin speichern" }).click();
  await expect(dialog).toBeHidden();

  // Customers get tagged from their dialog.
  await page.goto("/accounting/customers");
  await page.getByRole("button", { name: "Neuer Kunde" }).click();
  const customerDialog = page.getByRole("dialog", { name: "Neuer Kunde" });
  await customerDialog.locator("#customer-name").fill("Testkunde Verbindung");
  await customerDialog.getByRole("button", { name: "Projekt", exact: true }).click();
  await page.getByRole("option", { name: PROJECT }).click();
  await page.keyboard.press("Escape");
  await expect(customerDialog.getByRole("link", { name: PROJECT })).toBeVisible();
  await customerDialog.getByRole("button", { name: "Speichern" }).click();
  await expect(customerDialog).toBeHidden();
  const customerRow = page.getByRole("row").filter({ hasText: "Testkunde Verbindung" });
  const chip = customerRow.getByRole("link", { name: PROJECT });
  await expect(chip).toBeVisible();

  // Hovering the chip previews the project.
  await chip.hover();
  await expect(page.getByText("0 offen · 0 erledigt")).toBeVisible();
  await shot(page, "3-customer-chip-preview");

  // Both records are listed on the project's knowledge view.
  await page.goto(projectUrl);
  await expect(page.getByLabel("Projektüberblick").getByText("2 verknüpft")).toBeVisible();
  await page.getByLabel("Projektüberblick").getByText("2 verknüpft").click();
  const connections = page.locator("#connections");
  await expect(connections.getByText("Kickoff Verbindung")).toBeVisible();
  await expect(connections.getByText("Testkunde Verbindung")).toBeVisible();
  await shot(page, "4-knowledge-connections");
});
