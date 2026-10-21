import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

/** Presenting in front of people: what the audience sees, and the keys a presenter reaches for. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

const box = (id: string, y: number, text: string, extra = {}) => ({ id, type: "shape", parentId: "frame", x: 120, y, width: 300, height: 140, rotation: 0,
  content: { shape: "roundedRect", fill: "", stroke: "#172033", strokeWidth: 2, opacity: 1, text }, ...extra });
const elements = [
  { id: "frame", type: "frame", x: 0, y: 0, width: 1000, height: 650, rotation: 0, content: { label: "", shape: "rect", color: "" } },
  box("start", 60, "Startseite"), box("lend", 260, "Gegenstandsverleih", { detailId: "page" }), box("ride", 460, "Mitfahrbörse"),
  { id: "page", type: "frame", x: 0, y: 100_000, width: 960, height: 540, rotation: 0, content: { label: "Verleih im Detail", shape: "rect", color: "" } },
  { id: "pageText", type: "text", parentId: "page", x: 60, y: 100_060, width: 800, height: 90, rotation: 0, content: { text: "Bohrmaschinen, Leitern", fontSize: 40, bold: true, align: "left", color: "" } },
];
const steps = [{ id: "s1", elementId: "start" }, { id: "s2", elementId: "lend" }, { id: "s3", elementId: "ride" }];

async function present(page: Page, query = "") {
  const id = await seed(page, false, false, elements, { steps, waitFor: "lend" });
  await page.goto(`/wiki/presentations/${id}/present${query}`);
  await expect(page.locator('.react-flow__node[data-id="start"]')).toBeVisible();
  return { id, player: page.getByTestId("presentation-player"), status: page.getByRole("status").filter({ hasText: "/" }) };
}
const viewport = (page: Page) => page.locator(".react-flow__viewport").getAttribute("style");

test("the controls and the cursor leave while the mouse rests, and the tab carries the deck's name", async ({ page }) => {
  const { player } = await present(page);
  await expect(page).toHaveTitle(/E2E|Interactions|Präsentation/);
  const controls = page.getByTestId("presentation-controls");
  await page.mouse.move(700, 300);
  await expect(controls).toHaveAttribute("data-hidden", "true", { timeout: 6_000 });
  await expect(player).toHaveAttribute("data-idle", "true");
  // A clicker's keys do not bring them back; the mouse does.
  await page.keyboard.press("ArrowRight");
  await expect(controls).toHaveAttribute("data-hidden", "true");
  await page.mouse.move(720, 320);
  await expect(controls).not.toHaveAttribute("data-hidden");
  await expect(controls.getByRole("button", { name: "Nächste Station" })).toHaveAttribute("title", "Nächste Station (→)");
});

test("the laser pointer hides the cursor and leaves the control bar undimmed", async ({ page }) => {
  await present(page);
  await page.getByRole("button", { name: "Spotlight-Cursor" }).click();
  await expect(page.getByTestId("presentation-spotlight")).toBeVisible();
  await page.mouse.move(600, 300);
  await expect.poll(() => page.locator(".react-flow__pane").evaluate((pane) => getComputedStyle(pane).cursor)).toBe("none");
  const next = page.getByRole("button", { name: "Nächste Station" });
  const centre = (await next.boundingBox())!;
  const onTop = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="presentation-controls"]')), { x: centre.x + centre.width / 2, y: centre.y + centre.height / 2 });
  expect(onTop).toBe(true);
});

test("a keyboard zoom holds until Escape, which returns to the stop instead of ending the show", async ({ page }) => {
  const { id } = await present(page);
  const framed = await viewport(page);
  await page.keyboard.press("+");
  await expect.poll(() => viewport(page)).not.toBe(framed);
  await page.waitForTimeout(400); // the zoom's own short animation
  const zoomed = await viewport(page);
  await page.waitForTimeout(1_500);
  expect(await viewport(page)).toBe(zoomed);
  await page.keyboard.press("Escape");
  await expect.poll(() => viewport(page)).toBe(framed);
  await expect(page).toHaveURL(new RegExp(`/wiki/presentations/${id}/present$`));
  // The overview holds the same way.
  await page.keyboard.press("Home");
  await expect.poll(() => viewport(page)).not.toBe(framed);
  await page.keyboard.press("Escape");
  await expect.poll(() => viewport(page)).toBe(framed);
});

test("B and W blank the screen, a typed number jumps, and a stop can open the show", async ({ page }) => {
  const { id, status, player } = await present(page);
  const blank = page.getByTestId("presentation-blank");
  await page.keyboard.press("b");
  await expect(blank).toHaveAttribute("data-screen", "black");
  await page.keyboard.press("w");
  await expect(blank).toHaveAttribute("data-screen", "white");
  await page.keyboard.press("Escape");
  await expect(blank).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/present$`));
  // Moving on lifts the blank screen too.
  await page.keyboard.press(".");
  await expect(blank).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(blank).toHaveCount(0);

  await page.keyboard.press("3");
  await expect(page.getByTestId("presentation-stop-number")).toContainText("3");
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("3 / 3");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await page.keyboard.press("9");
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("3 / 3");

  // "From current stop": the editor's link carries the step to open on.
  await page.goto(`/wiki/presentations/${id}/present?from=s3`);
  await expect(status).toHaveText("3 / 3");
});

test("coming back out of a detail page shows the element that opened it", async ({ page }) => {
  const { player, status } = await present(page);
  await page.keyboard.press("ArrowRight");
  await expect(player).toHaveAttribute("data-scene", "page");
  await expect(page.locator("[data-turning]")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(status).toHaveText("2 / 3");
  await expect(page.locator("[data-turning]")).toHaveCount(0);
  // The topic just shown fills the view, rather than the stop before it.
  await expect.poll(async () => (await page.locator('.react-flow__node[data-id="lend"]').boundingBox())?.width ?? 0).toBeGreaterThan(700);
});

test("the presenter view counts down to the talk's target length", async ({ page }) => {
  const { id } = await present(page);
  await page.goto(`/wiki/presentations/${id}/present/notes`);
  const target = page.getByRole("spinbutton", { name: "Ziel (min)" });
  await target.fill("1");
  await expect(page.getByTestId("presenter-remaining")).toHaveText(/^\((1:00|0:5\d)\)$/);
  // Remembered on this device for the next talk.
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Ziel (min)" })).toHaveValue("1", { timeout: 30_000 });
  // The notes are headed by the stop's own words.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Startseite");
});

test("the offline file keeps detail pages to themselves and visits them on the path", async ({ page }) => {
  const { id } = await present(page);
  const html = await (await page.request.get(`/api/wiki/presentations/${id}/offline`)).text();
  await page.setContent(html);
  const pageText = page.locator('[data-element="pageText"]');
  // On the overview the page is not drawn at all.
  await expect(pageText).toHaveCSS("opacity", "0");
  await page.keyboard.press("ArrowRight");
  await expect(pageText).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-element="start"]')).toHaveCSS("opacity", "0");
  await page.keyboard.press("ArrowRight");
  await expect(pageText).toHaveCSS("opacity", "0");
  await expect(page.locator("#counter")).toHaveText("3 / 4");
});
