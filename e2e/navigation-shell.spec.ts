import { expect, test, type Locator, type Page } from "@playwright/test";
import { submitNewDocumentTitle } from "./helpers/new-document";

async function login(page: Page) {
  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: {
      name: "E2E Admin",
      username: "admin",
      displayUsername: "admin",
      email: "admin" + String.fromCharCode(64) + "example.com",
      password: "super-secret-1",
    },
  });
  if (!signup.ok() && signup.status() !== 422 && signup.status() !== 403) {
    throw new Error(`Signup failed ${signup.status()}: ${await signup.text()}`);
  }
  if (signup.ok()) {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Willkommen, E2E Admin!" })).toBeVisible();
    return;
  }
  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("super-secret-1");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Willkommen, E2E Admin!" })).toBeVisible();
}

async function expectWidth(locator: Locator, width: number) {
  await expect.poll(async () => Math.round((await locator.boundingBox())?.width ?? 0)).toBe(width);
}

test("desktop sidebar collapses to a remembered icon rail and survives focus mode", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/wiki/inbox");

  await expect(page.getByTestId("app-sidebar")).toHaveCount(1);
  await expect(page.getByTestId("research-sidebar")).toHaveCount(1);
  const appSidebar = page.getByTestId("app-sidebar").filter({ visible: true });
  const researchSidebar = page
    .getByTestId("research-sidebar")
    .filter({ visible: true });
  await expect(appSidebar).toBeVisible();
  await expect(researchSidebar).toBeVisible();
  // The app sidebar stays wide (no hover expansion) and shows the module groups.
  await expectWidth(appSidebar, 248);
  for (const group of ["Arbeit", "Finanzen", "Wissen"]) {
    await expect(appSidebar.getByRole("group", { name: group })).toBeVisible();
  }
  await expect(appSidebar.getByRole("group", { name: "Wissen" }).getByRole("button", { name: "Wiki" })).toHaveAttribute("aria-current", "page");
  // The research panel starts expanded; collapsing it to the icon rail is remembered.
  await expectWidth(researchSidebar, 208);
  await researchSidebar.getByRole("button", { name: "Navigation einklappen" }).click();
  await page.locator("[data-app-main]").hover();
  await expectWidth(researchSidebar, 56);

  await expect(appSidebar.getByRole("button", { name: "Wiki" })).toBeVisible();
  await expect(appSidebar.getByRole("button", { name: "Kalender" })).toBeVisible();
  await expect(researchSidebar.getByRole("link", { name: /Eingang/ })).toBeVisible();
  await expect(appSidebar.getByRole("button", { name: /E2E Admin/ })).toBeVisible();

  await appSidebar.getByRole("button", { name: "Hauptnavigation einklappen" }).click();
  await expectWidth(appSidebar, 64);
  await expect(appSidebar.getByRole("button", { name: "Kalender" })).toBeVisible();
  // Hovering no longer widens the rail; the research rail sits right beside it.
  await appSidebar.hover();
  await expectWidth(appSidebar, 64);
  await expect.poll(async () => Math.round((await researchSidebar.boundingBox())?.x ?? 0)).toBe(64);

  // The collapsed state survives a reload without painting the wide sidebar first.
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-app-rail"))).toBe("collapsed");
  await expectWidth(appSidebar, 64);

  await researchSidebar.hover();
  await expectWidth(researchSidebar, 208);
  // The compact rail shows a search icon; hovering reveals the input.
  const desktopResearchSearch = researchSidebar.getByRole("textbox", {
    name: "Dokumente und Quellen durchsuchen…",
  });
  await desktopResearchSearch.click();
  await expectWidth(researchSidebar, 208);
  await expect(desktopResearchSearch).toBeFocused();

  await researchSidebar.getByRole("link", { name: "Dokumente", exact: true }).click();
  await expect(page).toHaveURL(/\/wiki\/pages$/);
  await expect(page.getByTestId("research-sidebar")).toHaveCount(1);
  await expectWidth(researchSidebar, 208);

  await appSidebar.getByRole("button", { name: "Hauptnavigation ausklappen" }).click();
  await expectWidth(appSidebar, 248);
  await researchSidebar.hover();
  await expectWidth(researchSidebar, 208);
  await researchSidebar.getByRole("button", { name: "Neues Dokument", exact: true }).click();
  await submitNewDocumentTitle(page, "Focus mode note");
  await expect(page).toHaveURL(/\/wiki\/pages\/[^/]+$/);
  await page.getByRole("button", { name: "Fokusmodus", exact: true }).click();
  await expect(appSidebar).toHaveCount(0);
  await expect(researchSidebar).toHaveCount(0);

  await page.getByRole("button", { name: "Fokusmodus beenden" }).click();
  await expectWidth(appSidebar, 248);
  await expectWidth(researchSidebar, 56);
});

