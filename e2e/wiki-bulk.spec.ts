import { expect, test, type Page } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";
import { submitNewDocumentTitle } from "./helpers/new-document";

test.describe.configure({ mode: "serial", timeout: 240_000 });
test.use({ viewport: { width: 1440, height: 1000 } });

const suffix = Date.now().toString(36);
const names = { a: `Bulk Alpha ${suffix}`, b: `Bulk Beta ${suffix}`, c: `Bulk Gamma ${suffix}` };

async function createDocument(page: Page, title: string) {
  await page.goto("/wiki/pages");
  await page.locator("main [aria-haspopup=menu]").filter({ hasText: "Neues Dokument" }).click();
  await page.getByRole("menuitem", { name: "Leeres Dokument" }).click();
  await submitNewDocumentTitle(page, title);
  await expect(page).toHaveURL(/\/wiki\/pages\/[^/]+$/);
}

const row = (page: Page, title: string) => page.getByTestId("page-tree-row").filter({ has: page.getByRole("link", { name: title, exact: true }) });
const select = (page: Page, title: string) => page.getByRole("checkbox", { name: `${title} auswählen`, exact: true }).click();
const bar = (page: Page) => page.getByRole("toolbar", { name: "Aktionen für die Auswahl" });
async function rowMenu(page: Page, title: string, item: string) {
  await page.getByRole("button", { name: `Weitere Aktionen für ${title}`, exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

test("documents can be selected and edited in bulk", async ({ page }) => {
  await loginAsAnyUser(page);
  for (const title of Object.values(names)) await createDocument(page, title);
  await page.goto("/wiki/pages");
  await page.getByRole("textbox", { name: "Dokumente durchsuchen…" }).fill(suffix);
  await expect(page.getByTestId("page-tree-row")).toHaveCount(3);

  // Status for two documents at once.
  await select(page, names.b);
  await select(page, names.c);
  await expect(bar(page)).toContainText("2 ausgewählt");
  await bar(page).getByRole("button", { name: "Status" }).click();
  await page.getByRole("menuitem", { name: "In Arbeit" }).click();
  await expect(row(page, names.b).getByTestId("page-status")).toHaveText("In Arbeit");
  await expect(row(page, names.c).getByTestId("page-status")).toHaveText("In Arbeit");
  await expect(row(page, names.a).getByTestId("page-status")).toHaveText("Eingang");
  await expect(bar(page)).toHaveCount(0);

  // Add a tag to two documents, then remove it from one via its row menu.
  await select(page, names.b);
  await select(page, names.c);
  await bar(page).getByRole("button", { name: "Tags" }).click();
  const tags = page.getByTestId("tag-edit-dialog");
  await tags.getByRole("textbox", { name: "Neuer Tag" }).fill(`bulk-${suffix}`);
  await tags.getByRole("button", { name: "Hinzufügen" }).click();
  await tags.getByRole("button", { name: "Übernehmen" }).click();
  await expect(row(page, names.b).getByRole("link", { name: `bulk-${suffix}` })).toBeVisible();
  await expect(row(page, names.c).getByRole("link", { name: `bulk-${suffix}` })).toBeVisible();
  await rowMenu(page, names.c, "Tags bearbeiten…");
  await tags.getByRole("checkbox").first().click();
  await tags.getByRole("button", { name: "Übernehmen" }).click();
  await expect(row(page, names.c).getByRole("link", { name: `bulk-${suffix}` })).toHaveCount(0);
  await expect(row(page, names.b).getByRole("link", { name: `bulk-${suffix}` })).toBeVisible();

  // Rename from the row menu.
  await rowMenu(page, names.c, "Umbenennen");
  const renamed = `${names.c} renamed`;
  await page.getByRole("textbox", { name: "Titel" }).fill(renamed);
  await page.getByRole("button", { name: "Umbenennen", exact: true }).click();
  await expect(row(page, renamed)).toBeVisible();
  names.c = renamed;
});

test("documents move under a parent and never into their own subtree", async ({ page }) => {
  await loginAsAnyUser(page);
  await page.goto("/wiki/pages");
  await rowMenu(page, names.b, "Verschieben…");
  const move = page.getByTestId("move-pages-dialog");
  await move.getByRole("textbox", { name: "Dokumente suchen…" }).fill(names.a);
  await move.getByRole("option", { name: new RegExp(names.a) }).click();
  await move.getByRole("button", { name: "Hierher verschieben" }).click();
  await expect(move).toHaveCount(0);
  await expect(row(page, names.b)).toHaveAttribute("data-depth", "1");

  await rowMenu(page, names.a, "Verschieben…");
  await move.getByRole("textbox", { name: "Dokumente suchen…" }).fill(suffix);
  await expect(move.getByRole("option", { name: new RegExp(names.b) })).toHaveCount(0);
  await expect(move.getByRole("option", { name: new RegExp(names.c) })).toBeVisible();
  await move.getByRole("button", { name: "Abbrechen" }).click();

  // While rows are selected, dragging is off; Escape in a dialog keeps the selection.
  await expect(row(page, names.a).getByTestId("page-drag-handle")).toHaveCount(1);
  await select(page, names.a);
  await expect(page.getByTestId("page-drag-handle")).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Verschieben…" }).click();
  await page.keyboard.press("Escape");
  await expect(move).toHaveCount(0);
  await expect(bar(page)).toContainText("1 ausgewählt");
  await page.keyboard.press("Escape");
  await expect(bar(page)).toHaveCount(0);
});

test("trashing a collapsed parent takes its subpages, and the trash restores and purges in bulk", async ({ page }) => {
  await loginAsAnyUser(page);
  await page.goto("/wiki/pages");
  await page.getByRole("button", { name: `${names.a} zuklappen` }).click();
  await expect(row(page, names.b)).toHaveCount(0);
  await select(page, names.a);
  await select(page, names.c);
  await bar(page).getByRole("button", { name: "In den Papierkorb" }).click();
  const confirm = page.getByTestId("confirm-dialog");
  await expect(confirm).toContainText("2 Dokumente werden in den Papierkorb verschoben.");
  await expect(confirm).toContainText("1 Unterseite kommt mit.");
  await confirm.getByRole("button", { name: "In den Papierkorb" }).click();
  await expect(row(page, names.a)).toHaveCount(0);
  await expect(row(page, names.c)).toHaveCount(0);

  await page.goto("/wiki/trash");
  const trashRow = (title: string) => page.getByTestId("trash-row").filter({ hasText: title });
  await expect(trashRow(names.b)).toBeVisible();
  await select(page, names.a);
  await select(page, names.b);
  await bar(page).getByRole("button", { name: "Wiederherstellen" }).click();
  await expect(trashRow(names.a)).toHaveCount(0);
  await expect(trashRow(names.b)).toHaveCount(0);
  await page.goto("/wiki/pages");
  await expect(row(page, names.a)).toBeVisible();

  await page.goto("/wiki/trash");
  await select(page, names.c);
  await bar(page).getByRole("button", { name: "Endgültig löschen" }).click();
  await confirm.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(trashRow(names.c)).toHaveCount(0);
});

test("inbox status changes keep tags and the inbox offers the same bulk actions", async ({ page }) => {
  await loginAsAnyUser(page);
  await page.goto("/wiki/inbox");
  const note = page.getByTestId("workspace-note").filter({ hasText: names.b });
  await expect(note.getByRole("link", { name: `bulk-${suffix}` })).toBeVisible();
  await note.getByTestId("workspace-note-status").click();
  await page.getByRole("option", { name: "Eingang" }).click();
  await expect(page.getByTestId("workspace-group-inbox").getByTestId("workspace-note").filter({ hasText: names.b })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("workspace-note").filter({ hasText: names.b }).getByRole("link", { name: `bulk-${suffix}` })).toBeVisible();

  await select(page, names.a);
  await select(page, names.b);
  await bar(page).getByRole("button", { name: "Status" }).click();
  await page.getByRole("menuitem", { name: "In Arbeit" }).click();
  const working = page.getByTestId("workspace-group-working");
  await expect(working.getByTestId("workspace-note").filter({ hasText: names.a })).toBeVisible();
  await expect(working.getByTestId("workspace-note").filter({ hasText: names.b })).toBeVisible();
});
