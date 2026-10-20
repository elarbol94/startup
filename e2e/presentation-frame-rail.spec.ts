import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

/** Frames as slides: the path panel is a thumbnail rail, and "New frame" adds the next slide beside the last. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Element = { id: string; type: string; x: number; y: number; width: number; height: number; content: { isGroup?: boolean } };
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
const steps = (page: Page) => page.getByTestId("presentation-frame-rail").getByTestId("presentation-step");
async function deck(page: Page, id: string): Promise<{ elements: Element[]; steps: { elementId: string }[] }> {
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}

test("the rail shows a thumbnail per stop, adds frames beside the last one, and stays open once opened", async ({ page }) => {
  const id = await seed(page);
  const rail = page.getByRole("button", { name: "Weg", exact: true });
  await expect(rail).toHaveAttribute("aria-expanded", "false");
  await rail.click();
  await expect(steps(page)).toHaveCount(1);
  await expect(steps(page).first().locator("svg[role=img]")).toBeVisible();
  await expect(steps(page).first()).toContainText("Overview");

  await page.getByRole("button", { name: "Neuer Rahmen", exact: true }).click();
  await expect(steps(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Neuer Rahmen", exact: true }).click();
  await expect(steps(page)).toHaveCount(3);
  await expect(page.locator(".react-flow__node-frame.selected")).toHaveCount(1);

  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const saved = await deck(page, id);
    const frames = saved.steps.map((step) => saved.elements.find((element) => element.id === step.elementId)!);
    return frames.map((frame) => [frame.type, frame.x, frame.y, frame.width, frame.height]);
  }).toEqual([["frame", 0, 0, 1000, 650], ["frame", 1120, 0, 1000, 650], ["frame", 2240, 0, 1000, 650]]);

  // Selecting a thumbnail selects its frame.
  await steps(page).nth(1).locator("button[title]").click();
  await expect(steps(page).nth(1).locator("[aria-current=step]")).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole("button", { name: "Weg", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(steps(page)).toHaveCount(3);
});
