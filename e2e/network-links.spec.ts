import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

test("groups contacts by organisation and links them to a project", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const suffix = Date.now();
  const projectName = `Pilot Leoben ${suffix}`;
  const name = `Maria ${suffix}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "Neues Projekt" }).click();
  await page.locator("#project-name").fill(projectName);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("#project-name")).toHaveCount(0);

  await page.goto("/network");
  await page.getByTestId("network-quick-capture").click();
  const capture = page.getByRole("dialog", { name: "Kontakt erfassen" });
  await capture.getByLabel("Name").fill(name);
  await capture.getByRole("button", { name: "Speichern" }).click();
  await expect(capture).toHaveCount(0);
  await page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) }).click();

  // Typing the organisation creates it; the contact links to its page.
  const detail = page.getByTestId("network-contact-detail");
  await detail.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Kontakt bearbeiten" });
  await edit.getByLabel("Organisation", { exact: true }).fill(`Stadtgemeinde Leoben ${suffix}`);
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(edit).toHaveCount(0);
  const contactUrl = page.url();
  await detail.getByRole("link", { name: `Stadtgemeinde Leoben ${suffix}` }).click();
  const organization = page.getByTestId("network-organization-detail");
  await expect(organization.getByRole("heading", { name: `Stadtgemeinde Leoben ${suffix}` })).toBeVisible();
  await expect(organization.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await organization.getByRole("link", { name: "Alle Organisationen" }).click();
  await expect(page.getByTestId("network-organization-list")).toContainText(`Stadtgemeinde Leoben ${suffix}`);

  // Link the contact to the project and see it on the project's knowledge view.
  await page.goto(contactUrl);
  await detail.getByRole("button", { name: "Verknüpfen", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Kontakt verknüpfen" });
  await picker.getByRole("searchbox").fill(projectName);
  await picker.getByRole("button", { name: new RegExp(projectName) }).click();
  await expect(picker).toHaveCount(0);
  const link = detail.getByTestId("network-contact-links").getByRole("link", { name: new RegExp(projectName) });
  await expect(link).toBeVisible();
  const projectHref = await link.getAttribute("href");
  await page.goto(`${projectHref}?view=knowledge`);
  await expect(page.getByTestId("network-contacts-panel")).toContainText(name);
  expect(errors).toEqual([]);
});
