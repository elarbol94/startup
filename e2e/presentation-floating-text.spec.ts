import { expect, test, type Page } from "@playwright/test";
import { seedPresentation } from "./helpers/presentation-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);
const toolbar = (page: Page) => page.getByTestId("floating-text-toolbar");
const savedText = async (page: Page, id: string, element = "b") => {
  const saved = await (await page.request.get(`/api/wiki/presentations/${id}`)).json();
  return saved.elements.find((item: { id: string }) => item.id === element).content;
};

test("selection exposes a compact toolbar and saves whole-box paragraph and font changes", async ({ page }) => {
  const id = await seedPresentation(page);
  await page.locator('.react-flow__node[data-id="b"]').click();
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByTestId("floating-text-align-center").click();
  await toolbar(page).getByRole("combobox", { name: "Schriftart", exact: true }).selectOption("georgia");
  await expect.poll(async () => {
    const content = await savedText(page, id);
    return [content.font, content.paragraphs?.[0]?.align];
  }).toEqual(["georgia", "center"]);
  await page.screenshot({ path: "test-results/floating-text-desktop.png" });
  const box = await toolbar(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
  await page.reload();
  await page.locator('.react-flow__node[data-id="b"]').click();
  await expect(toolbar(page).getByRole("combobox", { name: "Schriftart", exact: true })).toHaveValue("georgia");
  await page.locator(".react-flow__pane").click({ position: { x: 15, y: 15 } });
  await expect(toolbar(page)).toHaveCount(0);
});

test("double-click formatting preserves a highlighted range across buttons and popup inputs", async ({ page }) => {
  const id = await seedPresentation(page);
  const text = page.locator('.react-flow__node[data-id="b"]');
  await text.dblclick();
  const editor = text.locator('[contenteditable="true"]');
  await expect(editor).toBeFocused();
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Second");
  await toolbar(page).getByRole("button", { name: "Kursiv", exact: true }).click();
  await toolbar(page).getByRole("spinbutton", { name: "Schriftgröße", exact: true }).fill("24");
  await toolbar(page).getByRole("spinbutton", { name: "Schriftgröße", exact: true }).press("Enter");
  await expect.poll(async () => {
    const c = await savedText(page, id);
    const runs = c.runs ?? [];
    return { text: c.text, italic: runs.filter((r: { italic?: boolean }) => r.italic).map((r: { text: string }) => r.text).join(""),
      sized: runs.filter((r: { size?: number }) => r.size === 24).map((r: { text: string }) => r.text).join("") };
  }).toEqual({ text: "Second idea", italic: "Second", sized: "Second" });
  await toolbar(page).getByTestId("floating-text-color").click();
  await expect(page.getByTestId("floating-text-color-menu")).toBeVisible();
  await page.getByTestId("floating-text-color-menu").getByRole("button", { name: "Rot", exact: true }).click();
  await expect.poll(async () => (await savedText(page, id)).runs?.filter((r: { color?: string }) => r.color).map((r: { text: string }) => r.text).join("")).toBe("Second");
  await page.screenshot({ path: "test-results/floating-text-selection.png" });
  await toolbar(page).getByRole("button", { name: "Textleiste schließen" }).click();
  await expect(toolbar(page)).toHaveCount(0);
});

test("the toolbar stays in a narrow canvas and is unavailable for locked text", async ({ page }) => {
  const items = [
    { id: "frame", type: "frame", x: 0, y: 0, width: 960, height: 540, rotation: 0, content: { label: "", shape: "rect", color: "" } },
    { id: "a", type: "text", x: 10, y: 10, width: 220, height: 100, rotation: 0, content: { text: "Editable", fontSize: 32, bold: false, align: "left", color: "" } },
    { id: "locked", type: "text", x: 500, y: 300, width: 220, height: 100, rotation: 0, locked: true, content: { text: "Locked", fontSize: 32, bold: false, align: "left", color: "" } },
  ];
  await seedPresentation(page, false, false, items);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.react-flow__node[data-id="a"]').click();
  await expect(toolbar(page)).toBeVisible();
  const box = await toolbar(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/floating-text-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.react-flow__node[data-id="locked"]').click();
  await expect(toolbar(page)).toHaveCount(0);
});
