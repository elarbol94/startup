import { expect, test, type Page } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

// Sharing pages and items as links (docs/sharing.md).
test.use({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1440, height: 1000 } });

async function clipboardText(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

async function signInThroughForm(page: Page, username: string) {
  await page.locator("#username").fill(username);
  await page.locator("#password").fill("super-secret-1");
  await page.getByRole("button", { name: "Anmelden" }).click();
}

test("a link opened while signed out leads to its page after sign-in", async ({ page }) => {
  await loginAsAnyUser(page);
  const { user } = await (await page.request.get("/api/auth/get-session")).json();
  await page.context().clearCookies();

  await page.goto("/calendar?view=month&date=2026-03-15");
  await expect(page).toHaveURL(/\/login\?next=%2Fcalendar%3Fview%3Dmonth%26date%3D2026-03-15$/);
  await signInThroughForm(page, user.username);
  await expect(page).toHaveURL(/\/calendar\?view=month&date=2026-03-15$/);

  // `next` only ever leads to a page on this site.
  await page.context().clearCookies();
  await page.goto("/login?next=%2F%2Fevil.example%2F");
  await signInThroughForm(page, user.username);
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test("the sidebar share menu copies the current page's link", async ({ page, baseURL }) => {
  await loginAsAnyUser(page);
  await page.goto("/time");
  const sidebar = page.getByTestId("app-sidebar");

  await sidebar.getByRole("button", { name: "Seite teilen" }).click();
  await page.getByRole("menuitem", { name: "Link kopieren" }).click();
  await expect(page.getByText("Link kopiert", { exact: true })).toBeVisible();
  expect(await clipboardText(page)).toBe(`${baseURL}/time`);

  await sidebar.getByRole("button", { name: "Seite teilen" }).click();
  await page.getByRole("menuitem", { name: "Link mit Titel kopieren" }).click();
  await expect.poll(() => clipboardText(page)).toMatch(new RegExp(`^\\[.+\\]\\(${baseURL!.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/time\\)$`));
});

test("a shared calendar link opens the event's details", async ({ page, baseURL }) => {
  await loginAsAnyUser(page);
  const title = `Shared review ${Date.now()}`;
  await page.goto("/calendar?date=2026-08-12&view=week");
  await page.getByRole("button", { name: "Neuer Termin" }).click();
  await page.getByPlaceholder("Was findet statt?").fill(title);
  await page.getByRole("textbox", { name: "Beginn-Datum" }).fill("12.08.2026");
  await page.getByRole("textbox", { name: "Beginn-Uhrzeit" }).fill("09:00");
  await page.getByRole("textbox", { name: "End-Uhrzeit" }).fill("10:00");
  await page.getByRole("button", { name: "Termin speichern" }).click();
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Eintrag teilen" }).click();
  await page.getByRole("menuitem", { name: "Link kopieren" }).click();
  await expect.poll(() => clipboardText(page)).toContain(`${baseURL}/calendar?date=2026-08-12&item=`);
  const link = await clipboardText(page);

  await page.goto("/time");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  // The address drops the item once it is open, so moving through weeks behaves as usual.
  await expect(page).not.toHaveURL(/item=/);
});
