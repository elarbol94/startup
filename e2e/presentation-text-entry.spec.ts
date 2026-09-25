import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const selected = (page: Page) => page.locator(".react-flow__node.selected");
const texts = (page: Page) => page.locator(".react-flow__node-text");
const newText = (page: Page) => page.locator('.react-flow__node-text:not([data-id="a"]):not([data-id="b"])');
const richText = (page: Page) => page.locator(".react-flow__node .ProseMirror");
const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString());
async function snapshot(page: Page, id: string) {
  await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
/** A pane point left of the seeded frame, checked to be empty canvas. */
async function emptyPanePoint(page: Page) {
  const box = (await page.locator("[data-presentation-canvas]").boundingBox())!;
  const point = { x: box.x + 80, y: box.y + box.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("react-flow__pane"), point)).toBe(true);
  return point;
}
/** Top/left of the first character, in screen pixels. */
function firstGlyph(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector)!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (text) => text.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
    const text = walker.nextNode()!; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 1);
    const rect = range.getBoundingClientRect(); return { top: rect.top, left: rect.left };
  }, selector);
}

test("Enter on a selected text accepts typing at once", async ({ page }) => {
  await seed(page);
  await node(page, "a").click();
  await page.keyboard.press("Enter"); await page.keyboard.type("ABC");
  await expect(node(page, "a")).toContainText("ABC");
  await expect(richText(page)).toBeFocused();
});

test("double-click on a text accepts typing at once", async ({ page }) => {
  await seed(page);
  await node(page, "b").getByText("Second idea").dblclick(); await page.keyboard.type("ABC");
  await expect(node(page, "b")).toContainText("ABC");
});

test("Backspace right after Enter edits the text, not the element", async ({ page }) => {
  await seed(page);
  await node(page, "a").click();
  await page.keyboard.press("Enter"); await page.keyboard.press("Backspace");
  await expect(node(page, "a")).toHaveCount(1);
  await expect(richText(page)).toBeFocused();
  await expect(node(page, "a")).not.toContainText("First idea");
});

test("a text placed with Enter opens with its placeholder selected", async ({ page }) => {
  const id = await seed(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByTestId("presentation-placement-preview")).toBeAttached();
  await page.keyboard.press("Enter");
  await expect(richText(page)).toBeFocused();
  await expect.poll(() => selectedText(page)).toBe("Neuer Text");
  await page.keyboard.type("Hallo");
  await expect(newText(page)).toHaveText("Hallo");
  await expect(newText(page)).toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  await expect(newText(page)).toHaveText("Hallo");
  const deck = await snapshot(page, id);
  expect(deck.elements.filter((e: { type: string; content: { text: string } }) => e.type === "text").map((e: { content: { text: string } }) => e.content.text)).toContain("Hallo");
  // Typing is undone separately from the placement (typing itself may be split into
  // several steps when keys are more than the undo capture timeout apart).
  await expect(async () => {
    await page.keyboard.press("Control+z"); await expect(newText(page)).toHaveText("Neuer Text", { timeout: 1000 });
  }).toPass();
  await page.keyboard.press("Control+z"); await expect(newText(page)).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z"); await expect(newText(page)).toHaveText("Neuer Text");
});

test("a text placed with a click opens with its placeholder selected", async ({ page }) => {
  await seed(page);
  const point = await emptyPanePoint(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.move(point.x + 100, point.y); await page.mouse.click(point.x + 100, point.y);
  await expect(richText(page)).toBeFocused();
  await expect.poll(() => selectedText(page)).toBe("Neuer Text");
  await page.keyboard.type("Hallo");
  await expect(newText(page)).toHaveText("Hallo");
});

test("Escape leaves text editing but keeps the text selected", async ({ page }) => {
  await seed(page);
  await node(page, "a").click();
  await page.keyboard.press("Enter"); await expect(richText(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(richText(page)).toHaveCount(0);
  await expect(node(page, "a")).toHaveClass(/selected/);
  await page.keyboard.press("Enter"); await expect(richText(page)).toBeFocused();
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await expect(richText(page)).toHaveCount(0);
  await expect(selected(page)).toHaveCount(0);
});

test("text does not move between view and edit mode", async ({ page }) => {
  await seed(page);
  const view = await firstGlyph(page, '[data-presentation-text="b"]');
  await node(page, "b").click(); await page.keyboard.press("Enter"); await expect(richText(page)).toBeFocused();
  const edit = await firstGlyph(page, '.react-flow__node[data-id="b"] .ProseMirror');
  expect(Math.abs(edit.top - view.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(edit.left - view.left)).toBeLessThanOrEqual(1);
});

test("double-click on empty canvas creates a text in edit mode", async ({ page }) => {
  await seed(page);
  const point = await emptyPanePoint(page);
  await page.mouse.dblclick(point.x, point.y);
  await expect(texts(page)).toHaveCount(3);
  await expect(richText(page)).toBeFocused();
  await expect.poll(() => selectedText(page)).toBe("Neuer Text");
  await page.keyboard.type("Hallo");
  await expect(newText(page)).toHaveText("Hallo");
  const box = (await newText(page).boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - point.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y + box.height / 2 - point.y)).toBeLessThanOrEqual(2);
});

test("double-click while placing does not create another text", async ({ page }) => {
  await seed(page);
  const point = await emptyPanePoint(page);
  await page.getByRole("button", { name: "Rahmen", exact: true }).click();
  await expect(page.getByTestId("presentation-placement-preview")).toBeAttached();
  await page.mouse.move(point.x, point.y); await page.mouse.dblclick(point.x, point.y);
  await expect(page.getByTestId("presentation-placement-preview")).toHaveCount(0);
  await expect(page.locator(".react-flow__node-frame")).toHaveCount(2);
  await expect(texts(page)).toHaveCount(2);
});
