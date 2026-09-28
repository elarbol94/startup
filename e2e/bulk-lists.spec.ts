import { expect, test, type Page } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

test.describe.configure({ timeout: 240_000 });
test.use({ viewport: { width: 1440, height: 1000 } });

const bar = (page: Page) => page.getByRole("toolbar", { name: "Aktionen für die Auswahl" });
const select = (page: Page, name: string) => page.getByRole("checkbox", { name: `${name} auswählen`, exact: true }).click();

async function captureContact(page: Page, name: string, note: string) {
  await page.getByTestId("network-quick-capture").click();
  const dialog = page.getByRole("dialog", { name: "Kontakt erfassen" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Was wurde gesagt?").fill(note);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toHaveCount(0);
}

test("contacts and opportunities can be tagged, updated and deleted in bulk", async ({ page }) => {
  await loginAsAnyUser(page);
  const suffix = Date.now().toString(36);
  const [first, second] = [`Bulk Erste ${suffix}`, `Bulk Zweite ${suffix}`];
  await page.goto("/network");
  await captureContact(page, first, `Hilft beim Design ${suffix}`);
  await captureContact(page, second, `Kennt die Gemeinde ${suffix}`);
  const list = page.getByTestId("network-contact-list");
  const contactRow = (name: string) => list.getByRole("link", { name: new RegExp(name) });

  await select(page, first);
  await select(page, second);
  await bar(page).getByRole("button", { name: "Tags" }).click();
  const tags = page.getByTestId("tag-edit-dialog");
  await tags.getByRole("textbox", { name: "Neuer Tag" }).fill(`bulk-${suffix}`);
  await tags.getByRole("button", { name: "Hinzufügen" }).click();
  await tags.getByRole("button", { name: "Übernehmen" }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(contactRow(first)).toContainText(`bulk-${suffix}`);
  await expect(contactRow(second)).toContainText(`bulk-${suffix}`);

  // Opportunities: select mode swaps the "done" checkbox for selection.
  await page.goto("/network/opportunities");
  await page.getByRole("button", { name: "Auswählen", exact: true }).click();
  await select(page, `Hilft beim Design ${suffix}`);
  await select(page, `Kennt die Gemeinde ${suffix}`);
  await bar(page).getByRole("button", { name: "Status" }).click();
  await page.getByRole("menuitem", { name: "Erledigt" }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByTestId("network-lead-list").getByText(`Hilft beim Design ${suffix}`)).toHaveCount(0);

  await page.goto("/network");
  await select(page, first);
  await select(page, second);
  await bar(page).getByRole("button", { name: "Löschen" }).click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(contactRow(first)).toHaveCount(0);
  await expect(contactRow(second)).toHaveCount(0);
});

test("projects can be archived, restored and deleted in bulk with undo", async ({ page }) => {
  await loginAsAnyUser(page);
  const suffix = Date.now().toString(36);
  const names = [`Bulk Projekt A ${suffix}`, `Bulk Projekt B ${suffix}`];
  await page.goto("/projects");
  for (const name of names) {
    await page.getByRole("button", { name: "Neues Projekt" }).first().click();
    await page.locator("#project-name").fill(name);
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.locator('[data-row-kind="project"]').filter({ hasText: name })).toBeVisible();
  }
  await page.getByRole("button", { name: "Projektübersicht" }).click();
  const card = (name: string) => page.getByTestId("project-card").filter({ hasText: name });

  for (const name of names) await select(page, name);
  await bar(page).getByRole("button", { name: "Archivieren" }).click();
  // The selection clears once the server confirmed the change.
  await expect(bar(page)).toHaveCount(0);
  await expect(card(names[0])).toHaveCount(0);
  await expect(page.getByText(names[0])).toBeVisible();

  for (const name of names) await select(page, name);
  await bar(page).getByRole("button", { name: "Wiederherstellen" }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect(card(names[0])).toBeVisible();
  await expect(card(names[1])).toBeVisible();

  // Delete, undo, then delete for good.
  for (const name of names) await select(page, name);
  await bar(page).getByRole("button", { name: "Löschen" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("2 Projekte löschen?");
  await dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(card(names[0])).toHaveCount(0);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(card(names[0])).toBeVisible();
  await expect(card(names[1])).toBeVisible();

  for (const name of names) await select(page, name);
  await bar(page).getByRole("button", { name: "Löschen" }).click();
  await dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(card(names[0])).toHaveCount(0);
  // Let the 10 s undo window run out so the delete commits before reloading.
  await page.waitForTimeout(13_000);
  await page.reload();
  await page.getByRole("button", { name: "Projektübersicht" }).click();
  await expect(card(names[0])).toHaveCount(0);
  await expect(card(names[1])).toHaveCount(0);
});
