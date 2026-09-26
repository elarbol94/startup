import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.use({ actionTimeout: 30_000, viewport: { width: 1440, height: 1000 } });

// Four python-pptx slides (scripts/fixtures/make-import-sample.py): title, bullets, shape + table, chart + notes.
const sample = readFileSync(path.join(process.cwd(), "src/modules/wiki/lib/__fixtures__/import-sample.pptx"));
const titles = ["Quarterly Review", "Roadmap", "Budget Overview", "Revenue by Quarter"];

async function login(page: Page) {
  const credentials = { username: "admin", password: "super-secret-1" };
  let response = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(response.ok()).toBe(true);
}

test("a python-pptx deck imports with slide-titled frames and stops and per-slide notes", async ({ page }, info) => {
  await login(page); await page.goto("/wiki/presentations");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("menuitem", { name: "PowerPoint importieren" }).click();
  const imported = page.waitForResponse((response) => response.url().endsWith("/api/wiki/presentations/import"));
  await page.getByLabel("PowerPoint-Datei auswählen").setInputFiles({ name: "Quarterly.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: sample });
  const { id } = await (await imported).json();
  await expect(page.getByRole("heading", { name: "Importhinweise" })).toBeVisible();
  const notes = page.getByRole("dialog").getByRole("listitem");
  await expect(notes.filter({ hasText: "Folie 3: Tabelle als gruppierte Text-Zellen übernommen" })).toBeVisible();
  await expect(notes.filter({ hasText: "Folie 2:" })).toHaveCount(1);
  await expect(notes.filter({ hasText: "Folie 1:" })).toHaveCount(0);

  const saved = await (await page.request.get(`/api/wiki/presentations/${id}`)).json();
  const frames = saved.elements.filter((element: { type: string; content: { isGroup?: boolean } }) => element.type === "frame" && !element.content.isGroup);
  expect(frames.map((frame: { content: { label: string } }) => frame.content.label)).toEqual(titles);
  expect(saved.steps.map((step: { elementId: string }) => step.elementId)).toEqual(frames.map((frame: { id: string }) => frame.id));
  expect(saved.steps[3].notes).toContain("Emphasise the Q3 growth.");
  expect(saved.elements.some((element: { type: string }) => element.type === "chart")).toBe(true);

  await page.getByRole("button", { name: "Importierte Präsentation öffnen" }).click();
  const editor = page.getByTestId("presentation-editor");
  await expect(editor).toBeVisible();
  for (const title of titles) await expect(editor.locator("[data-frame-label]").filter({ hasText: title })).toHaveCount(1);
  // Placeholders sit where the layout puts them: the title is above the bullets, not stacked at the frame origin.
  const heading = editor.locator(".react-flow__node-text").filter({ hasText: /^Roadmap$/ });
  const bullets = editor.locator(".react-flow__node-text").filter({ hasText: "Launch presentation import" });
  const [headingBox, bulletBox] = [await heading.boundingBox(), await bullets.boundingBox()];
  expect(headingBox && bulletBox && headingBox.y + headingBox.height <= bulletBox.y + 1).toBe(true);

  // The slide picture went through the regular attachment upload and renders.
  const picture = editor.locator(".react-flow__node-image img");
  await expect(picture).toHaveCount(1);
  await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(8);
  await page.screenshot({ path: info.outputPath("imported-deck.png") });
  const pathButton = page.getByRole("button", { name: "Weg", exact: true });
  if (await pathButton.getAttribute("aria-expanded") !== "true") await pathButton.click();
  for (const title of titles) await expect(page.locator("li").filter({ hasText: title }).first()).toBeVisible();
});
