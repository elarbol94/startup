import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("super-secret-1");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("Willkommen, E2E Admin!")).toBeVisible({ timeout: 30_000 });
}

async function quickNote(page: Page, title: string, body: string) {
  await page.goto("/wiki/inbox");
  await page.getByRole("button", { name: "Schnelle Notiz" }).last().click();
  await expect(page).toHaveURL(/\/wiki\/pages\/unbenannte-notiz/, { timeout: 30_000 });
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.keyboard.type(body);
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: title })).toBeVisible();
}

async function openEditorMore(page: Page) {
  await page.getByRole("button", { name: "Mehr", exact: true }).last().click();
}

async function openEditorCommand(page: Page, query: string) {
  await page.keyboard.press("Shift");
  await page.keyboard.press("Shift");
  await page.getByRole("dialog", { name: "Befehl suchen" }).getByRole("combobox").fill(query);
}

async function openWritingStyle(page: Page) {
  await openEditorMore(page);
  await page.getByRole("menuitem", { name: /Schreibbild/ }).click();
}

test("capture an inbox note and retain autosaved content", async ({ page }) => {
  await login(page);
  await quickNote(page, "Onboarding", "Willkommen im Team! Erste Schritte für neue Kollegen.");
  await expect(page.getByText("Willkommen im Team! Erste Schritte für neue Kollegen.")).toBeVisible();
});

test("knowledge launchpad prioritizes search, writing, and sources", async ({ page }) => {
  await login(page);
  await page.goto("/wiki");

  await expect(page.getByRole("heading", { name: "Was möchtest du heute wissen?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dokument schreiben" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quelle hinzufügen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weiterarbeiten" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zuletzt gelesen" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alle Dokumente" })).toHaveAttribute("href", "/wiki/pages");
  await expect(page.getByRole("link", { name: "Alle Quellen" })).toHaveAttribute("href", "/wiki/sources");

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

test("global writing style previews, cancels, persists across pages, and reaches HTML export", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await quickNote(page, `Typography settings ${Date.now()}`, "A compact list preview.");

  await openWritingStyle(page);
  const dialog = page.getByTestId("wiki-typography-dialog");
  const preview = page.getByTestId("wiki-typography-preview");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Standard" }).click();
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator(".ProseMirror")).toHaveCSS("line-height", "21px");
  await openWritingStyle(page);
  await expect(preview).toContainText("Entscheidungen nachvollziehbar dokumentieren");
  await expect(page.getByTestId("listItemSpacingEm-number")).toHaveValue("0.15");

  await page.getByTestId("wiki-typography-template-name").fill("E2E Schreibbild");
  await dialog.getByRole("button", { name: "Vorlage speichern" }).click();
  const savedTemplate = dialog.getByRole("button", { name: "E2E Schreibbild", exact: true });
  await expect(savedTemplate).toBeVisible();
  await dialog.getByRole("button", { name: "Kompakt" }).click();
  await expect(page.getByTestId("listItemSpacingEm-number")).toHaveValue("0");
  await savedTemplate.click();
  await expect(page.getByTestId("listItemSpacingEm-number")).toHaveValue("0.15");

  await page.getByTestId("listItemSpacingEm-number").fill("0.8");
  await expect(page.getByTestId("listItemSpacingEm-slider")).toHaveValue("0.8");
  await expect(dialog.getByRole("button", { name: "Benutzerdefiniert" })).toHaveAttribute("aria-pressed", "true");
  await expect(preview).toHaveCSS("--wiki-list-item-spacing", "0.8em");
  await dialog.getByRole("button", { name: "Abbrechen" }).click();

  await openWritingStyle(page);
  await expect(page.getByTestId("listItemSpacingEm-number")).toHaveValue("0.15");
  await dialog.getByRole("button", { name: "Kompakt" }).click();
  await expect(page.getByTestId("lineHeight-number")).toHaveValue("1.35");
  await expect(page.getByTestId("listItemSpacingEm-number")).toHaveValue("0");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".wiki-editor-surface")).toHaveCSS("--wiki-list-item-spacing", "0em");
  await expect(page.locator(".ProseMirror")).toHaveCSS("line-height", "18.9px");

  await page.reload();
  await expect(page.locator(".wiki-editor-surface")).toHaveCSS("--wiki-line-height", "1.35");
  await page.getByRole("button", { name: "Seite exportieren" }).click();
  const htmlHref = await page.locator('a[href*="format=html"]').getAttribute("href");
  expect(htmlHref).toBeTruthy();
  const htmlResponse = await page.request.get(htmlHref!);
  expect(htmlResponse.status()).toBe(200);
  const html = await htmlResponse.text();
  expect(html).toContain("--line-height: 1.35");
  expect(html).toContain("--list-item-spacing: 0em");

  await page.goto("/wiki/inbox");
  await page.getByRole("button", { name: "Schnelle Notiz" }).last().click();
  await expect(page).toHaveURL(/\/wiki\/pages\/unbenannte-notiz/, { timeout: 30_000 });
  await expect(page.locator(".wiki-editor-surface")).toHaveCSS("--wiki-list-item-spacing", "0em", { timeout: 30_000 });

  await openWritingStyle(page);
  await dialog.getByRole("button", { name: "Standard" }).click();
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator(".wiki-editor-surface")).toHaveCSS("--wiki-list-item-spacing", "0.15em");

  await page.setViewportSize({ width: 390, height: 844 });
  await openWritingStyle(page);
  const dialogBox = await dialog.boundingBox();
  const previewBox = await preview.boundingBox();
  const firstSectionBox = await dialog.locator("section").first().boundingBox();
  const footerBox = await dialog.locator('[data-slot="dialog-footer"]').boundingBox();
  expect(dialogBox?.width).toBeLessThanOrEqual(390);
  expect(previewBox!.y).toBeGreaterThan(firstSectionBox!.y);
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(844);
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
});

