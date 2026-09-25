import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";
import { submitNewDocumentTitle } from "./helpers/new-document";

// The dev server compiles each route on first visit, which can take minutes on a busy machine.
test.use({ viewport: { width: 1440, height: 1000 }, navigationTimeout: 240_000 });
test.describe.configure({ mode: "serial", timeout: 360_000 });

async function login(page: Page) {
  const credentials = { username: "admin", password: "super-secret-1" };
  // The admin normally exists already; sign up only when this spec runs alone. The
  // auth routes can 404 briefly while the dev server compiles them.
  const signup = { name: "E2E Admin", username: "admin", displayUsername: "admin", email: "admin" + String.fromCharCode(64) + "example.com", password: credentials.password };
  const headers = { origin: new URL(test.info().project.use.baseURL!).origin };
  let response = await page.request.post("/api/auth/sign-up/email", { data: signup, headers });
  for (let attempt = 0; response.status() === 404 && attempt < 5; attempt += 1) {
    await page.waitForTimeout(1_000);
    response = await page.request.post("/api/auth/sign-up/email", { data: signup, headers });
  }
  if (response.ok()) return;
  response = await page.request.post("/api/auth/sign-in/username", { data: credentials, headers });
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBe(true);
}

function pageCountByTitle(title: string) {
  const sqlite = new Database(path.resolve("data/e2e.db"), { readonly: true });
  try {
    return (sqlite.prepare("SELECT COUNT(*) AS count FROM wiki_pages WHERE title = ?").get(title) as { count: number }).count;
  } finally { sqlite.close(); }
}

function untitledPageCount() {
  const sqlite = new Database(path.resolve("data/e2e.db"), { readonly: true });
  try {
    return (sqlite.prepare("SELECT COUNT(*) AS count FROM wiki_pages WHERE title IN ('Unbenannte Notiz', 'Untitled note')").get() as { count: number }).count;
  } finally { sqlite.close(); }
}

test("a new document asks for its title first and creates nothing when cancelled", async ({ page }) => {
  await login(page);
  const untitledBefore = untitledPageCount();
  await page.goto("/wiki/inbox");
  await page.getByRole("button", { name: "Schnelle Notiz" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Neues Dokument" });
  await expect(dialog).toBeVisible();
  const titleField = dialog.getByLabel("Titel", { exact: true });
  await expect(titleField).toBeFocused();
  // Blank titles cannot be submitted.
  await titleField.fill("   ");
  await expect(dialog.getByRole("button", { name: "Erstellen", exact: true })).toBeDisabled();
  await titleField.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/wiki\/inbox$/);

  const title = `Titled first ${Date.now()}`;
  await page.getByRole("button", { name: "Schnelle Notiz" }).last().click();
  await submitNewDocumentTitle(page, title);
  await page.waitForURL(/\/wiki\/pages\/titled-first-\d+$/, { timeout: 240_000 });
  await expect(page.getByRole("button", { name: `Umbenennen: ${title}`, exact: true })).toBeVisible({ timeout: 120_000 });
  expect(pageCountByTitle(title)).toBe(1);
  expect(untitledPageCount()).toBe(untitledBefore);
});

test("the title renames inline with Enter, Escape cancels, and the old slug redirects", async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  const original = `Inline title ${stamp}`;
  await page.goto("/wiki/inbox");
  await page.getByRole("button", { name: "Schnelle Notiz" }).last().click();
  await submitNewDocumentTitle(page, original);
  await page.waitForURL(new RegExp(`/wiki/pages/inline-title-${stamp}$`));
  const oldPath = new URL(page.url()).pathname;

  // Escape restores the saved title and changes nothing.
  await page.getByRole("button", { name: `Umbenennen: ${original}`, exact: true }).click();
  const input = page.getByTestId("page-title-input");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(original);
  await input.fill("Discarded title");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Umbenennen: ${original}`, exact: true })).toBeFocused();
  expect(pageCountByTitle("Discarded title")).toBe(0);

  // Enter saves; the slug follows the title.
  const renamed = `Renamed inline ${stamp}`;
  await page.getByRole("button", { name: `Umbenennen: ${original}`, exact: true }).click();
  await input.fill(renamed);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: `Umbenennen: ${renamed}`, exact: true })).toBeVisible();
  await page.waitForURL(new RegExp(`/wiki/pages/renamed-inline-${stamp}$`));
  expect(pageCountByTitle(renamed)).toBe(1);

  // Old links keep working.
  await page.goto(`${oldPath}?section=intro`);
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/wiki/pages/renamed-inline-${stamp}`);
  expect(new URL(page.url()).searchParams.get("section")).toBe("intro");
  await expect(page.getByRole("button", { name: `Umbenennen: ${renamed}`, exact: true })).toBeVisible();

  // Blur saves too.
  const blurred = `Blurred title ${stamp}`;
  await page.getByRole("button", { name: `Umbenennen: ${renamed}`, exact: true }).click();
  await input.fill(blurred);
  await input.blur();
  await expect(page.getByRole("button", { name: `Umbenennen: ${blurred}`, exact: true })).toBeVisible();
  await expect.poll(() => pageCountByTitle(blurred)).toBe(1);
});

test("a new page cannot claim a slug that still redirects to a renamed page", async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  const first = `Slug owner ${stamp}`;
  await page.goto("/wiki/inbox");
  await page.getByRole("button", { name: "Schnelle Notiz" }).last().click();
  await submitNewDocumentTitle(page, first);
  await page.waitForURL(new RegExp(`/wiki/pages/slug-owner-${stamp}$`));
  await page.getByRole("button", { name: `Umbenennen: ${first}`, exact: true }).click();
  await page.getByTestId("page-title-input").fill(`Moved owner ${stamp}`);
  await page.getByTestId("page-title-input").press("Enter");
  await page.waitForURL(new RegExp(`/wiki/pages/moved-owner-${stamp}$`));

  await page.goto("/wiki/inbox");
  await page.getByRole("button", { name: "Schnelle Notiz" }).last().click();
  await submitNewDocumentTitle(page, first);
  await page.waitForURL(new RegExp(`/wiki/pages/slug-owner-${stamp}-2$`));
  await page.goto(`/wiki/pages/slug-owner-${stamp}`);
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/wiki/pages/moved-owner-${stamp}`);
});

test("saving a calendar view asks for its name in a dialog", async ({ page }) => {
  await login(page);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filter" });
  await filters.getByText("Gespeicherte Ansichten").click();
  await filters.getByRole("button", { name: "Aktuelle Ansicht speichern", exact: true }).click();
  const prompt = page.getByRole("dialog", { name: "Aktuelle Ansicht speichern" });
  const name = `Team week ${Date.now()}`;
  await prompt.getByLabel("Name der Ansicht", { exact: true }).fill(name);
  await prompt.getByLabel("Name der Ansicht", { exact: true }).press("Enter");
  await expect(page.getByText("Ansicht gespeichert")).toBeVisible();
  await expect(prompt).toHaveCount(0);
});
