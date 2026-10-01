import { expect, test, type Page, type Route } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

// Platform-wide focus mode (src/lib/focus-mode.ts): the shortcut, the focus bar, search, the
// user menu, workspace panes and the pre-hydration bootstrap. Self-contained.

const FOCUS = "Control+Shift+F";

function isScriptChunk(url: URL) {
  return url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js");
}

function visibleSidebar(page: Page) {
  return page.getByTestId("app-sidebar").filter({ visible: true });
}

/** Shortcuts are only heard once React runs; the sidebar then publishes its rail width. */
async function waitForHydration(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--app-rail-width")))
    .not.toBe("");
}

async function openPersonnel(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/personnel");
  await expect(visibleSidebar(page)).toBeVisible();
  await waitForHydration(page);
}

test.beforeEach(async ({ page }) => {
  await loginAsAnyUser(page);
});

test("the shortcut hides the chrome, keeps search reachable and survives a reload", async ({ page }) => {
  await openPersonnel(page);
  const pill = page.getByTestId("focus-pill");

  await page.keyboard.press(FOCUS);
  await expect(pill).toBeVisible();
  await expect(visibleSidebar(page)).toHaveCount(0);
  await expect(page.locator("[data-workspace-toolbar]")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-focus-global", "true");

  // Search still opens while the sidebar is hidden, and Escape only closes the dialog.
  await page.keyboard.press("Control+K");
  const search = page.getByRole("dialog");
  await expect(search).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
  await expect(pill).toBeVisible();

  await page.reload();
  await expect(pill).toBeVisible();
  await expect(visibleSidebar(page)).toHaveCount(0);

  await pill.getByRole("button", { name: "Fokus beenden", exact: true }).click();
  await expect(pill).toHaveCount(0);
  await expect(visibleSidebar(page)).toBeVisible();
  await expect(page.locator("[data-workspace-toolbar]")).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-focus-global", "true");

  await page.keyboard.press(FOCUS);
  await expect(pill).toBeVisible();
  await page.keyboard.press(FOCUS);
  await expect(pill).toHaveCount(0);
  await expect(visibleSidebar(page)).toBeVisible();
});

test("the chrome is already hidden before the app hydrates", async ({ page }) => {
  for (const focused of [true, false]) {
    await openPersonnel(page);
    if (focused) {
      await page.keyboard.press(FOCUS);
      await expect(page.getByTestId("focus-pill")).toBeVisible();
    }

    // Hold every JavaScript chunk so React cannot hydrate, then inspect the parsed HTML.
    // Stylesheets must load: inline scripts wait for them before the parser continues.
    const held: Route[] = [];
    await page.route(isScriptChunk, (route) => {
      held.push(route);
    });
    await page.goto("/personnel", { waitUntil: "commit" });
    await page.locator("[data-app-shell]").waitFor({ state: "attached" });
    const state = await page.evaluate(() => ({
      attribute: document.documentElement.getAttribute("data-focus-global"),
      chrome: getComputedStyle(document.querySelector("[data-app-chrome]")!).display,
      toolbar: getComputedStyle(document.querySelector("[data-workspace-toolbar]")!).display,
    }));
    if (focused) {
      expect(state).toEqual({ attribute: "true", chrome: "none", toolbar: "none" });
    } else {
      expect(state.attribute).toBeNull();
      expect(state.chrome).not.toBe("none");
      expect(state.toolbar).not.toBe("none");
    }

    await page.unroute(isScriptChunk);
    await Promise.all(held.map((route) => route.continue().catch(() => undefined)));
    if (focused) {
      await expect(page.getByTestId("focus-pill")).toBeVisible();
      await expect(visibleSidebar(page)).toHaveCount(0);
      await page.getByTestId("focus-pill").getByRole("button", { name: "Fokus beenden", exact: true }).click();
    }
    await expect(visibleSidebar(page)).toBeVisible();
  }
});

test("focus starts from the user menu and ends from search", async ({ page }) => {
  await openPersonnel(page);
  await visibleSidebar(page).getByRole("button", { name: /\(.+@.+\)/ }).click();
  await page.getByRole("menuitem", { name: /Fokusmodus starten/ }).click();
  const pill = page.getByTestId("focus-pill");
  await expect(pill).toBeVisible();
  await expect(visibleSidebar(page)).toHaveCount(0);

  await pill.getByRole("button", { name: "Suchen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByTestId("search-focus-action").click();
  await expect(pill).toHaveCount(0);
  await expect(visibleSidebar(page)).toBeVisible();
});

test("global focus also hides the wiki rail", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/wiki/inbox");
  const researchSidebar = page.getByTestId("research-sidebar").filter({ visible: true });
  await expect(researchSidebar).toBeVisible();
  await waitForHydration(page);

  await page.keyboard.press(FOCUS);
  await expect(page.getByTestId("focus-pill")).toBeVisible();
  await expect(researchSidebar).toHaveCount(0);
  await expect(visibleSidebar(page)).toHaveCount(0);

  await page.keyboard.press(FOCUS);
  await expect(researchSidebar).toBeVisible();
  await expect(visibleSidebar(page)).toBeVisible();
});

test("workspace panes forward the shortcut and tabs can be shown in focus", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto("/personnel");
  await expect(async () => {
    await page.getByRole("button", { name: "Neuer Tab", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }).toPass();
  await page.getByRole("dialog").getByRole("button", { name: "Kalender", exact: true }).click();
  const frame = page.locator("iframe[data-workspace-pane]");
  await expect(frame).toBeVisible();
  const pane = frame.contentFrame();
  await expect(pane.locator('[data-workspace-embedded="true"]')).toBeVisible();

  const pill = page.getByTestId("focus-pill");
  // The pane may still be hydrating; retry until its provider forwards the shortcut.
  await expect(async () => {
    await pane.locator("body").press(FOCUS);
    await expect(pill).toBeVisible({ timeout: 3_000 });
  }).toPass();
  await expect(page.locator("[data-workspace-toolbar]")).toBeHidden();
  // The pane itself never owns the global focus.
  await expect(pane.locator("html")).not.toHaveAttribute("data-focus-global", "true");
  await expect(frame).toBeVisible();

  await pill.getByRole("button", { name: "Tabs anzeigen" }).click();
  await expect(page.locator("[data-workspace-toolbar]")).toBeVisible();
  await pill.getByRole("button", { name: "Tabs ausblenden" }).click();
  await expect(page.locator("[data-workspace-toolbar]")).toBeHidden();

  await pane.locator("body").press(FOCUS);
  await expect(pill).toHaveCount(0);
  await expect(page.locator("[data-workspace-toolbar]")).toBeVisible();
});

test("on phones the header disappears and the focus bar stays reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/personnel");
  const header = page.getByTestId("app-mobile-header");
  await expect(header).toBeVisible();
  await waitForHydration(page);

  await page.keyboard.press(FOCUS);
  const pill = page.getByTestId("focus-pill");
  await expect(pill).toBeVisible();
  await expect(header).toBeHidden();
  await expect(pill.getByRole("button", { name: "Fokus beenden", exact: true })).toBeInViewport();

  await pill.getByRole("button", { name: "Fokus beenden", exact: true }).click();
  await expect(header).toBeVisible();
});
