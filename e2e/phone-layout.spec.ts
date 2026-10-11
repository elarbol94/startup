import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

// Design 1b phone pass: no sideways scrolling, the calendar day list and the switchable Gantt.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const pages = [
  "/", "/calendar", "/projects", "/time", "/meetings", "/accounting", "/accounting/bookings",
  "/accounting/invoices", "/accounting/planning", "/accounting/funding-projects", "/personnel",
  "/wiki", "/wiki/sources", "/network", "/settings/profile",
];

test("main pages fit a 390 px phone without sideways scrolling", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsAnyUser(page);
  for (const path of pages) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      panel: document.querySelector("#workspace-panel-primary")?.scrollWidth ?? 0,
      viewport: window.innerWidth,
    }));
    expect({ path, overflow: Math.max(widths.document, widths.panel) > widths.viewport }).toEqual({ path, overflow: false });
  }
});

test("phones get a day list in the calendar and can switch the project overview to the Gantt", async ({ page }) => {
  await loginAsAnyUser(page);
  await page.goto("/calendar?view=agenda&date=2026-10-12");
  // Monday 12 to Sunday 18 October: every day is listed, empty weekdays and the weekend say so.
  await expect(page.getByText("Keine Termine", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Wochenende", { exact: true }).first()).toBeVisible();
  await expect(page.locator("section[aria-labelledby^='agenda-']")).toHaveCount(7);

  await page.goto("/projects");
  const gantt = page.getByTestId("portfolio-gantt");
  await expect(gantt).toBeHidden();
  await page.getByRole("radio", { name: "Gantt", exact: true }).click();
  await expect(gantt).toBeVisible();
  await expect(page.getByTestId("mobile-portfolio")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("radio", { name: "Übersicht", exact: true }).click();
  await expect(gantt).toBeHidden();
});
