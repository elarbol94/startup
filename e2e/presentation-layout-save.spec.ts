import { expect, test, type Frame, type Page } from "@playwright/test";
import { placeAtCenter, seedPresentation } from "./helpers/presentation-fixture";

test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });
test.setTimeout(180_000);

/** The editor fills its workspace panel exactly: nothing scrolls, before or after interacting. */
async function expectFits(target: Page | Frame) {
  const metrics = await target.locator("#workspace-panel-primary").evaluate(panel => ({
    scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, scrollTop: panel.scrollTop,
    documentOverflow: document.documentElement.scrollHeight - window.innerHeight, pageScroll: window.scrollY,
  }));
  expect(metrics.scrollHeight).toBe(metrics.clientHeight);
  expect(metrics.scrollTop).toBe(0);
  expect(metrics.documentOverflow).toBeLessThanOrEqual(0);
  expect(metrics.pageScroll).toBe(0);
}

async function expectZoomControlsVisible(page: Page) {
  const controls = page.locator(".react-flow__controls");
  await expect(controls).toBeVisible();
  const box = (await controls.boundingBox())!;
  const panel = (await page.locator("#workspace-panel-primary").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(panel.y);
  expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

const closePanel = (page: Page) => page.getByRole("button", { name: "Seitenbereich schließen" }).click();

for (const viewport of [{ width: 1920, height: 855 }, { width: 900, height: 575 }]) {
  test(`the editor fits its panel at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedPresentation(page);
    // The collaboration status stays for assistive tech only.
    const collaborationStatus = page.getByTestId("collaboration-status");
    await expect(collaborationStatus).toHaveAttribute("role", "status");
    await expect(collaborationStatus).toHaveClass(/sr-only/);
    await expectFits(page);
    await expectZoomControlsVisible(page);

    await page.locator('.react-flow__node[data-id="a"]').click();
    await page.getByRole("button", { name: "Werkzeuge", exact: true }).click();
    await page.getByRole("menuitem", { name: "Eigenschaften", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Text", exact: true })).toBeVisible();
    await expectFits(page);
    await closePanel(page);
    await expectFits(page);

    const pane = page.locator(".react-flow__pane");
    const paneBox = (await pane.boundingBox())!;
    await page.mouse.click(paneBox.x + paneBox.width - 40, paneBox.y + 40);
    await expectFits(page);

    await page.getByRole("button", { name: "Text", exact: true }).click();
    await expect(page.getByTestId("presentation-placement-preview")).toBeAttached();
    await expectFits(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("presentation-placement-preview")).toHaveCount(0);

    await page.getByRole("button", { name: "Weg", exact: true }).click();
    await expectFits(page);
    await closePanel(page);
    await expectFits(page);

    await expectZoomControlsVisible(page);
  });
}

test("the editor fits an embedded workspace tab", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const id = await seedPresentation(page);
  await page.goto("/wiki/presentations");
  await page.evaluate(src => {
    const frame = document.createElement("iframe");
    frame.setAttribute("data-workspace-pane", "true");
    frame.name = "embedded-editor";
    frame.src = src;
    frame.style.cssText = "position:fixed;inset:0;width:900px;height:560px;border:0;z-index:9999;background:white";
    document.body.append(frame);
  }, `/wiki/presentations/${id}`);
  await expect.poll(() => page.frame("embedded-editor")?.url() ?? "").toContain(id);
  const frame = page.frame("embedded-editor")!;
  await expect(frame.locator("[data-workspace-embedded]")).toBeAttached();
  await expect(frame.getByRole("button", { name: "Text", exact: true })).toBeEnabled();
  await expectFits(frame);
  await frame.getByRole("button", { name: "Text", exact: true }).click();
  await expectFits(frame);
});

test("the header save state follows the collaboration transport and beforeunload warns only for unsynced edits", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPresentation(page);
  const header = page.locator("header").getByRole("status");
  const collaborationStatus = page.getByTestId("collaboration-status");
  const beforeUnloadPrevented = () => page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

  await page.locator('.react-flow__node[data-id="a"]').click();
  await page.getByRole("button", { name: "Werkzeuge", exact: true }).click();
  await page.getByRole("menuitem", { name: "Eigenschaften", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill(`Saved edit ${Date.now()}`);
  await expect(header).toHaveText("Gespeichert", { timeout: 2_000 });
  await expect(collaborationStatus.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 2_000 });
  expect(await beforeUnloadPrevented()).toBe(false);

  // Offline edits are held locally, shown as such, and leaving warns.
  await context.setOffline(true);
  await text.fill(`Offline edit ${Date.now()}`);
  await expect(header).toHaveText(/Offline – Änderungen werden lokal gehalten|Nicht gespeichert/);
  expect(await beforeUnloadPrevented()).toBe(true);

  await context.setOffline(false);
  await expect(header).toHaveText("Gespeichert", { timeout: 15_000 });
  expect(await beforeUnloadPrevented()).toBe(false);

  // Navigating away after a synced edit asks nothing.
  let dialogs = 0;
  page.on("dialog", dialog => { dialogs++; void dialog.dismiss(); });
  await text.fill(`Last edit ${Date.now()}`);
  await expect(header).toHaveText("Gespeichert", { timeout: 2_000 });
  await page.goto("/wiki/presentations");
  await expect(page).toHaveURL(/\/wiki\/presentations$/);
  expect(dialogs).toBe(0);
});

test("a preserved editor does not keep the canvas layout on other wiki pages", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedPresentation(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await placeAtCenter(page);
  await expectFits(page);
  await page.locator("header").getByRole("link", { name: "Präsentationen", exact: true }).click();
  await expect(page).toHaveURL(/\/wiki\/presentations$/);
  await expect(page.locator("#workspace-panel-primary")).not.toHaveCSS("padding-top", "0px");
});
