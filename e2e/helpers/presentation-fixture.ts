import { expect, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";

export async function seedPresentation(page: Page, withMedia = false, authenticated = false, customElements?: unknown[]) {
  if (!authenticated) {
    const credentials = { username: "admin", password: "super-secret-1" };
    let auth = await page.request.post("/api/auth/sign-in/username", { data: credentials });
    if (!auth.ok()) auth = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
    expect(auth.ok(), await auth.text()).toBe(true);
  }
  const buffer = Buffer.from(zipSync({
    "ppt/presentation.xml": strToU8('<p:presentation xmlns:p="urn:p" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>'),
    "ppt/_rels/presentation.xml.rels": strToU8('<Relationships xmlns="urn:r"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>'),
    "ppt/slides/slide1.xml": strToU8('<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><p:cSld><p:spTree/></p:cSld></p:sld>'),
  }));
  const result = await page.request.post("/api/wiki/presentations/import", { multipart: { file: { name: "Interactions.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer } } });
  expect(result.ok(), await result.text()).toBe(true);
  const { id } = await result.json(); const source = await (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
  const elements = [
    { id: "frame", type: "frame", x: 0, y: 0, width: 1000, height: 650, rotation: 0, content: { label: "Overview", shape: "rect", color: "#6366f1" } },
    { id: "a", type: "text", parentId: "frame", x: 100, y: 100, width: 260, height: 90, rotation: 0, content: { text: "First idea", runs: [{ text: "First", bold: true }, { text: " idea" }], fontSize: 32, bold: false, align: "left", color: "#172033" } },
    { id: "b", type: "text", parentId: "frame", x: 500, y: 100, width: 260, height: 90, rotation: 0, content: { text: "Second idea", fontSize: 32, bold: false, align: "left", color: "#172033" } },
    { id: "line", type: "shape", parentId: "frame", x: 100, y: 350, width: 260, height: 40, rotation: 0, content: { shape: "arrow", fill: "", stroke: "#6366f1", strokeWidth: 4, opacity: 1 } },
  ];
  const media = [];
  if (withMedia) {
    const upload = await page.request.post("/api/files", { multipart: { entityType: "wikiPresentation", entityId: id, file: { name: "pixel.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=", "base64") } } });
    expect(upload.ok(), await upload.text()).toBe(true); const attachment = await upload.json();
    media.push({ id: "image", type: "image", parentId: "frame", x: 650, y: 350, width: 100, height: 100, rotation: 0, content: { attachmentId: attachment.id, alt: "Clipboard image" } });
  }
  const patched = await page.request.patch(`/api/wiki/presentations/${id}`, { data: { ...source, elements: customElements ?? [...elements, ...media], steps: [{ id: "s1", elementId: "frame" }], expectedUpdatedAt: source.updatedAt, sessionId: "interaction-fixture" } });
  expect(patched.ok(), await patched.text()).toBe(true);
  await page.goto(`/wiki/presentations/${id}`);
  await expect(page.getByRole("button", { name: "Text", exact: true })).toBeEnabled();
  await expect(page.locator('.react-flow__node[data-id="a"]')).toBeVisible();
  return id as string;
}

export async function placeAtCenter(page: Page) {
  await expect(page.getByTestId("presentation-placement-preview")).toBeAttached();
  await page.locator("[data-presentation-canvas]").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("presentation-placement-preview")).toHaveCount(0);
}
