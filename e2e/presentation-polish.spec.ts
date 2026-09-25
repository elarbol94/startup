import { expect, test, type Page } from "@playwright/test";
import { seedPresentation } from "./helpers/presentation-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(240_000);
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
const preview = (page: Page) => page.getByTestId("presentation-placement-preview");
async function properties(page: Page) {
  await page.getByRole("button", { name: "Werkzeuge", exact: true }).click();
  await page.getByRole("menuitem", { name: "Eigenschaften", exact: true }).click();
}
async function saved(page: Page, id: string) {
  await canvas(page).focus();
  await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  return (await page.request.get(`/api/wiki/presentations/${id}`)).json();
}
async function openTemplateDialog(page: Page) {
  await page.goto("/wiki/presentations");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Leer oder aus Vorlage", exact: true }).click();
  return page.getByRole("dialog");
}
const box = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("template dialog lists Leer first, hides template hints for it and creates on Enter with a placeholder title", async ({ page }) => {
  await seedPresentation(page, false, false, undefined, { waitFor: null });
  const dialog = await openTemplateDialog(page);
  await expect(dialog.locator("button[aria-pressed]").first()).toHaveAccessibleName("Leer");
  await expect(dialog.getByRole("button", { name: "Themenkarte", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByText(/Leitfragen und Sprechernotizen/)).toBeVisible();
  await dialog.getByRole("button", { name: "Leer", exact: true }).click();
  await expect(dialog.getByText(/Leitfragen und Sprechernotizen/)).toHaveCount(0);
  // An untitled slide template shows its placeholder, not "Ohne Titel".
  await dialog.getByRole("button", { name: "Pitch", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Titel der Präsentation" }).press("Enter");
  await page.waitForURL(/\/wiki\/presentations\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: "Titel der Präsentation" })).toHaveValue("Ohne Titel");
  await expect(node(page, "pitch-title")).toContainText("[Titel]");
  await expect(page.locator(".react-flow__node").filter({ hasText: "Ohne Titel" })).toHaveCount(0);
});

test("a group is labelled Gruppe and stays selected after dragging it", async ({ page }) => {
  await seedPresentation(page);
  await node(page, "a").click(); await node(page, "b").click({ modifiers: ["Shift"] });
  await canvas(page).focus(); await page.keyboard.press("Control+g");
  await properties(page);
  const heading = page.locator("#presentation-tool-appearance h2");
  await expect(heading).toHaveText("Gruppe");
  const b = (await node(page, "b").boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 80, b.y + b.height / 2 + 40, { steps: 8 }); await page.mouse.up();
  await expect(heading).toHaveText("Gruppe");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
});

test("inspector rounds geometry and untouched fields do not move the element", async ({ page }) => {
  const id = await seedPresentation(page, false, false, [
    { id: "a", type: "shape", x: 100.123456, y: 50.987654, width: 200.04, height: 120.55, rotation: 0, content: { shape: "rect", fill: "#6366f1", stroke: "", strokeWidth: 0, opacity: 1 } },
  ], { steps: [], waitFor: "a" });
  await node(page, "a").click(); await properties(page);
  const x = page.getByRole("spinbutton", { name: "X-Position", exact: true });
  await expect(x).toHaveValue("100.1");
  await expect(page.getByRole("spinbutton", { name: "Y-Position", exact: true })).toHaveValue("51");
  await expect(page.getByRole("spinbutton", { name: "Breite", exact: true })).toHaveValue("200");
  await x.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  const element = (await saved(page, id)).elements.find((e: { id: string }) => e.id === "a");
  expect(element).toMatchObject({ x: 100.123456, y: 50.987654, width: 200.04, height: 120.55 });
});

test("minimap sits bottom-right clear of the overview button and frame text and can be hidden", async ({ page }) => {
  await seedPresentation(page);
  await page.getByTestId("presentation-editor").getByRole("button", { name: "Übersicht", exact: true }).click();
  const minimap = page.locator(".react-flow__minimap");
  await expect(minimap).toBeVisible();
  await page.waitForTimeout(900);
  const map = (await minimap.boundingBox())!, overview = (await page.getByTestId("presentation-editor").getByRole("button", { name: "Übersicht", exact: true }).boundingBox())!;
  const area = (await canvas(page).boundingBox())!;
  expect(box(map, overview)).toBe(false);
  expect(map.y).toBeGreaterThan(area.y + area.height / 2);
  expect(map.x).toBeGreaterThan(area.x + area.width / 2);
  expect(box(map, (await node(page, "a").boundingBox())!)).toBe(false);
  await page.getByRole("button", { name: "Minikarte ausblenden" }).click();
  await expect(minimap).toHaveCount(0);
  await page.getByRole("button", { name: "Minikarte einblenden" }).click();
  await expect(minimap).toBeVisible();
});

test("browser tab and workspace tab are named after the deck and follow a rename", async ({ page }) => {
  await seedPresentation(page);
  const name = await page.getByRole("textbox", { name: "Titel der Präsentation" }).inputValue();
  await expect(page).toHaveTitle(`${name} – Präsentation`);
  await expect(page.locator("#workspace-tab-primary")).toHaveText(name);
  const input = page.getByRole("textbox", { name: "Titel der Präsentation" });
  await input.fill("Quartalsbericht"); await input.press("Enter");
  await expect(page).toHaveTitle("Quartalsbericht – Präsentation");
  await expect(page.locator("#workspace-tab-primary")).toHaveText("Quartalsbericht");
});

test("reloading does not show my previous load as a collaborator", async ({ page }) => {
  await seedPresentation(page);
  await node(page, "a").click();
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(node(page, "a")).toBeVisible();
  const status = page.getByTestId("collaboration-status");
  await expect(status.getByText("Gespeichert", { exact: true })).toBeVisible();
  await page.waitForTimeout(3_000);
  await expect(status.getByText("E2E Admin")).toHaveCount(0);
});

test("format and layer shortcuts use Ctrl+Alt and Ctrl+Shift+Arrow", async ({ page }) => {
  const id = await seedPresentation(page);
  await node(page, "a").click(); await canvas(page).focus();
  await page.keyboard.press("Control+Shift+C");
  await expect(page.getByText("Format kopiert.", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Control+Alt+KeyC");
  await expect(page.getByText("Format kopiert.", { exact: true })).toBeVisible();
  const order = async () => (await saved(page, id)).elements.map((e: { id: string }) => e.id) as string[];
  await node(page, "a").click(); await canvas(page).focus();
  await page.keyboard.press("Control+Shift+ArrowUp");
  let ids = await order(); expect(ids.indexOf("a")).toBeGreaterThan(ids.indexOf("line"));
  const before = (await saved(page, id)).elements.find((e: { id: string }) => e.id === "a");
  await page.keyboard.press("Control+Shift+ArrowDown");
  ids = await order(); expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
  const after = (await saved(page, id)).elements.find((e: { id: string }) => e.id === "a");
  expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  await node(page, "a").click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /Format kopieren/ })).toContainText("Ctrl+Alt+C");
  await expect(menu.getByRole("menuitem", { name: "In den Vordergrund" }).first()).toContainText("Ctrl+Shift+↑");
});

test("file pickers are styled and labelled in German", async ({ page }) => {
  await seedPresentation(page);
  const image = page.getByLabel("Bild hochladen", { exact: true });
  await expect(image).toHaveAttribute("type", "file");
  await page.goto("/wiki/presentations");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("menuitem", { name: "PowerPoint importieren" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("PowerPoint-Datei auswählen", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Keine Datei ausgewählt", { exact: true })).toBeVisible();
  const input = dialog.getByLabel("PowerPoint-Datei auswählen");
  await expect(input).toHaveClass(/sr-only/);
});

test("T, R, O, L and F start placement but not while editing text", async ({ page }) => {
  const id = await seedPresentation(page);
  await canvas(page).focus();
  for (const key of ["t", "o", "l", "f"]) {
    await page.keyboard.press(key); await expect(preview(page)).toBeAttached();
    await page.keyboard.press("Escape"); await expect(preview(page)).toHaveCount(0);
  }
  await page.keyboard.press("r"); await expect(preview(page)).toBeAttached();
  await page.keyboard.press("Enter"); await expect(preview(page)).toHaveCount(0);
  await expect.poll(async () => (await saved(page, id)).elements.filter((e: { type: string; content: { shape?: string } }) => e.type === "shape" && e.content.shape === "rect").length).toBe(1);
  await expect(page.getByRole("button", { name: "Text", exact: true })).toHaveAttribute("title", "Text (T)");
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Form", exact: true }).hover();
  await expect(page.getByRole("menuitem", { name: /Rechteck/ }).first()).toContainText("R");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  // Letters typed right after Enter go into the text, not to the tools.
  await node(page, "b").click(); await canvas(page).focus();
  await page.keyboard.press("Enter"); await page.keyboard.type("trolf");
  await expect(preview(page)).toHaveCount(0);
  await expect(node(page, "b")).toContainText("trolf");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Auswahlaktionen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tastenkürzel" }).click();
  const help = page.getByRole("dialog");
  for (const [label, key] of [["Rechteck", "R"], ["Ellipse", "O"], ["Linie", "L"], ["Rahmen", "F"], ["Text", "T"]]) await expect(help.locator("div.justify-between").filter({ has: page.locator("span").getByText(label, { exact: true }) }).locator("kbd")).toHaveText(key);
});
