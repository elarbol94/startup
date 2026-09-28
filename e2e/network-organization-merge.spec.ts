import { expect, test, type Page } from "@playwright/test";

const credentials = { username: "admin", password: "super-secret-1" };

/** Signs in as the e2e admin (the first account on a fresh database is an admin). */
async function loginAsAdmin(page: Page) {
  let response = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(response.ok()).toBe(true);
  return (await (await page.request.get("/api/auth/get-session")).json()).user.role as string;
}

test("an admin merges an organisation after a rename clash", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip((await loginAsAdmin(page)) !== "admin", "needs the e2e admin account");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const suffix = Date.now();
  const original = `Klimabündnis ${suffix}`;
  const duplicate = `Klimabuendnis Steiermark ${suffix}`;

  async function contactAt(name: string, organization: string) {
    await page.goto("/network");
    await page.getByTestId("network-quick-capture").click();
    const capture = page.getByRole("dialog", { name: "Kontakt erfassen" });
    await capture.getByLabel("Name").fill(name);
    await capture.getByRole("button", { name: "Speichern" }).click();
    await expect(capture).toHaveCount(0);
    await page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) }).click();
    await page.getByTestId("network-contact-detail").getByRole("button", { name: "Bearbeiten", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Kontakt bearbeiten" });
    await edit.getByLabel("Organisation", { exact: true }).fill(organization);
    await edit.getByRole("button", { name: "Speichern" }).click();
    await expect(edit).toHaveCount(0);
  }
  await contactAt(`Anna ${suffix}`, original);
  await contactAt(`Bernd ${suffix}`, duplicate);

  // Renaming the duplicate onto the original's name offers the merge.
  await page.getByTestId("network-contact-detail").getByRole("link", { name: duplicate }).click();
  const detail = page.getByTestId("network-organization-detail");
  await detail.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Organisation bearbeiten" });
  await edit.getByLabel("Name").fill(original.toLowerCase());
  await edit.getByRole("button", { name: "Speichern" }).click();
  await edit.getByTestId("network-organization-clash").getByRole("button", { name: `Mit ${original} zusammenführen` }).click();

  const dialog = page.getByRole("dialog", { name: "Organisationen zusammenführen" });
  const preview = dialog.getByTestId("network-organization-merge-preview");
  await expect(preview).toContainText("Bleibt erhalten");
  await expect(preview).toContainText(original);
  await expect(preview).toContainText("1 Kontakt");
  await dialog.getByRole("button", { name: "Endgültig zusammenführen" }).click();

  await expect(detail.getByRole("heading", { name: original })).toBeVisible();
  await expect(detail.getByRole("link", { name: new RegExp(`Anna ${suffix}`) })).toBeVisible();
  await expect(detail.getByRole("link", { name: new RegExp(`Bernd ${suffix}`) })).toBeVisible();
  await page.goto("/network/organizations");
  await expect(page.getByTestId("network-organization-list")).not.toContainText(duplicate);

  expect(errors).toEqual([]);
});
