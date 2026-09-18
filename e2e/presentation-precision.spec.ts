import { expect, test, type Page } from "@playwright/test";
import { seedPresentation } from "./helpers/presentation-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
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

test("exact geometry supports cancel, validation, undo, collaboration and saved reload", async ({ page, context }) => {
  const id = await seedPresentation(page);
  const other = await context.newPage(); await other.goto(`/wiki/presentations/${id}`);
  await expect(node(other, "a")).toBeVisible();
  await node(page, "a").click(); await properties(page);
  const x = page.getByRole("spinbutton", { name: "X-Position", exact: true });
  await x.fill("100.125"); await x.press("Enter");
  expect((await saved(page, id)).elements.find((e: { id: string }) => e.id === "a").x).toBe(100.125);
  await expect.poll(() => node(other, "a").evaluate(el => new DOMMatrix(getComputedStyle(el).transform).e)).toBe(100.125);
  await x.fill("999"); await x.press("Escape"); await expect(x).toHaveValue("100.125");
  await page.getByRole("checkbox", { name: "Seitenverhältnis sperren" }).check();
  const width = page.getByRole("spinbutton", { name: "Breite", exact: true });
  await width.fill("520"); await width.press("Enter");
  await expect(page.getByRole("spinbutton", { name: "Höhe", exact: true })).toHaveValue("180");
  await canvas(page).focus(); await page.keyboard.press("Control+z"); await expect(width).toHaveValue("260");
  await page.keyboard.press("Control+Shift+z"); await expect(width).toHaveValue("520");
  await width.fill("1"); await width.press("Enter"); await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(width).toHaveValue("520");
  const rotation = page.getByRole("spinbutton", { name: "Drehung (Grad)", exact: true });
  await rotation.fill("12.75"); await rotation.press("Enter");
  const document = await saved(page, id);
  expect(document.elements.find((e: { id: string }) => e.id === "a")).toMatchObject({ x: 100.125, width: 520, height: 180, rotation: 12.75 });
  await page.reload(); await node(page, "a").click(); await properties(page);
  await expect(page.getByRole("spinbutton", { name: "Drehung (Grad)", exact: true })).toHaveValue("12.75");
  await page.screenshot({ path: "output/playwright/presentation-precision.png", animations: "disabled" });
  await other.close();
});

test("parent alignment persists and locked objects disable precise edits", async ({ page }) => {
  const id = await seedPresentation(page);
  await node(page, "a").click(); await properties(page);
  const align = page.getByRole("group", { name: "Im übergeordneten Rahmen ausrichten" });
  await align.getByRole("button", { name: "Horizontal zentrieren", exact: true }).click();
  expect((await saved(page, id)).elements.find((e: { id: string }) => e.id === "a").x).toBe(370);
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("spinbutton", { name: "X-Position", exact: true })).toHaveValue("100");
  await page.getByRole("button", { name: "Struktur", exact: true }).click();
  await page.getByRole("button", { name: "Objekt sperren", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "X-Position", exact: true })).toBeDisabled();
  await expect(align.getByRole("button").first()).toBeDisabled();
  await page.getByRole("button", { name: "Aussehen", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Text", exact: true })).toHaveAttribute("contenteditable", "false");
  await saved(page, id); await page.reload(); await node(page, "a").click(); await properties(page);
  await expect(page.getByRole("spinbutton", { name: "X-Position", exact: true })).toBeDisabled();
});