test("desktop navigation reorders within a group, also when a drag leaves the sidebar", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/personnel");

  const appSidebar = page.getByTestId("app-sidebar").filter({ visible: true });
  await expectWidth(appSidebar, 248);

  const navigation = appSidebar.locator("#app-primary-navigation");
  const projectsItem = navigation.locator('[data-navigation-key="projects"]');
  const calendarItem = navigation.locator('[data-navigation-key="calendar"]');
  const projectsBox = (await projectsItem.boundingBox())!;
  const calendarBox = (await calendarItem.boundingBox())!;
  const dragStart = {
    x: projectsBox.x + projectsBox.width / 2,
    y: projectsBox.y + projectsBox.height / 2,
  };

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 12, dragStart.y - 12, { steps: 4 });
  await expect(projectsItem).toHaveClass(/opacity-45/);
  await page.mouse.move(320, dragStart.y, { steps: 8 });
  await expectWidth(appSidebar, 248);
  await page.mouse.move(
    calendarBox.x + calendarBox.width / 2,
    calendarBox.y + calendarBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  await expect(page).toHaveURL(/\/personnel$/);
  const order = () => navigation.locator("[data-navigation-key]").evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-navigation-key")),
  );
  await expect.poll(async () => {
    const keys = await order();
    return keys.indexOf("projects") < keys.indexOf("calendar");
  }).toBe(true);

  // A module cannot leave its group: dropping "Wiki" onto "Kalender" keeps the groups intact.
  const wikiBox = (await navigation.locator('[data-navigation-key="wiki"]').boundingBox())!;
  const targetBox = (await calendarItem.boundingBox())!;
  await page.mouse.move(wikiBox.x + wikiBox.width / 2, wikiBox.y + wikiBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => {
    const keys = await order();
    return keys.indexOf("wiki") > keys.indexOf("personnel");
  }).toBe(true);
  await expect(page).toHaveURL(/\/personnel$/);
});

test("mobile navigation uses full-width content with dismissible app and research sheets", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wiki/inbox");

  await expect(page.getByTestId("app-sidebar")).toHaveCount(1);
  await expect(page.getByTestId("research-sidebar")).toHaveCount(1);
  await expect(page.getByTestId("app-mobile-header")).toBeVisible();
  await expect(page.getByTestId("research-mobile-header")).toBeVisible();
  await expect(
    page.getByTestId("app-sidebar").filter({ visible: true }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("research-sidebar").filter({ visible: true }),
  ).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Hauptnavigation öffnen" }).click();
  const appSheet = page.getByTestId("app-navigation-sheet");
  await expect(appSheet).toBeVisible();
  await expect(appSheet.getByRole("button", { name: "Projekte" })).toBeVisible();

  const navigation = appSheet.locator("#app-mobile-navigation");
  const projectsItem = navigation.locator('[data-navigation-key="projects"]');
  const calendarItem = navigation.locator('[data-navigation-key="calendar"]');
  const projectsBox = (await projectsItem.boundingBox())!;
  const calendarBox = (await calendarItem.boundingBox())!;
  const dragStart = {
    x: projectsBox.x + projectsBox.width / 2,
    y: projectsBox.y + projectsBox.height / 2,
  };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x, dragStart.y - 12, { steps: 4 });
  await expect(projectsItem).toHaveClass(/opacity-45/);
  await page.mouse.move(
    calendarBox.x + calendarBox.width / 2,
    calendarBox.y + calendarBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  await expect(page).toHaveURL(/\/wiki\/inbox$/);
  await expect(appSheet).toBeVisible();
  await expect.poll(async () => {
    const order = await navigation.locator("[data-navigation-key]").evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-navigation-key")),
    );
    return order.indexOf("projects") < order.indexOf("calendar");
  }).toBe(true);

  await page.keyboard.press("Escape");
  await expect(appSheet).not.toBeVisible();

  await page.keyboard.press("Control+k");
  const workspaceSearch = page.getByRole("dialog", {
    name: "Arbeitsbereich durchsuchen",
  });
  await expect(workspaceSearch).toBeVisible();
  await expect(
    workspaceSearch.getByPlaceholder(
      "Projekte, Aufgaben, Wiki und Quellen durchsuchen…",
    ),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(workspaceSearch).not.toBeVisible();

  await page.getByRole("button", { name: "Wissensnavigation öffnen" }).click();
  const researchSheet = page.getByTestId("research-navigation-sheet");
  await expect(researchSheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(researchSheet).not.toBeVisible();

  await page.getByRole("button", { name: "Wissensnavigation öffnen" }).click();
  await researchSheet.getByRole("link", { name: "Dokumente", exact: true }).click();
  await expect(page).toHaveURL(/\/wiki\/pages$/);
  await expect(researchSheet).not.toBeVisible();

  await page.getByRole("button", { name: "Hauptnavigation öffnen" }).click();
  await appSheet.getByRole("button", { name: "Projekte" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(appSheet).not.toBeVisible();
  await expect(page.getByTestId("research-mobile-header")).toBeHidden();
});
