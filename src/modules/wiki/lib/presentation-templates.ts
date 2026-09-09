import { presentationPalettes, type PresentationPaletteId } from "./presentation-template-palettes";
import { buildSpatialTemplate, spatialTemplateIds, isSpatialTemplateId } from "./presentation-spatial-templates";
import type { PresentationElement, PresentationFrameElement, PresentationStep, PresentationTextElement } from "./presentation";
import { presentationTemplateCopy, type TemplateCopy, type TemplateSection } from "./presentation-template-copy";

const slideTemplateIds = ["pitch", "report", "roadmap", "workshop", "demo", "portfolio", "timeline", "hub", "mindmap", "lesson"] as const;
export const presentationTemplateIds = [...spatialTemplateIds, ...slideTemplateIds] as const;
export type PresentationTemplateId = (typeof presentationTemplateIds)[number];
export type PresentationTemplate = {
  id: PresentationTemplateId;
  elements: PresentationElement[];
  steps: PresentationStep[];
};
type Palette = { paper: string; ink: string; muted: string; accent: string; soft: string; cover: string; coverInk: string };
type Design = { palette: Palette; cover: "orbit" | "editorial" | "journey" | "cards"; layout: "grid" | "radial" | "journey"; serif?: boolean };
const ink = "#172033";
const designs: Record<(typeof slideTemplateIds)[number], Design> = {
  pitch: { palette: { paper: "#fffaf5", ink, muted: "#656b76", accent: "#b34c35", soft: "#f3e6dc", cover: "#172033", coverInk: "#fffaf5" }, cover: "orbit", layout: "grid" },
  report: { palette: { paper: "#ffffff", ink, muted: "#606c80", accent: "#3456a6", soft: "#edf1fa", cover: "#edf1fa", coverInk: ink }, cover: "cards", layout: "grid" },
  roadmap: { palette: { paper: "#fafcf8", ink: "#183e36", muted: "#5b7268", accent: "#30674e", soft: "#e7eee1", cover: "#183e36", coverInk: "#f3f6e9" }, cover: "journey", layout: "journey" },
  workshop: { palette: { paper: "#fffcf5", ink: "#42352b", muted: "#776a5c", accent: "#a45424", soft: "#f4ead1", cover: "#f4ead1", coverInk: "#42352b" }, cover: "cards", layout: "grid" },
  demo: { palette: { paper: "#f8faff", ink, muted: "#626b82", accent: "#5546a0", soft: "#ece9f8", cover: "#292342", coverInk: "#f8f5ff" }, cover: "orbit", layout: "grid" },
  portfolio: { palette: { paper: "#faf7f1", ink: "#35392f", muted: "#6d7263", accent: "#626b43", soft: "#eae9db", cover: "#faf7f1", coverInk: "#35392f" }, cover: "editorial", layout: "grid", serif: true },
  timeline: { palette: { paper: "#fffaf5", ink: "#473429", muted: "#7a6b61", accent: "#9b5335", soft: "#f0e3d5", cover: "#f0e3d5", coverInk: "#473429" }, cover: "journey", layout: "journey", serif: true },
  hub: { palette: { paper: "#f7fbfa", ink: "#164b4c", muted: "#587475", accent: "#287779", soft: "#e1efec", cover: "#164b4c", coverInk: "#f4faf4" }, cover: "orbit", layout: "radial" },
  mindmap: { palette: { paper: "#fff9fa", ink: "#542d42", muted: "#826779", accent: "#9b4266", soft: "#f2e2e9", cover: "#f2e2e9", coverInk: "#542d42" }, cover: "orbit", layout: "radial" },
  lesson: { palette: { paper: "#f9fafc", ink: "#253e62", muted: "#67758a", accent: "#42699c", soft: "#e8eef6", cover: "#253e62", coverInk: "#f4f8ff" }, cover: "editorial", layout: "journey" },
};

