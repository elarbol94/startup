import { describe, expect, it } from "vitest";
import { presentationElementSchema, type PresentationElement } from "./presentation-model";
import { PRESENTATION_DARK_INK, PRESENTATION_LIGHT_INK, inkOn, presentationDefaultInks } from "./presentation-ink";

const box = { x: 0, y: 0, width: 1600, height: 900, rotation: 0 };
const element = (value: Record<string, unknown>) => presentationElementSchema.parse(value) as PresentationElement;
const slide = (fill: string, id = "slide") => element({ id, type: "shape", ...box, content: { shape: "rect", fill } });
const text = (id = "text", color = "") => element({ id, type: "text", x: 100, y: 100, width: 300, height: 60, rotation: 0, content: { text: "Hallo", fontSize: 32, bold: false, color, align: "left" } });

describe("default ink of uncoloured text", () => {
  it("picks dark ink on light colours and light ink on dark ones", () => {
    expect(inkOn("#ffffff")).toBe(PRESENTATION_DARK_INK);
    expect(inkOn("#f5f9f8")).toBe(PRESENTATION_DARK_INK);
    expect(inkOn("#0f172a")).toBe(PRESENTATION_LIGHT_INK);
    expect(inkOn("var(--x)")).toBeUndefined();
  });

  it("reads the slide painted under the text, whatever the app theme", () => {
    expect(presentationDefaultInks([slide("#ffffff"), text()]).get("text")).toBe(PRESENTATION_DARK_INK);
    expect(presentationDefaultInks([slide("#111827"), text()]).get("text")).toBe(PRESENTATION_LIGHT_INK);
  });

  it("uses the topmost surface, and ignores ones that do not cover the text's centre", () => {
    const card = element({ id: "card", type: "shape", x: 50, y: 50, width: 500, height: 200, rotation: 0, content: { shape: "rect", fill: "#000000" } });
    const elsewhere = element({ id: "elsewhere", type: "shape", x: 1000, y: 600, width: 100, height: 100, rotation: 0, content: { shape: "rect", fill: "#000000" } });
    expect(presentationDefaultInks([slide("#ffffff"), card, text()]).get("text")).toBe(PRESENTATION_LIGHT_INK);
    expect(presentationDefaultInks([slide("#ffffff"), elsewhere, text()]).get("text")).toBe(PRESENTATION_DARK_INK);
  });

  it("does not look through a photo, and falls back to the presentation background", () => {
    const photo = element({ id: "photo", type: "image", ...box, content: { attachmentId: "a" } });
    expect(presentationDefaultInks([slide("#ffffff"), photo, text()]).has("text")).toBe(false);
    expect(presentationDefaultInks([text()], "#ffffff").get("text")).toBe(PRESENTATION_DARK_INK);
    expect(presentationDefaultInks([text()]).has("text")).toBe(false);
  });

  it("leaves text with its own colour alone and gives shapes ink for their own fill", () => {
    expect(presentationDefaultInks([slide("#ffffff"), text("text", "#ff0000")]).has("text")).toBe(false);
    expect(presentationDefaultInks([slide("#0b3b2e")]).get("slide")).toBe(PRESENTATION_LIGHT_INK);
  });
});
