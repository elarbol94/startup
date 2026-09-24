import { expect, test } from "@playwright/test";

// Uses the account created by accounting.spec.ts, as the other app specs do.
test("workspace keeps tabs mounted across split and narrow layouts", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("super-secret-1");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/projects");
  await page.setViewportSize({ width: 1600, height: 950 });
  await expect(async () => {
    await page.getByRole("button", { name: "Neuer Tab", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }).toPass();
  await page.getByRole("dialog").getByRole("button", { name: "Wiki", exact: true }).click();
  const frame = page.locator("iframe[data-workspace-pane]");
  await expect(frame).toBeVisible();
  await expect(frame.contentFrame().locator('[data-workspace-embedded="true"]')).toBeVisible();
  await expect(frame.contentFrame().locator("[data-workspace-toolbar], [data-app-chrome]")).toHaveCount(0);
  await page.getByRole("button", { name: "Nebeneinander anzeigen", exact: true }).click();
  const divider = page.getByRole("separator", { name: "Ansichten aufteilen" });
  await expect(divider).toBeVisible();
  await divider.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "55");
  await divider.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  const frameElement = await frame.elementHandle();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(divider).toHaveCount(0);
  await expect(frame).toBeVisible();
  await expect(page.getByRole("button", { name: "Nebeneinander anzeigen", exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 1600, height: 950 });
  await expect(divider).toBeVisible();
  expect(await frameElement!.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole("tab", { name: "Projekte", exact: true }).click();
  await page.getByRole("button", { name: "Eine Ansicht anzeigen", exact: true }).click();
  await expect(page.locator("#workspace-panel-primary")).toBeVisible();
  await expect(frame).toBeHidden();
  expect(await frameElement!.evaluate(element => element.isConnected)).toBe(true);
});