/** Every visual is ordinary editable canvas content, shared by previews and saved decks. */
function buildTemplate(id: PresentationTemplateId, locale: "de" | "en", title?: string, paletteId: PresentationPaletteId = "original"): PresentationTemplate {
  if (isSpatialTemplateId(id)) return buildSpatialTemplate(id, locale, title, paletteId === "original" ? undefined : presentationPalettes[paletteId]);
  const copy: TemplateCopy = presentationTemplateCopy[locale][id];
  const design = designs[id];
  const p = paletteId === "original" ? design.palette : presentationPalettes[paletteId];
  const elements: PresentationElement[] = [];
  const steps: PresentationStep[] = [];
  const de = locale === "de";
  const total = copy.sections.length + 1;

  function slide(key: string, x: number, y: number, background: string, notes: string, label: string): PresentationFrameElement {
    const element: PresentationFrameElement = { id: `${id}-${key}`, type: "frame", x, y, width: 1200, height: 675, rotation: 0, background, content: { label, shape: "rect", color: "transparent" } };
    elements.push(element);
    steps.push({ id: `${id}-step-${steps.length}`, elementId: element.id, notes });
    return element;
  }
  function text(parent: PresentationFrameElement, key: string, x: number, y: number, width: number, height: number, value: string, size = 24, color = p.ink, bold = false, serif = false) {
    const element: PresentationTextElement = { id: `${parent.id}-${key}`, type: "text", parentId: parent.id, x: parent.x + x, y: parent.y + y, width, height, rotation: 0, content: { text: value, fontSize: size, color, bold, align: "left", font: serif ? "georgia" : "sans" } };
    elements.push(element);
    return element;
  }
  function shape(parent: PresentationFrameElement, key: string, x: number, y: number, width: number, height: number, fill: string, kind: "rect" | "ellipse" | "line" = "rect", stroke = fill, strokeWidth = 0) {
    elements.push({ id: `${parent.id}-${key}`, type: "shape", parentId: parent.id, x: parent.x + x, y: parent.y + y, width, height, rotation: 0, content: { shape: kind, fill, stroke, strokeWidth, opacity: 1 } });
  }
  function footer(parent: PresentationFrameElement, index: number, color: string) {
    shape(parent, "footer-rule", 64, 600, 1072, 20, "", "line", color, 1);
    text(parent, "footer", 64, 632, 900, 20, de ? "[Name / Team]     ·     [Datum]" : "[Name / Team]     ·     [Date]", 14, color);
    text(parent, "page", 1070, 632, 66, 20, `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, 14, color);
  }

  const cover = slide("cover", 0, 0, p.cover, de ? "Thema, Publikum und Ziel der Präsentation nennen. Platzhalter durch eigene Inhalte ersetzen; Quellen und Beispiele ergänzen." : "Introduce the topic, audience and goal. Replace prompts with your own content; add sources and examples.", de ? "Titel" : "Title");
  text(cover, "eyebrow", 64, 56, 700, 24, de ? "PERSPEKTIVEN  /  NÄCHSTE SCHRITTE" : "PERSPECTIVES  /  NEXT STEPS", 16, p.coverInk, true);
  const coverTitle = text(cover, "title", 64, 156, 650, 250, title?.trim() || copy.title, title?.trim() ? Math.min(64, Math.floor(Math.sqrt(650 * 200 / (title.trim().length * 1.15)))) : 64, p.coverInk, !design.serif, design.serif);
  // Stable title ID also makes existing editor links and selectors useful for new decks.
  coverTitle.id = `${id}-title`;
  text(cover, "subtitle", 68, 432, 585, 94, copy.subtitle, 25, p.coverInk);
  if (design.cover === "orbit") {
    shape(cover, "orbit-outer", 786, 142, 320, 320, "", "ellipse", p.coverInk, 2);
    shape(cover, "orbit-inner", 854, 210, 184, 184, "", "ellipse", p.coverInk, 2);
    shape(cover, "orbit-center", 905, 261, 82, 82, p.coverInk, "ellipse");
    shape(cover, "orbit-dot", 1056, 183, 44, 44, p.accent, "ellipse");
    text(cover, "orbit-caption", 796, 510, 320, 42, de ? "VON DER IDEE ZUR WIRKUNG" : "FROM IDEA TO IMPACT", 15, p.coverInk, true);
  } else if (design.cover === "editorial") {
    shape(cover, "art-back", 798, 132, 300, 384, p.soft);
    shape(cover, "art-disc", 824, 157, 248, 248, p.accent, "ellipse");
    shape(cover, "art-front", 824, 298, 248, 194, p.ink);
    text(cover, "art-number", 844, 382, 215, 102, "01—", 80, p.paper, false, design.serif);
  } else if (design.cover === "journey") {
    shape(cover, "journey-line", 755, 450, 353, 20, "", "line", p.coverInk, 2);
    [0, 1, 2].forEach((i) => {
      const x = 770 + i * 126;
      shape(cover, `milestone-${i}`, x, 332 - i * 80, 82, 100 + i * 80, p.coverInk);
      text(cover, `milestone-number-${i}`, x + 15, 352 - i * 80, 60, 40, `0${i + 1}`, 27, p.cover, true);
    });
    text(cover, "journey-caption", 762, 510, 350, 42, de ? "JETZT     →     NÄCHSTES     →     ZIEL" : "NOW     →     NEXT     →     GOAL", 15, p.coverInk, true);
  } else {
    [0, 1, 2].forEach((i) => {
      const y = 145 + i * 125;
      shape(cover, `card-${i}`, 780, y, 340, 106, i === 1 ? p.ink : p.paper);
      text(cover, `card-number-${i}`, 802, y + 23, 64, 52, `0${i + 1}`, 38, i === 1 ? p.paper : p.accent, true);
      text(cover, `card-label-${i}`, 880, y + 34, 210, 52, copy.sections[i].title, 22, i === 1 ? p.paper : p.ink, true);
    });
  }
  footer(cover, 0, p.coverInk);

  function cards(parent: PresentationFrameElement, section: TemplateSection, mode: "cards" | "rows" | "metrics" | "statement") {
    if (mode === "statement") {
      shape(parent, "statement-panel", 64, 285, 350, 270, p.ink);
      text(parent, "statement-number", 90, 310, 270, 110, "→", 88, p.paper);
      text(parent, "statement-caption", 92, 458, 290, 66, de ? "KLARHEIT SCHAFFT\nBEWEGUNG." : "CLARITY CREATES\nMOMENTUM.", 23, p.paper, true);
    }
    section.items.forEach((item, i) => {
      const [heading, ...body] = item.split("\n");
      if (mode === "rows" || mode === "statement") {
        const x = mode === "statement" ? 460 : 64;
        const y = 278 + i * 104;
        const width = 1136 - x;
        shape(parent, `row-rule-${i}`, x, y + 84, width, 20, "", "line", p.soft, 2);
        text(parent, `number-${i}`, x, y + 9, 70, 42, `0${i + 1}`, 28, p.accent, true);
        text(parent, `item-title-${i}`, x + 90, y + 4, width - 95, 32, heading, 24, p.ink, true);
        text(parent, `item-body-${i}`, x + 90, y + 43, width - 95, 52, body.join("\n"), 21, p.muted);
      } else {
        const x = 64 + i * 366;
        shape(parent, `card-${i}`, x, 284, 340, 282, p.soft);
        text(parent, `number-${i}`, x + 24, 308, 285, mode === "metrics" ? 90 : 54, mode === "metrics" ? "—" : `0${i + 1}`, mode === "metrics" ? 72 : 34, p.accent, true);
        text(parent, `item-title-${i}`, x + 24, mode === "metrics" ? 420 : 400, 292, 62, heading, 25, p.ink, true);
        text(parent, `item-body-${i}`, x + 24, mode === "metrics" ? 490 : 478, 292, 75, body.join("\n"), 21, p.muted);
      }
    });
  }

  copy.sections.forEach((section, i) => {
    const index = i + 1;
    let x = (index % 2) * 1440, y = Math.floor(index / 2) * 855;
    if (design.layout === "journey") { x = index * 1440; y = 0; }
    if (design.layout === "radial") {
      const positions = [[0, -855], [1440, 0], [0, 855], [-1440, 0], [1440, 855]];
      [x, y] = positions[i];
    }
    const key = id === "pitch" ? ["problem", "solution", "ask"][i] : `section-${index}`;
    const parent = slide(key, x, y, p.paper, `${section.prompt}\n\n${section.items.join("\n\n")}`, section.title);
    text(parent, "eyebrow", 64, 52, 1000, 24, `${String(index).padStart(2, "0")}  /  ${section.title.toLocaleUpperCase(locale)}`, 16, p.accent, true);
    text(parent, "heading", 64, 116, 1065, 100, section.title, 51, p.ink, !design.serif, design.serif);
    text(parent, "prompt", 68, 218, 1064, 58, section.prompt, 25, p.muted);
    const mode = id === "report" && i === 1 ? "metrics"
      : (id === "pitch" && i !== 1) || (id === "portfolio" && i === 0) ? "statement"
      : (id === "workshop" && i !== 2) || (i % 3 === 2) ? "rows" : "cards";
    cards(parent, section, mode);
    footer(parent, index, p.muted);
  });
  return { id, elements, steps };
}

export const presentationTemplates = Object.fromEntries(presentationTemplateIds.map((id) => [id, buildTemplate(id, "en")])) as Record<PresentationTemplateId, PresentationTemplate>;

/** Fresh objects on each call: previewing or editing one deck never changes the catalog. */
export function localizedPresentationTemplate(template: PresentationTemplate, locale: "de" | "en", title?: string, paletteId: PresentationPaletteId = "original"): PresentationTemplate {
  return buildTemplate(template.id, locale, title, paletteId);
}