test("document mode persists page layout, document blocks, templates, and PDF export", async ({ page }) => {
  await login(page);
  await quickNote(page, "Funding application", "A structured project description.");

  await page.getByRole("button", { name: "Werkzeuge", exact: true }).click();
  await page.getByTestId("document-mode-toggle").click();
  const panel = page.getByTestId("document-layout-panel");
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Werkzeuge", exact: true }).click();
  await page.getByRole("menuitem", { name: "Dokumentlayout", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("wiki-editor")).toHaveAttribute("data-document-mode", "true");

  await panel.getByLabel("Ausrichtung").click();
  await page.getByRole("option", { name: "Querformat" }).click();
  await panel.getByRole("tab", { name: "Inhalt" }).click();
  await panel.getByRole("button", { name: "Seitenumbruch" }).click();
  await expect(page.locator(".wiki-document-page-break")).toHaveCount(1);

  await panel.getByPlaceholder("applicant").fill("Example Applicant");
  await panel.getByRole("button", { name: "Feld applicant einfügen" }).click();
  await expect(page.locator("[data-document-variable='applicant']")).toHaveCount(1);

  await panel.getByLabel("Name der neuen Vorlage").fill("E2E application profile");
  await panel.getByRole("button", { name: "Als Vorlage speichern" }).click();
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByTestId("document-layout-panel")).toBeVisible();
  await expect(page.locator(".wiki-document-page-break")).toHaveCount(1);
  await expect(page.locator("[data-document-variable='applicant']")).toContainText("applicant");

  await page.getByTestId("document-layout-panel").getByRole("tab", { name: "Prüfung" }).click();
  const href = await page.getByTestId("document-layout-panel").locator('a[href*="format=pdf"]').getAttribute("href");
  expect(href).toBeTruthy();
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect((await response.body()).length).toBeGreaterThan(1_000);
});

