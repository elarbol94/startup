import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

test("shows the network on the municipality map and opens a municipality", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = `Kartenperson ${Date.now()}`;

  await page.goto("/network");
  await page.getByTestId("network-quick-capture").click();
  const capture = page.getByRole("dialog", { name: "Kontakt erfassen" });
  await capture.getByLabel("Name").fill(name);
  await capture.getByRole("button", { name: "Speichern" }).click();
  await expect(capture).toHaveCount(0);
  await page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) }).click();
  const detail = page.getByTestId("network-contact-detail");
  await detail.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Kontakt bearbeiten" });
  await edit.getByLabel("Wohnort").fill("Leob");
  await edit.getByRole("option", { name: /Leoben/ }).first().click();
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(edit).toHaveCount(0);

  await page.getByRole("link", { name: "Karte" }).click();
  await expect(page).toHaveURL(/\/network\/map/);
  const map = page.getByTestId("network-map");
  await expect(map).toHaveAttribute("data-map-ready", "true", { timeout: 60_000 });
  await expect(map).toHaveAttribute("data-overlay-markers", /^[1-9]\d*$/);

  // Searching narrows the map like the list; the overview then lists only Leoben.
  await page.locator('form[role="search"] input[name="q"]:visible').fill(name);
  await expect(page).toHaveURL(/[?&]q=/);
  const panel = page.getByTestId("network-map-panel");
  await expect(panel).toContainText("1 Person in 1 Gemeinde");
  await panel.getByRole("button", { name: /Leoben/ }).click();
  await expect(page).toHaveURL(/[?&]municipality=61108/);
  await expect(panel.getByRole("heading", { name: "Leoben" })).toBeVisible();

  // The colour mode is kept in the URL next to the filter and the selection.
  await page.getByTestId("network-map-color").selectOption("recency");
  await expect(page).toHaveURL(/[?&]color=recency/);
  await page.reload();
  await expect(page.getByTestId("network-map-color")).toHaveValue("recency");
  await expect(panel.getByRole("heading", { name: "Leoben" })).toBeVisible();

  await panel.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByTestId("network-contact-detail")).toBeVisible();
  expect(errors).toEqual([]);
});
