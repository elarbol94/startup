import { test, expect, type Page } from "@playwright/test";
import { submitNewDocumentTitle } from "./helpers/new-document";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("super-secret-1");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Willkommen, E2E Admin!" })).toBeVisible({ timeout: 30_000 });
}

/** Creates a (Word) document through the inbox's quick-note button. */
async function quickNote(page: Page, title: string) {
  await page.goto("/wiki/inbox");
  await page.getByRole("button", { name: "Neues Dokument", exact: true }).last().click();
  await submitNewDocumentTitle(page, title);
  await expect(page.getByRole("button", { name: `Umbenennen: ${title}`, exact: true })).toBeVisible({ timeout: 30_000 });
}

test("knowledge launchpad prioritizes search, writing, and sources", async ({ page }) => {
  await login(page);
  await quickNote(page, "Onboarding");
  await page.goto("/wiki");

  const main = page.locator("main main");
  await expect(main.getByRole("heading", { name: "Dein Wiki", level: 1 })).toBeVisible();
  await expect(main.getByRole("button", { name: "Neues Dokument", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "Quelle hinzufügen" })).toBeVisible();
  await expect(main.getByRole("region", { name: "Wiki durchsuchen" })).toBeVisible();
  for (const section of ["Dokumente", "Quellen", "Präsentationen", "Zuletzt geöffnet"]) {
    await expect(main.getByRole("heading", { name: section, exact: true, level: 2 })).toBeVisible();
  }
  const viewAll = main.getByRole("link", { name: "Alle ansehen" });
  await expect(viewAll.nth(0)).toHaveAttribute("href", "/wiki/pages");
  await expect(viewAll.nth(1)).toHaveAttribute("href", "/wiki/sources");

  const search = page.getByRole("textbox", { name: "Dokumente und Quellen durchsuchen…" });
  await search.fill("Onboarding");
  await expect(page.getByRole("link", { name: /Onboarding/ }).first()).toBeVisible();

  const navigation = page.getByTestId("research-sidebar");
  await navigation.hover();
  await expect(navigation.getByRole("link", { name: "Start" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Dokumente" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Quellen" })).toBeVisible();
  await expect(navigation.getByText("Dokumentbaum")).toHaveCount(0);
  await expect(navigation.getByText("Schlagwörter")).toHaveCount(0);
});

test("workspace groups notes and applies local filters", async ({ page }) => {
  await login(page);
  await quickNote(page, "Arbeitsansicht");
  await page.goto("/wiki/inbox");

  const inbox = page.getByTestId("workspace-group-inbox");
  await expect(inbox).toContainText("Arbeitsansicht");
  const note = inbox.getByTestId("workspace-note").filter({ hasText: "Arbeitsansicht" });
  await note.getByTestId("workspace-note-status").click();
  await page.getByRole("option", { name: "In Arbeit" }).click();

  const working = page.getByTestId("workspace-group-working");
  await expect(working).toContainText("Arbeitsansicht");
  const workingNote = working.getByTestId("workspace-note").filter({ hasText: "Arbeitsansicht" });
  await workingNote.getByTestId("workspace-note-favorite").click();
  await page.getByRole("button", { name: "Nur Favoriten" }).click();
  await expect(working).toContainText("Arbeitsansicht");
  await page.getByPlaceholder("Notizen durchsuchen…").fill("Arbeitsan");
  await expect(working).toContainText("Arbeitsansicht");
});
