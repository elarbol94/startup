import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

/** PowerPoint-style text: click into a selected box, type over a selection, text inside shapes. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Element = { id: string; type: string; content: { text?: string; runs?: unknown } };
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const selected = (page: Page) => page.locator(".react-flow__node.selected");
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
const shape = { id: "box", type: "shape", x: 450, y: 300, width: 300, height: 160, rotation: 0, content: { shape: "rect", fill: "#e0e7ff", stroke: "#6366f1", strokeWidth: 2, opacity: 1 } };
const text = { id: "a", type: "text", x: 100, y: 100, width: 300, height: 90, rotation: 0, content: { text: "First idea", fontSize: 32, bold: false, align: "left", color: "#172033" } };

async function saved(page: Page, id: string): Promise<{ elements: Element[] }> {
  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
const textOf = (deck: { elements: Element[] }, id: string) => deck.elements.find((element) => element.id === id)!.content.text;

test("a click on a selected text box puts the caret there; typing on a selected box adds to its text", async ({ page }) => {
  const id = await seed(page, false, false, [text], { steps: [], waitFor: "a" });
  await node(page, "a").click(); await expect(node(page, "a")).toHaveClass(/selected/);
  await expect(node(page, "a").locator(".ProseMirror")).toHaveCount(0);
  // Second, separate click at the end of the text: edit mode with a collapsed caret.
  const box = (await node(page, "a").locator("[data-presentation-text]").boundingBox())!;
  await page.waitForTimeout(600);
  await page.mouse.click(box.x + box.width - 4, box.y + 20);
  await expect(node(page, "a").locator(".ProseMirror")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await page.keyboard.type("s");
  await page.keyboard.press("Escape"); await expect(node(page, "a")).toHaveClass(/selected/);
  expect(textOf(await saved(page, id), "a")).toBe("First ideas");

  // Selected but not editing: typing starts editing at the end of the text, like PowerPoint.
  await expect(node(page, "a").locator(".ProseMirror")).toHaveCount(0);
  await canvas(page).focus(); await page.keyboard.type("Fresh");
  await page.keyboard.press("Escape");
  expect(textOf(await saved(page, id), "a")).toBe("First ideasFresh");
});

test("shapes take text: type on a selected shape, double-click to edit, Escape steps out", async ({ page }) => {
  const id = await seed(page, false, false, [shape], { steps: [], waitFor: "box" });
  await node(page, "box").click(); await canvas(page).focus();
  await page.keyboard.type("Hello");
  await expect(node(page, "box").locator(".ProseMirror")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(node(page, "box")).toHaveClass(/selected/); await expect(node(page, "box").locator(".ProseMirror")).toHaveCount(0);
  await expect(node(page, "box")).toContainText("Hello");
  expect(textOf(await saved(page, id), "box")).toBe("Hello");

  await page.keyboard.press("Escape"); await expect(selected(page)).toHaveCount(0);
  await node(page, "box").dblclick();
  await expect(node(page, "box").locator(".ProseMirror")).toBeFocused();
  await page.keyboard.press("End"); await page.keyboard.type(" world"); await page.keyboard.press("Escape");
  expect(textOf(await saved(page, id), "box")).toBe("Hello world");

  // Bold from the inspector reaches the shape's text.
  await page.getByRole("button", { name: "Werkzeuge", exact: true }).click();
  await page.getByRole("menuitem", { name: "Eigenschaften", exact: true }).click();
  await page.getByTestId("presentation-shape-text").getByRole("button", { name: "Fett", exact: true }).click();
  const deck = await saved(page, id);
  expect(deck.elements.find((element) => element.id === "box")!.content).toMatchObject({ text: "Hello world", bold: true });
});
