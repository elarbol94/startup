// Direct OOXML reader kept as the fallback for minimal or non-standard packages (for
// example hand-written archives without [Content_Types].xml) that the full parser rejects.
import type { Element as XmlElement } from "@xmldom/xmldom";
import type { PresentationElement, PresentationSnapshot, PresentationTextElement } from "./presentation";
import { pptxImageMime, pptxSlidePaths, pptxSlideTitle, readPptxRelations, readPptxXml, resolvePptxPath, xmlChildren as direct, xmlNodes as nodes, type PptxFiles, type PptxImportMedia, type PptxImportWarning } from "./presentation-pptx-archive";

const attr = (element: XmlElement | undefined, key: string, fallback = 0) => Number(element?.getAttribute(key) ?? fallback) || fallback;
const hex = (element?: XmlElement) => { const value = element && nodes(element, "srgbClr")[0]?.getAttribute("val"); return value && /^[a-f\d]{6}$/i.test(value) ? `#${value}` : ""; };

export function importLegacyPptx(files: PptxFiles) {
  const { paths, cx, cy } = pptxSlidePaths(files);
  const factor = 960 / cx, width = 960, height = cy * factor;
  if (height < 100 || height > 2000) throw new Error("Unsupported slide size");
  const elements: PresentationElement[] = [], steps: PresentationSnapshot["steps"] = [], media: PptxImportMedia[] = [], warnings: PptxImportWarning[] = [];
  let serial = 0; const id = () => `pptx-${++serial}`;
  paths.forEach((path, slideIndex) => {
    const slideNumber = slideIndex + 1;
    const warn = (code: PptxImportWarning["code"]) => { if (!warnings.some((warning) => warning.slide === slideNumber && warning.code === code)) warnings.push({ slide: slideNumber, code }); };
    const slide = readPptxXml(files, path), slideRels = readPptxRelations(files, path);
    const frameId = id(), x = (slideIndex % 3) * (width + 150), y = Math.floor(slideIndex / 3) * (height + 150);
    elements.push({ id: frameId, type: "frame", x, y, width, height, rotation: 0, background: hex(nodes(slide, "bgPr")[0]) || "#ffffff", content: { label: pptxSlideTitle(files, path) || String(slideNumber), shape: "rect", color: "#6366f1" } });
    const step = { id: id(), elementId: frameId, notes: "" }; steps.push(step);
    if (nodes(slide, "timing").length || nodes(slide, "transition").length) warn("animations");
    // Masters and theme inheritance are not rendered as hidden, uneditable slide images.
    if ([...slideRels.values()].some((rel) => /slideLayout$/.test(rel.type))) warn("formatting");
    const visit = (tree: XmlElement, parentId: string, transform: { x: number; y: number; sx: number; sy: number }) => {
      for (const node of Array.from(tree.childNodes).filter((child): child is XmlElement => child.nodeType === 1)) {
        if (!["sp", "pic", "grpSp", "graphicFrame", "cxnSp"].includes(node.localName ?? "")) continue;
        if (node.localName === "graphicFrame") { warn("unsupported"); continue; }
        const properties = direct(node, node.localName === "grpSp" ? "grpSpPr" : "spPr")[0];
        const xf = properties && nodes(properties, "xfrm")[0];
        const off = xf && nodes(xf, "off")[0], ext = xf && nodes(xf, "ext")[0];
        const box = { x: transform.x + attr(off, "x") * transform.sx, y: transform.y + attr(off, "y") * transform.sy,
          width: Math.max(20, Math.min(20000, attr(ext, "cx", 300 / factor) * transform.sx)), height: Math.max(20, Math.min(20000, attr(ext, "cy", 80 / factor) * transform.sy)), rotation: Math.round(attr(xf, "rot") / 60000) % 360 };
        if (!xf) warn("formatting");
        const elementId = id();
        if (node.localName === "grpSp") {
          elements.push({ id: elementId, parentId, type: "frame", ...box, content: { label: "", shape: "none", color: "", isGroup: true } });
          const childOff = xf && nodes(xf, "chOff")[0], childExt = xf && nodes(xf, "chExt")[0];
          const sx = box.width / attr(childExt, "cx", box.width / transform.sx), sy = box.height / attr(childExt, "cy", box.height / transform.sy);
          if (box.rotation) warn("formatting");
          visit(node, elementId, { x: box.x - attr(childOff, "x") * sx, y: box.y - attr(childOff, "y") * sy, sx, sy }); continue;
        }
        if (node.localName === "pic") {
          const blip = nodes(node, "blip")[0], ref = blip?.getAttribute("r:embed") ?? blip?.getAttribute("r:link"), rel = ref ? slideRels.get(ref) : undefined;
          if (!rel || rel.external) { warn(rel?.external ? "externalMedia" : "missingMedia"); continue; }
          const imagePath = resolvePptxPath(path, rel.target), image = files[imagePath], mime = pptxImageMime(imagePath);
          if (!image || !mime) { warn("missingMedia"); continue; }
          let item = media.find((entry) => entry.name === imagePath);
          if (!item) { item = { key: id(), name: imagePath, mime, bytes: image }; media.push(item); }
          if (nodes(node, "srcRect").length) warn("formatting");
          elements.push({ id: elementId, parentId, type: "image", ...box, content: { attachmentId: item.key, alt: nodes(node, "cNvPr")[0]?.getAttribute("descr")?.slice(0, 500) || "" } }); continue;
        }
        const paragraphs = nodes(node, "txBody")[0];
        if (paragraphs && nodes(paragraphs, "t").length) {
          if (properties && (direct(properties, "solidFill").length || direct(properties, "ln").length || nodes(properties, "custGeom").length)) warn("formatting");
          const runs: NonNullable<PresentationTextElement["content"]["runs"]> = [];
          nodes(paragraphs, "p").forEach((paragraph, index) => {
            if (index) runs.push({ text: "\n" });
            for (const text of nodes(paragraph, "t")) {
              const props = text.parentNode?.nodeType === 1 ? nodes(text.parentNode as XmlElement, "rPr")[0] : undefined;
              runs.push({ text: text.textContent ?? "", bold: props?.getAttribute("b") === "1", italic: props?.getAttribute("i") === "1", underline: props?.getAttribute("u") === "sng", color: hex(props) || undefined });
            }
          });
          const text = runs.map((run) => run.text).join("");
          if (text.length > 5000 || runs.length > 200) throw new Error("Text exceeds presentation limits");
          const firstProps = nodes(paragraphs, "rPr")[0], pProps = nodes(paragraphs, "pPr")[0];
          const align = pProps?.getAttribute("algn");
          elements.push({ id: elementId, parentId, type: "text", ...box, content: { text, runs, fontSize: Math.round(Math.max(8, Math.min(400, attr(firstProps, "sz", 2400) / 100 * 4 / 3))), bold: false, color: hex(firstProps) || "#172033", align: align === "ctr" ? "center" : align === "r" ? "right" : "left", font: "sans" } });
        } else {
          const preset = properties && nodes(properties, "prstGeom")[0]?.getAttribute("prst");
          if (preset && !["rect", "roundRect", "ellipse", "line", "rightArrow"].includes(preset)) warn("unsupported");
          const line = properties && direct(properties, "ln")[0];
          elements.push({ id: elementId, parentId, type: "shape", ...box, content: { shape: preset === "ellipse" ? "ellipse" : preset === "rightArrow" ? "arrow" : node.localName === "cxnSp" || preset === "line" ? "line" : "rect", fill: hex(properties && direct(properties, "solidFill")[0]), stroke: hex(line), strokeWidth: Math.min(200, attr(line, "w", 19050) * factor), opacity: 1 } });
        }
      }
    };
    const tree = nodes(slide, "spTree")[0];
    if (tree) visit(tree, frameId, { x, y, sx: factor, sy: factor });
    for (const rel of slideRels.values()) if (rel.type.endsWith("/notesSlide") && !rel.external) {
      const notes = readPptxXml(files, resolvePptxPath(path, rel.target));
      step.notes = nodes(notes, "sp").filter((shape) => nodes(shape, "ph")[0]?.getAttribute("type") === "body").flatMap((shape) => nodes(shape, "t").map((text) => text.textContent ?? "")).join("\n").slice(0, 5000);
    }
    if (elements.length > 500) throw new Error("Presentation exceeds 500 objects");
  });
  return { elements, steps, media, warnings };
}
