import { expect, test, type Page } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

async function capture(page: Page, name: string) {
  await page.getByTestId("network-quick-capture").click();
  const dialog = page.getByRole("dialog", { name: "Kontakt erfassen" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toHaveCount(0);
}

test("filters and sorts the contact list through the URL", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const prefix = `Filter${Date.now()}`;

  await page.goto("/network");
  await capture(page, `${prefix} Anton`);
  await capture(page, `${prefix} Berta`);

  // Search narrows the list; alphabetical by default.
  await page.getByRole("searchbox", { name: "Suchen" }).fill(prefix);
  await page.getByRole("search").getByRole("button", { name: "Suchen" }).click();
  await expect(page).toHaveURL(new RegExp(`q=${prefix}`));
  const rows = page.getByTestId("network-contact-list").getByRole("link");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`${prefix} Anton`);

  // Changing the sort applies at once and keeps the search.
  await page.getByLabel("Sortierung").selectOption("recent");
  await expect(page).toHaveURL(new RegExp(`q=${prefix}.*sort=recent`));
  await expect(rows.first()).toContainText(`${prefix} Berta`);

  // New contacts are private, so "team" shows none of them.
  await page.getByTestId("network-filters").getByLabel("Kontakte", { exact: true }).selectOption("team");
  await expect(page).toHaveURL(/scope=team/);
  await expect(page.getByText("Keine Kontakte passen zu diesem Filter.")).toBeVisible();

  // Clearing the filters keeps the sort order.
  await page.getByRole("link", { name: "Filter zurücksetzen" }).first().click();
  await expect(page).toHaveURL(/\/network\?sort=recent$/);
  await expect(page.getByLabel("Sortierung")).toHaveValue("recent");

  // Unknown values never break the page.
  await page.goto("/network?sort=bogus&scope=everyone&municipality=abc&tag=nope&tag=x");
  await expect(page.getByLabel("Sortierung")).toHaveValue("name");
  await expect(page.getByTestId("network-contact-list")).toBeVisible();

  expect(errors).toEqual([]);
});
