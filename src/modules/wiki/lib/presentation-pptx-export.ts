// .pptx export: turns the path's section-frame stops into 16:9 slides and packages them as
// PresentationML with fflate. Pure: the caller supplies the snapshot and the image bytes.
import { strToU8, zipSync, type Zippable } from "fflate";
import { presentationCameraBounds, presentationSnapshotSchema, unionBounds, type PresentationBounds, type PresentationElement, type PresentationSnapshot } from "./presentation";
import { contentTypesXml, EMPTY_TREE, NS, notesSlideRels, notesSlideXml, REL_TYPES, relsXml, SLIDE_CX, SLIDE_CY, smallParts, XML_HEAD, xmlEscape, type PptxRel } from "./presentation-pptx-export-parts";
import { elementXml, hexColor, type PptxExportMedia, type PptxExportWarningCode, type SlideContext } from "./presentation-pptx-export-shapes";

export { pptxExportWarningCodes, type PptxExportMedia, type PptxExportWarningCode } from "./presentation-pptx-export-shapes";
export type PptxExportWarning = { slide: number; code: PptxExportWarningCode };
export type PptxExportSlide = { bounds: PresentationBounds; background: string; label: string; notes: string; elements: PresentationElement[] };
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const isSection = (element: PresentationElement | undefined) => element?.type === "frame" && !element.content.isGroup;
const centreInside = (element: PresentationElement, bounds: PresentationBounds) => {
  const x = element.x + element.width / 2, y = element.y + element.height / 2;
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
};

/**
 * What one slide shows: the frame's descendants plus every other object whose centre lies
 * inside the slide area (a group comes with its members). Another section frame found that
 * way contributes only its own fill; its children are judged one by one.
 */
export function pptxSlideElements(elements: PresentationElement[], bounds: PresentationBounds, frameId?: string) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const children = new Map<string, PresentationElement[]>();
  for (const element of elements) if (element.parentId) children.set(element.parentId, [...children.get(element.parentId) ?? [], element]);
  const included = new Set<string>();
  const addTree = (id: string) => { if (included.has(id)) return; included.add(id); for (const child of children.get(id) ?? []) addTree(child.id); };
  const excluded = new Set<string>();
  for (let id: string | undefined = frameId; id; id = byId.get(id)?.parentId) excluded.add(id);
  if (frameId) for (const child of children.get(frameId) ?? []) addTree(child.id);
  for (const element of elements) {
    if (included.has(element.id) || excluded.has(element.id) || !centreInside(element, bounds)) continue;
    if (isSection(element)) included.add(element.id); else addTree(element.id);
  }
  return elements.filter((element) => included.has(element.id));
}

/** Slides in path order: section-frame stops, else one per camera stop, else one fitting everything. */
export function pptxExportSlides(snapshot: PresentationSnapshot): PptxExportSlide[] {
  const { elements } = snapshot;
  const byId = new Map(elements.map((element) => [element.id, element]));
  const stops = snapshot.steps.filter((step) => (!step.action || step.action === "camera") && byId.has(step.elementId));
  const frameStops = stops.filter((step) => isSection(byId.get(step.elementId)));
  if (frameStops.length) return frameStops.map((step) => {
    const frame = byId.get(step.elementId)!;
    const bounds = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    return { bounds, background: frame.background || snapshot.background, label: frame.type === "frame" ? frame.content.label : "", notes: step.notes ?? "", elements: pptxSlideElements(elements, bounds, frame.id) };
  });
  if (stops.length) return stops.map((step) => {
    const bounds = presentationCameraBounds(byId.get(step.elementId)!);
    return { bounds, background: snapshot.background, label: "", notes: step.notes ?? "", elements: pptxSlideElements(elements, bounds) };
  });
  const bounds = unionBounds(elements.map(presentationCameraBounds)) ?? { x: 0, y: 0, width: 960, height: 540 };
  return [{ bounds, background: snapshot.background, label: "", notes: "", elements }];
}

/**
 * Drawing order: section frames under everything, then array order; a group is drawn where
 * its topmost member is, since the canvas renders members as separate layers.
 */
function slideTreeXml(members: PresentationElement[], ctx: SlideContext) {
  const ids = new Set(members.map((element) => element.id));
  const byId = new Map(members.map((element) => [element.id, element]));
  const index = new Map(members.map((element, position) => [element.id, position]));
  const groupOf = (element: PresentationElement) => {
    for (let id = element.parentId; id; id = byId.get(id)?.parentId) {
      const parent = byId.get(id);
      if (!parent) return undefined;
      if (parent.type === "frame" && parent.content.isGroup && ids.has(id)) return id;
    }
    return undefined;
  };
  const childrenOf = new Map<string | undefined, PresentationElement[]>();
  for (const element of members) { const group = groupOf(element); childrenOf.set(group, [...childrenOf.get(group) ?? [], element]); }
  const key = (element: PresentationElement): number => isSection(element) ? -1 : element.type === "frame" ? Math.max(index.get(element.id)!, ...(childrenOf.get(element.id) ?? []).map(key)) : index.get(element.id)!;
  const render = (parent: string | undefined): string => [...childrenOf.get(parent) ?? []]
    .sort((a, b) => key(a) - key(b) || index.get(a.id)! - index.get(b.id)!)
    .map((element) => elementXml(element, ctx, element.type === "frame" ? render(element.id) : "")).join("");
  return render(undefined);
}

const imageExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp" };

/** Builds the .pptx bytes. Images missing from `media` or in formats PowerPoint cannot embed become placeholders. */
export function exportPresentationPptx(input: PresentationSnapshot, media: PptxExportMedia, options: { now?: Date } = {}) {
  const snapshot = presentationSnapshotSchema.parse(input);
  const slides = pptxExportSlides(snapshot);
  const warnings: PptxExportWarning[] = [];
  const files: Zippable = {};
  const xmlFiles: Record<string, string> = {};
  const mediaParts = new Map<string, string>(), mediaExtensions = new Map<string, string>();
  const notes: number[] = [];

  slides.forEach((slide, slideIndex) => {
    const number = slideIndex + 1;
    const rels: PptxRel[] = [{ id: "rId1", type: REL_TYPES.slideLayout, target: "../slideLayouts/slideLayout1.xml" }];
    const addRel = (rel: Omit<PptxRel, "id">) => { const existing = rels.find((item) => item.type === rel.type && item.target === rel.target); if (existing) return existing.id; const id = `rId${rels.length + 1}`; rels.push({ id, ...rel }); return id; };
    const images = new Map<string, { rId: string; bytes: Uint8Array } | null>();
    let shapeId = 1;
    const scale = Math.min(SLIDE_CX / slide.bounds.width, SLIDE_CY / slide.bounds.height);
    const ctx: SlideContext = {
      scale,
      originX: slide.bounds.x - (SLIDE_CX / scale - slide.bounds.width) / 2,
      originY: slide.bounds.y - (SLIDE_CY / scale - slide.bounds.height) / 2,
      nextId: () => ++shapeId,
      warn: (code) => { if (!warnings.some((warning) => warning.slide === number && warning.code === code)) warnings.push({ slide: number, code }); },
      hyperlink: (href) => addRel({ type: REL_TYPES.hyperlink, target: href, external: true }),
      image: (attachmentId) => {
        if (images.has(attachmentId)) return images.get(attachmentId)!;
        const item = media[attachmentId], extension = item && imageExtensions[item.mime];
        let result: { rId: string; bytes: Uint8Array } | null = null;
        if (!item) ctx.warn("missingMedia");
        else if (!extension) ctx.warn("unsupportedImage");
        else {
          let part = mediaParts.get(attachmentId);
          if (!part) {
            part = `ppt/media/image${mediaParts.size + 1}.${extension}`;
            mediaParts.set(attachmentId, part); mediaExtensions.set(extension, item.mime);
            files[part] = [item.bytes, { level: 0 }];
          }
          result = { rId: addRel({ type: REL_TYPES.image, target: `../${part.slice(4)}` }), bytes: item.bytes };
        }
        images.set(attachmentId, result);
        return result;
      },
    };
    const tree = slideTreeXml(slide.elements, ctx);
    const background = hexColor(slide.background)?.hex ?? "FFFFFF";
    if (slide.notes.trim()) {
      notes.push(number);
      addRel({ type: REL_TYPES.notesSlide, target: `../notesSlides/notesSlide${number}.xml` });
      xmlFiles[`ppt/notesSlides/notesSlide${number}.xml`] = notesSlideXml(slide.notes);
      xmlFiles[`ppt/notesSlides/_rels/notesSlide${number}.xml.rels`] = relsXml(notesSlideRels(number));
    }
    xmlFiles[`ppt/slides/slide${number}.xml`] = `${XML_HEAD}<p:sld ${NS}><p:cSld${slide.label.trim() ? ` name="${xmlEscape(slide.label.trim().slice(0, 200))}"` : ""}><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${EMPTY_TREE}${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    xmlFiles[`ppt/slides/_rels/slide${number}.xml.rels`] = relsXml(rels);
  });

  const parts: Record<string, string> = { "[Content_Types].xml": contentTypesXml(slides.length, notes, mediaExtensions), ...smallParts(snapshot.title, slides.length, options.now ?? new Date()), ...xmlFiles };
  const archive: Zippable = {};
  for (const [name, xml] of Object.entries(parts)) archive[name] = strToU8(xml);
  return { bytes: zipSync({ ...archive, ...files }, { level: 6 }), warnings, slides: slides.length };
}

/** A download name without path separators, quotes or control characters. */
export function pptxFileName(title: string) {
  const base = title.normalize("NFC").replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "presentation";
  const ascii = base.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[%;,]/g, "").trim() || "presentation";
  return { ascii: `${ascii}.pptx`, encoded: encodeURIComponent(`${base}.pptx`) };
}