test("editor productivity tools support links, rich-text paste, search, outline, and writing statistics", async ({ page, context }) => {
  await login(page);
  await quickNote(page, "Editor tools", "Alpha beta alpha");
  const editor = page.locator(".ProseMirror");

  await expect(page.getByRole("button", { name: "Fett" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("editor-writing-status")).toContainText("Wörter");

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    const target = document.querySelector(".ProseMirror");
    const data = new DataTransfer();
    data.setData("text/html", "<h2>Imported heading</h2><ul><li>First</li><li>Second</li></ul>");
    target?.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(editor.getByRole("heading", { level: 2, name: "Imported heading" })).toBeVisible();
  await expect(editor.locator("ul li")).toHaveCount(2);

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    const target = document.querySelector(".ProseMirror");
    const data = new DataTransfer();
    data.setData("text/plain", "Plain external text");
    data.setData("text/html", "<h1><strong>Plain external text</strong></h1>");
    target?.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(editor.getByText("Plain external text", { exact: true })).toBeVisible();
  await expect(editor.getByRole("heading", { name: "Plain external text" })).toHaveCount(0);
  await expect(editor.locator("strong").filter({ hasText: "Plain external text" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+f");
  const search = page.getByTestId("editor-search-panel");
  await expect(search).toBeVisible();
  await search.getByPlaceholder("In dieser Notiz suchen…").fill("alpha");
  await expect(search).toContainText("1 von 2");
  await search.getByPlaceholder("Ersetzen durch…").fill("Gamma");
  await search.getByRole("button", { name: "Alle ersetzen" }).click();
  await expect(editor).toContainText("Gamma beta Gamma");
  await page.getByRole("button", { name: "Suchen und ersetzen" }).click();
  await expect(search).toBeHidden();

  await page.getByRole("button", { name: "Dokumentgliederung" }).click();
  const outline = page.getByTestId("editor-outline");
  await expect(outline.getByRole("button", { name: "Imported heading" })).toBeVisible();
  await outline.getByRole("button", { name: "Imported heading" }).click();

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Link text");
  await page.keyboard.press("Shift+ControlOrMeta+ArrowLeft");
  await page.keyboard.press("Shift+ControlOrMeta+ArrowLeft");
  await page.getByRole("button", { name: "Link bearbeiten" }).click();
  await page.getByLabel("Webadresse").fill("example.com");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(editor.locator('a[href="https://example.com"]')).toContainText("Link text");

  await context.setOffline(true);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" offline");
  await expect(page.getByText("Offline · lokal gesichert")).toBeVisible({ timeout: 10_000 });
  await context.setOffline(false);
});

test("Markdown syntax stays literal when typed and pasted", async ({ page }) => {
  await login(page);
  await quickNote(page, "Literal syntax", "Start");
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# Heading **bold** ");
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "## Pasted heading **text**");
    document.querySelector(".ProseMirror")?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(editor).toContainText("# Heading **bold**");
  await expect(editor).toContainText("## Pasted heading **text**");
  await expect(editor.locator("h1, h2, strong")).toHaveCount(0);
  await openEditorMore(page);
  await expect(page.getByTestId("markdown-help-button")).toHaveCount(0);
});

test("internal links create backlinks and unified search finds content", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await quickNote(page, "IT-Setup", "Laptop einrichten. Siehe auch: ");
  await page.locator(".ProseMirror").click();
  await page.getByRole("button", { name: "Dokument verlinken" }).click();
  await page.getByRole("button", { name: "Onboarding" }).first().click();
  await expect(page.getByText("Nicht gespeichert", { exact: true })).toBeVisible();
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 10_000 });
  const onboardingHref = await page.locator(".ProseMirror").getByRole("link", { name: "Onboarding" }).getAttribute("href");
  expect(onboardingHref).toBeTruthy();
  await page.goto(onboardingHref!);
  await expect(
    page.getByRole("heading", {
      name: "Dokumente mit Verweisen hierher",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "IT-Setup" }).last()).toBeVisible();
  const researchSearch = page.getByRole("textbox", {
    name: "Dokumente und Quellen durchsuchen…",
  });
  await researchSearch.click();
  await researchSearch.fill("Laptop");
  await expect(page.getByRole("link", { name: /IT-Setup/ }).first()).toBeVisible();
});

