import { describe, expect, it } from "vitest";
import { presentationElementsSchema, presentationStepsSchema, normalizeSteps } from "./presentation";
import { localizedPresentationTemplate, presentationTemplateIds, presentationTemplates } from "./presentation-templates";

describe("built-in presentation templates", () => {
  for (const id of presentationTemplateIds) {
    const template = presentationTemplates[id];

    it(`${id}: elements parse against the canvas schema`, () => {
      expect(() => presentationElementsSchema.parse(template.elements)).not.toThrow();
    });

    it(`${id}: steps parse against the path schema`, () => {
      expect(() => presentationStepsSchema.parse(template.steps)).not.toThrow();
    });

    it(`${id}: every step points at an element that actually exists`, () => {
      // A step surviving normalizeSteps is the same test savePresentation applies on
      // write — if a template's path were broken this would silently drop stops.
      expect(normalizeSteps(template.steps, template.elements)).toEqual(template.steps);
    });
  }
});


describe("localized, editable template layouts", () => {
  for (const locale of ["de", "en"] as const) {
    for (const id of presentationTemplateIds) {
      it(`${id} (${locale}): keeps every slide's content within its editable parent`, () => {
        const template = localizedPresentationTemplate(presentationTemplates[id], locale);
        expect(() => presentationElementsSchema.parse(template.elements)).not.toThrow();
        const byId = new Map(template.elements.map((element) => [element.id, element]));
        for (const step of template.steps) {
          const frame = byId.get(step.elementId)!;
          expect(frame.type).toBe("frame");
          expect(frame.width / frame.height).toBeCloseTo(16 / 9);
          expect(step.notes!.length).toBeGreaterThan(30);
          const children = template.elements.filter((element) => element.parentId === frame.id);
          expect(children.some((element) => element.type === "text")).toBe(true);
          for (const child of children) {
            expect(child.x).toBeGreaterThanOrEqual(frame.x);
            expect(child.y).toBeGreaterThanOrEqual(frame.y);
            expect(child.x + child.width).toBeLessThanOrEqual(frame.x + frame.width);
            expect(child.y + child.height).toBeLessThanOrEqual(frame.y + frame.height);
          }
        }
      });
    }
  }

  it("localizes cover, body and notes without mutating the catalog or another deck", () => {
    const before = JSON.stringify(presentationTemplates);
    const german = localizedPresentationTemplate(presentationTemplates.pitch, "de", "Unsere Strategie");
    const english = localizedPresentationTemplate(presentationTemplates.pitch, "en");
    expect(german.elements.find((element) => element.id === "pitch-title")).toMatchObject({ content: { text: "Unsere Strategie" } });
    expect(german.steps[1].notes).toContain("Welches konkrete Problem");
    expect(english.steps[1].notes).toContain("What specific problem");
    german.elements[0].x = 123;
    expect(english.elements[0].x).toBe(0);
    expect(JSON.stringify(presentationTemplates)).toBe(before);
  });
});


describe("spatial navigation", () => {
  for (const id of ["topicmap", "journey", "layers", "comparison"] as const) {
    it(`${id}: moves from a shared overview into smaller regions and back`, () => {
      const template = presentationTemplates[id];
      const root = template.elements.find((element) => element.id === template.steps[0].elementId)!;
      expect(template.steps.at(-1)?.elementId).toBe(root.id);
      const targets = template.steps.slice(1, -1).map((step) => template.elements.find((element) => element.id === step.elementId)!);
      expect(targets.some((target) => target.width < root.width / 2)).toBe(true);
      expect(template.elements.filter((element) => element.type === "frame" && element.id !== root.id).every((frame) => Boolean(frame.parentId))).toBe(true);
    });
  }
  it("layers has progressively nested detail, not disconnected pages", () => {
    const { elements, steps } = presentationTemplates.layers;
    for (let index = 1; index <= 3; index++) {
      const child = elements.find((element) => element.id === steps[index].elementId)!;
      expect(child.parentId).toBe(steps[index - 1].elementId);
    }
  });
});

describe("spatial template alignment", () => {
  const frame = (id: "topicmap" | "journey" | "layers" | "comparison", key: string) => presentationTemplates[id].elements.find((element) => element.id === `${id}-${key}`)!;
  const cx = (e: ReturnType<typeof frame>) => e.x + e.width / 2;
  const cy = (e: ReturnType<typeof frame>) => e.y + e.height / 2;
  it("centers topic branches on the hub axes with symmetric spacing", () => {
    const center = frame("topicmap", "center");
    expect(cx(frame("topicmap", "north"))).toBe(cx(center));
    expect(cx(frame("topicmap", "south"))).toBe(cx(center));
    expect(cy(frame("topicmap", "east"))).toBe(cy(center));
    expect(cy(frame("topicmap", "west"))).toBe(cy(center));
    expect(cx(center) - cx(frame("topicmap", "west"))).toBe(cx(frame("topicmap", "east")) - cx(center));
    expect(cy(center) - cy(frame("topicmap", "north"))).toBe(cy(frame("topicmap", "south")) - cy(center));
  });
  it("spaces journey stops evenly with equal outer margins", () => {
    const stops = [0, 1, 2, 3].map((i) => frame("journey", `milestone-${i}`));
    const gap = stops[1].x - stops[0].x;
    expect(stops[2].x - stops[1].x).toBe(gap);
    expect(stops[3].x - stops[2].x).toBe(gap);
    expect(stops[0].x).toBe(3200 - stops[3].x - stops[3].width);
  });
  it("insets nested layers equally from the right and bottom", () => {
    for (const [parentKey, childKey] of [["topic", "detail"], ["detail", "evidence"]]) {
      const parent = frame("layers", parentKey), child = frame("layers", childKey);
      expect(parent.x + parent.width - child.x - child.width).toBeCloseTo(parent.y + parent.height - child.y - child.height);
    }
  });
  it("centers the comparison conclusion between equal-sized perspectives", () => {
    const left = frame("comparison", "left"), right = frame("comparison", "right"), conclusion = frame("comparison", "synthesis");
    expect(left.width).toBe(right.width);
    expect(left.y).toBe(right.y);
    expect(cx(conclusion)).toBe((cx(left) + cx(right)) / 2);
  });
});

describe("template palettes", () => {
  it("changes colors without changing geometry or navigation, and restores original colors", async () => {
    const { presentationPaletteIds } = await import("./presentation-template-palettes");
    for (const id of presentationTemplateIds) {
      const original = localizedPresentationTemplate(presentationTemplates[id], "en");
      const geometry = (t: typeof original) => t.elements.map(({ id, x, y, width, height, parentId }) => ({ id, x, y, width, height, parentId }));
      for (const palette of presentationPaletteIds) {
        const themed = localizedPresentationTemplate(presentationTemplates[id], "en", undefined, palette);
        expect(() => presentationElementsSchema.parse(themed.elements)).not.toThrow();
        expect(geometry(themed)).toEqual(geometry(original));
        expect(themed.steps).toEqual(original.steps);
        if (palette !== "original") expect(themed.elements).not.toEqual(original.elements);
      }
      expect(localizedPresentationTemplate(presentationTemplates[id], "en", undefined, "original")).toEqual(original);
    }
  });
});
