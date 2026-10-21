import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { seedPresentation, fileMenu } from "./helpers/presentation-fixture";

test.use({ actionTimeout: 30_000, viewport: { width: 1440, height: 1000 } });
// The editor route compiles on first visit in the dev server, which alone can take about a minute.
test.setTimeout(180_000);

test("the editor's actions menu downloads the deck as a PowerPoint file with its picture and notes", async ({ page }) => {
  const id = await seedPresentation(page, true, false, undefined, { steps: [{ id: "s1", elementId: "frame", notes: "Say hello first." }] });
  const download = page.waitForEvent("download");
  await fileMenu(page, "PowerPoint (.pptx)");
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pptx$/);
  const files = unzipSync(new Uint8Array(await readFile(await file.path())));
  const slide = strFromU8(files["ppt/slides/slide1.xml"]);
  expect(Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(1);
  expect(slide).toContain('<p:cSld name="Overview">');
  expect(slide).toContain("<a:t>First</a:t>");
  expect(slide).toContain("<p:cxnSp>");
  expect(slide).toContain("<p:pic>");
  expect(Object.keys(files).some((name) => name.startsWith("ppt/media/image1."))).toBe(true);
  expect(strFromU8(files["ppt/notesSlides/notesSlide1.xml"])).toContain("Say hello first.");

  // The route enforces sign-in like the other exports.
  const anonymous = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  expect((await anonymous.request.get(`/api/wiki/presentations/${id}/pptx`)).status()).toBe(401);
  await anonymous.close();
});