test("create a source, cite it, and render the bibliography", async ({ page }) => {
  test.setTimeout(120_000);
  const sourceTitle = `Knowledge Systems ${Date.now()}`;
  await login(page);
  await page.goto("/wiki/sources");
  await page.getByRole("button", { name: "Neue Quelle" }).click();
  await page.getByLabel("Titel", { exact: true }).fill(sourceTitle);
  await page.getByLabel("Mitwirkende").fill("Smith, Jane");
  await page.getByLabel("Erscheinungsdatum").fill("2026");
  await page.getByRole("button", { name: "Quelle anlegen" }).click();
  await expect(page).toHaveURL(/\/wiki\/sources\//, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: sourceTitle })).toBeVisible();
  await page.goto("/wiki/pages");
  await page.getByRole("link", { name: "Onboarding" }).first().click();
  await page.locator(".ProseMirror").click();
  await page.getByRole("button", { name: "Zitat einfügen" }).click();
  await page.getByRole("button", { name: sourceTitle }).click();
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Literaturverzeichnis" })).toBeVisible();
  await expect(page.getByText(/Smith, J\. \(2026\)/)).toBeVisible();
  await expect(
    page.locator("ol").getByText(sourceTitle, { exact: false }),
  ).toBeVisible();
});

test("subpages remain nested and deletion is recoverable", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/wiki/pages");
  await page.getByRole("link", { name: "Onboarding" }).last().click();
  page.once("dialog", (dialog) => dialog.accept("Erster Arbeitstag"));
  await page.getByRole("button", { name: "Unterseite anlegen" }).click();
  await expect(page).toHaveURL(/\/wiki\/pages\/erster-arbeitstag/, { timeout: 30_000 });
  page.once("dialog", (dialog) => dialog.accept("Tag Eins"));
  await page.getByRole("button", { name: "Erster Arbeitstag" }).click();
  await expect(page.getByRole("button", { name: "Tag Eins" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Seite löschen" }).click();
  await expect(page).toHaveURL(/\/wiki\/inbox/, { timeout: 30_000 });
  await page.goto("/wiki/trash");
  await expect(page.getByText("Tag Eins")).toBeVisible();
  await page.getByRole("button", { name: "Wiederherstellen" }).click();
  await expect(page.getByText("Tag Eins")).toHaveCount(0);
});

test("command search filters commands and applies a block command from the keyboard", async ({ page }) => {
  await login(page);
  await quickNote(page, "Slash Palette", "Start");
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await openEditorCommand(page, "uberschrift 2");
  await expect(page.getByRole("dialog", { name: "Befehl suchen" })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("A useful heading");
  await expect(editor.getByRole("heading", { level: 2, name: "A useful heading" })).toBeVisible();
  await expect(editor).not.toContainText("/uberschrift 2");

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await openEditorCommand(page, "trennlinie");
  await page.getByRole("option", { name: /Trennlinie/ }).click();
  await expect(editor.locator("hr")).toHaveCount(1);
});

test("command search actions open the existing attachment, source, and comment controls", async ({ page }) => {
  await login(page);
  await quickNote(page, "Slash Actions", "Action start");
  const editor = page.locator(".ProseMirror");

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await openEditorCommand(page, "attachment");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "slash-note.txt", mimeType: "text/plain", buffer: Buffer.from("slash upload") });
  await expect(page.getByText("slash-note.txt")).toBeVisible();

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await openEditorCommand(page, "pageComment");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("page-comment-input")).toBeFocused();

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await openEditorCommand(page, "supportingSource");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("supporting-source-picker")).toBeFocused();
});

test("command search insert commands open the shared page, citation, and PDF evidence pickers", async ({ page }) => {
  await login(page);
  await quickNote(page, "Slash Pickers", "Picker start");
  const editor = page.locator(".ProseMirror");
  const openCommand = async (query: string) => {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await openEditorCommand(page, query);
    await page.keyboard.press("Enter");
  };

  await openCommand("pageLink");
  await expect(page.getByPlaceholder("Dokumente filtern…")).toBeVisible();
  await page.keyboard.press("Escape");

  await openCommand("citation");
  await expect(page.getByPlaceholder("Quelle suchen…")).toBeVisible();
  await page.keyboard.press("Escape");

  await openCommand("pdfEvidence");
  await expect(page.getByPlaceholder("PDF-Markierungen durchsuchen…")).toBeVisible();
});

