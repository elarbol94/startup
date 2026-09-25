import { expect, test } from "@playwright/test";

test("shared bug reports preserve failed uploads and appear in both task views", async ({ page }) => {
  test.setTimeout(180_000);
  const credentials = { username: "admin", password: "super-secret-1" };
  let response = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(response.ok()).toBe(true);
  await page.goto("/?secret=not-collected");
  await page.getByRole("button", { name: "Fehler melden", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Meldung senden" })).toBeDisabled();
  const title = `Bug report ${Date.now()}`;
  await dialog.getByLabel("Kurzer Titel").fill(title);
  await dialog.getByLabel("Was ist passiert?").fill("The save button did not respond.");
  // Cancel and keyboard adjustment preserve the report draft.
  await dialog.getByRole("button", { name: "Betroffenen Bereich auswählen" }).click();
  const selector = page.getByTestId("bug-area-selector");
  await expect(selector).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("bug-area-rectangle")).toBeVisible();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Escape");
  await expect(dialog.getByLabel("Kurzer Titel")).toHaveValue(title);
  // A fixed-color fixture verifies actual cropped pixels, not merely a preview URL.
  await page.evaluate(() => {
    const marker = document.createElement("div"); marker.id = "capture-fixture";
    marker.style.cssText = "position:fixed;left:100px;top:250px;width:200px;height:120px;background:rgb(255,0,0);z-index:80";
    document.body.append(marker);
  });
  await dialog.getByRole("button", { name: "Betroffenen Bereich auswählen" }).click();
  await expect(selector).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 150));
  await page.mouse.move(220, 330); await page.mouse.down();
  await page.mouse.move(120, 270, { steps: 5 }); await page.mouse.up();
  await selector.getByRole("button", { name: "Ausgewählten Bereich anhängen" }).click();
  const captured = dialog.getByRole("img", { name: /^bug-area-/ });
  await expect(captured).toBeVisible();
  const pixels = await captured.evaluate(async element => {
    const image = element as HTMLImageElement; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, center: Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data) };
  });
  expect(pixels).toEqual({ width: 100, height: 60, center: [255, 0, 0, 255] });
  await dialog.getByRole("button", { name: /^bug-area-.* entfernen$/ }).click();
  await page.evaluate(() => document.getElementById("capture-fixture")?.remove());
  await dialog.getByText("Schritte und erwartetes Verhalten (optional)").click();
  await dialog.getByLabel("Schritte zum Reproduzieren").fill("Click save twice.");
  await dialog.getByLabel("Erwartetes Verhalten", { exact: true }).fill("The document should save.");
  await dialog.getByLabel("Screenshots", { exact: true }).setInputFiles({
    name: "evidence.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS6UAAAAASUVORK5CYII=", "base64"),
  });
  await expect(dialog.getByRole("img", { name: "evidence.png" })).toBeVisible();
  // Clipboard image capture uses the same validation and preview path as uploads.
  await dialog.getByLabel("Was ist passiert?").evaluate(element => {
    const clipboardData = new DataTransfer();
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS6UAAAAASUVORK5CYII="), char => char.charCodeAt(0));
    clipboardData.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByRole("img", { name: "pasted.png" })).toBeVisible();
  await dialog.getByRole("button", { name: "pasted.png entfernen" }).click();
  await expect(dialog.getByRole("img", { name: "pasted.png" })).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fehler melden", exact: true }).click();
  await expect(dialog.getByLabel("Kurzer Titel")).toHaveValue(title);
  await expect(dialog.getByRole("img", { name: "evidence.png" })).toBeVisible();
  await page.route("**/api/files", async route => {
    if (route.request().method() === "POST") await route.fulfill({ status: 503, body: "Temporary failure" }); else await route.continue();
  });
  await dialog.getByRole("button", { name: "Meldung senden" }).click();
  await expect(dialog.getByText(/Meldung BUG-\d+ gespeichert/)).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Screenshots fehlen");
  await page.unroute("**/api/files");
  await dialog.getByRole("button", { name: "Screenshots erneut hochladen" }).click();
  await expect(dialog.getByText("Hochgeladen", { exact: true })).toBeVisible();
  await dialog.getByRole("link", { name: "Meldung öffnen" }).click();
  await expect(page).toHaveURL(/\/projects\/[^?]+\?task=/);
  await expect(dialog.getByText(/Fehlermeldung BUG-\d+/)).toBeVisible();
  await expect(dialog.getByRole("img", { name: "evidence.png" })).toBeVisible();
  const image = dialog.getByRole("img", { name: "evidence.png" });
  const imageUrl = await image.getAttribute("src");
  expect((await page.request.get(imageUrl!)).ok()).toBe(true);
  await dialog.getByText("Automatisch beigefügte Angaben").click();
  await expect(dialog).not.toContainText("not-collected");
  await page.keyboard.press("Escape");
  await page.goto("/");
  const panel = page.locator('[data-overview-section="tasks"]');
  await panel.getByRole("button", { name: "Alle Nutzer", exact: true }).click();
  await panel.getByRole("button", { name: "Board", exact: true }).click();
  const card = panel.locator("[data-task-card]").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: title, exact: true }).click();
  await expect(dialog.getByText("The save button did not respond.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "evidence.png" })).toBeVisible();
  await page.keyboard.press("Escape");
  await card.getByRole("combobox").selectOption("in_progress");
  await expect(panel.locator('[data-board-stage="in_progress"]').getByRole("button", { name: title, exact: true })).toBeVisible();
  // The shortcut freezes the screen first: a popup that disappears afterwards is still captured.
  await page.evaluate(() => {
    const popup = document.createElement("div"); popup.id = "popup-fixture";
    popup.style.cssText = "position:fixed;left:100px;top:250px;width:200px;height:120px;background:rgb(0,0,255);z-index:80";
    document.body.append(popup);
  });
  await page.keyboard.press("Control+Y");
  await expect(selector.locator("canvas")).toBeAttached();
  await page.evaluate(() => document.getElementById("popup-fixture")?.remove());
  await page.mouse.move(220, 330); await page.mouse.down();
  await page.mouse.move(120, 270, { steps: 5 }); await page.mouse.up();
  await selector.getByRole("button", { name: "Ausgewählten Bereich anhängen" }).click();
  const frozen = dialog.getByRole("img", { name: /^bug-area-/ });
  await expect(frozen).toBeVisible();
  expect(await frozen.evaluate(async element => {
    const image = element as HTMLImageElement; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data);
  })).toEqual([0, 0, 255, 255]);
  await dialog.getByRole("button", { name: /^bug-area-.* entfernen$/ }).click();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects");
  await page.getByRole("button", { name: "Hauptnavigation öffnen" }).click();
  await page.getByRole("button", { name: "Fehler melden", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Fehler melden" })).toBeVisible();
  await dialog.getByLabel("Kurzer Titel").fill("Mobile report");
  await dialog.getByLabel("Was ist passiert?").fill("Mobile evidence");
  await dialog.getByText("Automatisch beigefügte Angaben").click();
  await expect(dialog.getByText("/projects", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/bug-report-mobile.png" });
  await dialog.getByRole("button", { name: "Meldung senden" }).click();
  await expect(dialog.getByText(/Meldung BUG-\d+ gespeichert/)).toBeVisible();
  await dialog.getByRole("button", { name: "Fertig", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
