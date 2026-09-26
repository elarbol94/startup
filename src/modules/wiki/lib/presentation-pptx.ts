import { zipSync } from "fflate";
// The package's `main` is a UMD build inside a `"type": "module"` package, which Node-style
// resolvers mis-load; the ESM build is self-contained (JSZip/txml bundled) and DOM-free.
import { parse as parsePptx } from "pptxtojson/dist/index.js";
import { defaultPresentationSettings, presentationSnapshotSchema, type PresentationElement, type PresentationSnapshot } from "./presentation";
import { assertPptxXmlLimits, checkedXmlText, pptxSlidePaths, pptxSlideTitle, readPptxArchive, readPptxXml, xmlNodes, type PptxFiles, type PptxImportMedia, type PptxImportWarning } from "./presentation-pptx-archive";
import { importLegacyPptx } from "./presentation-pptx-legacy";
import { addPptxElement, type PptxMapContext } from "./presentation-pptx-map";
import { pptxColor, pptxHtmlToText } from "./presentation-pptx-text";

export type { PptxImportWarning } from "./presentation-pptx-archive";
export type PptxImport = { snapshot: PresentationSnapshot; media: PptxImportMedia[]; warnings: PptxImportWarning[] };
type ImportedParts = Omit<PptxImport, "snapshot"> & { elements: PresentationElement[]; steps: PresentationSnapshot["steps"] };

const SLIDE_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const FRAME_WIDTH = 960, FRAME_GAP = 150, MAX_ELEMENTS = 500;

/** Slide parts in the order pptxtojson returns them (content-type overrides sorted by file number). */
function contentTypeSlides(files: PptxFiles) {
  if (!files["[Content_Types].xml"]) return null;
  const slides = xmlNodes(readPptxXml(files, "[Content_Types].xml"), "Override").filter((item) => item.getAttribute("ContentType") === SLIDE_TYPE).map((item) => (item.getAttribute("PartName") ?? "").replace(/^\//, ""));
  const number = (path: string) => Number(/(\d+)\.xml$/.exec(path)?.[1] ?? NaN);
  return slides.length && slides.every((path) => Number.isFinite(number(path))) ? slides.sort((a, b) => number(a) - number(b)) : null;
}

/**
 * Full import through pptxtojson, which resolves placeholder geometry and text styles through
 * the slide layout and master and reads tables, charts, fills and notes. It only ever sees the
 * archive entries that already passed the size, path and entity checks.
 */
async function importWithPptxToJson(files: PptxFiles, parsedOrder: string[]): Promise<ImportedParts> {
  const { paths, cx, cy } = pptxSlidePaths(files);
  const stored = zipSync(files, { level: 0 });
  const deck = await parsePptx(stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.byteLength) as ArrayBuffer, { imageMode: "none", videoMode: "none", audioMode: "none" });
  const factor = FRAME_WIDTH / (deck.size.width || cx / 12700), height = (deck.size.height || cy / 12700) * factor;
  if (!Number.isFinite(height) || height < 100 || height > 2000) throw new Error("Unsupported slide size");
  const elements: PresentationElement[] = [], steps: PresentationSnapshot["steps"] = [], media: PptxImportMedia[] = [], warnings: PptxImportWarning[] = [];
  let serial = 0; const id = () => `pptx-${++serial}`;
  paths.forEach((path, slideIndex) => {
    const slide = deck.slides[parsedOrder.indexOf(path)];
    if (!slide) throw new Error("Slide missing from parsed deck");
    const slideNumber = slideIndex + 1;
    const warn = (code: PptxImportWarning["code"]) => { if (!warnings.some((warning) => warning.slide === slideNumber && warning.code === code)) warnings.push({ slide: slideNumber, code }); };
    const ctx: PptxMapContext = { files, factor, media, id, warn, add: (element) => {
      if (elements.length >= MAX_ELEMENTS) { warn("objectLimit"); return false; }
      elements.push(element); return true;
    } };
    const frameId = id(), x = (slideIndex % 3) * (FRAME_WIDTH + FRAME_GAP), y = Math.floor(slideIndex / 3) * (height + FRAME_GAP);
    const background = slide.fill?.type === "color" ? pptxColor(slide.fill.value) : slide.fill ? (warn("fillSimplified"), undefined) : undefined;
    if (!ctx.add({ id: frameId, type: "frame", x, y, width: FRAME_WIDTH, height, rotation: 0, background: background || "#ffffff", content: { label: pptxSlideTitle(files, path) || String(slideNumber), shape: "rect", color: "#6366f1" } })) throw new Error("Presentation exceeds 500 objects");
    steps.push({ id: id(), elementId: frameId, notes: pptxHtmlToText(slide.note ?? "").slice(0, 5000) });
    if (slide.transition || /<p:timing\b/.test(checkedXmlText(files, path))) warn("animations");
    const ordered = [...slide.layoutElements, ...[...slide.elements].sort((a, b) => a.order - b.order)];
    for (const element of ordered) addPptxElement(element, ctx, frameId, { x, y });
  });
  return { elements, steps, media, warnings };
}

/** Bounded OOXML import. Never follows external relationships or executes embedded objects. */
export async function importPresentationPptx(bytes: Uint8Array, title: string): Promise<PptxImport> {
  const files = readPptxArchive(bytes);
  const parsedOrder = contentTypeSlides(files);
  let parts: ImportedParts;
  if (parsedOrder) {
    assertPptxXmlLimits(files);
    try { parts = await importWithPptxToJson(files, parsedOrder); }
    catch {
      // Packages the full parser cannot read still get the simpler direct import.
      parts = importLegacyPptx(files);
      parts.warnings.unshift({ slide: 0, code: "fallback" });
    }
  } else parts = importLegacyPptx(files);
  const { elements, steps, media, warnings } = parts;
  return { snapshot: presentationSnapshotSchema.parse({ title: title.trim().slice(0, 200) || "PowerPoint", elements, steps, background: "#ffffff", settings: defaultPresentationSettings }), media, warnings };
}