test("workspace groups notes and applies local filters", async ({ page }) => {
  await login(page);
  await quickNote(page, "Arbeitsansicht", "Diese Notiz wird in der Übersicht sortiert.");
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
  await page.getByPlaceholder("Notizen durchsuchen…").fill("sortiert");
  await expect(working).toContainText("Arbeitsansicht");
});

test("proofing language persists and spelling and writing issues use distinct styles", async ({ page }) => {
  test.setTimeout(120_000);
  const requestedLanguages: string[] = [];
  await page.route("**/api/wiki/spellcheck", async (route) => {
    const payload = route.request().postDataJSON() as { paragraphs: string[]; language: string; dictionary?: string[] };
    requestedLanguages.push(payload.language);
    const paragraph = payload.paragraphs.findIndex((text) => /Feler|grammar|Zweii/.test(text));
    const text = paragraph < 0 ? "" : payload.paragraphs[paragraph];
    const matches = paragraph < 0 ? [] : [
      ...(text.includes("Feler") && !payload.dictionary?.includes("Feler") ? [{ paragraph, offset: text.indexOf("Feler"), length: 5, message: "Spelling", kind: "spelling", category: "Typos", ruleId: "SPELL", replacements: ["Fehler"] }] : []),
      ...(text.includes("grammar") ? [{ paragraph, offset: text.indexOf("grammar"), length: 7, message: "Grammar", kind: "writing", category: "Grammar", ruleId: "GRAMMAR", replacements: ["grammar correction"] }] : []),
      ...(text.includes("Zweii") && !payload.dictionary?.includes("Zweii") ? [{ paragraph, offset: text.indexOf("Zweii"), length: 5, message: "Second spelling", kind: "spelling", category: "Typos", ruleId: "SPELL_2", replacements: ["Zwei"] }] : []),
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ matches }),
    });
  });

  const signup = await page.request.post("/api/auth/sign-up/email", { data: { name: "E2E Admin", username: "admin", displayUsername: "admin", email: "admin" + String.fromCharCode(64) + "example.com", password: "super-secret-1" } });
  if (signup.ok()) {
    await page.goto("/");
    await expect(page.getByText("Willkommen, E2E Admin!")).toBeVisible({ timeout: 30_000 });
  } else {
    await login(page);
  }
  await quickNote(page, "Proofing language", "Feler grammar Zweii");
  await expect(page.locator(".ProseMirror")).toHaveAttribute("lang", "de-AT");
  await expect(page.locator(".ProseMirror")).toHaveAttribute("spellcheck", "false");
  await expect(page.locator(".wiki-spellcheck-issue--spelling")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator(".wiki-spellcheck-issue--writing")).toHaveCount(1);
  const requestsBeforeAcceptance = requestedLanguages.length;
  await page.locator(".wiki-spellcheck-issue--spelling").first().click();
  await page.getByRole("button", { name: "Fehler", exact: true }).click();
  await page.waitForTimeout(700);
  expect(requestedLanguages).toHaveLength(requestsBeforeAcceptance + 1);
  await expect(page.locator(".wiki-spellcheck-issue--spelling")).toHaveCount(1);
  await expect(page.locator(".wiki-spellcheck-issue--writing")).toHaveCount(1);
  await page.locator(".wiki-spellcheck-issue--spelling").click();
  await page.getByRole("button", { name: "Zum gemeinsamen Wörterbuch hinzufügen" }).click();
  await expect(page.locator(".wiki-spellcheck-issue--spelling")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator(".wiki-spellcheck-issue--writing")).toHaveCount(1);

  await page.getByTestId("proofing-language-toggle").click();
  await page.getByRole("combobox", { name: "Prüfsprache" }).click();
  await page.getByRole("option", { name: "Englisch", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Prüfsprache" })).toBeEnabled();
  await expect.poll(() => requestedLanguages.includes("en-US")).toBe(true);
  await page.reload();
  await expect(page.locator(".ProseMirror")).toHaveAttribute("lang", "en-US");
});
