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
