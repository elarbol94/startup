import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { defaultPresentationSettings, type PresentationElement, type PresentationSnapshot } from "./presentation";
import { importPresentationPptx } from "./presentation-pptx";
import { exportPresentationPptx, pptxExportSlides, pptxFileName, pptxSlideElements } from "./presentation-pptx-export";
import { imagePlacement, imageSize, srcRectToImageCrop } from "./presentation-pptx-image";
import { readPptxXml, resolvePptxPath, xmlNodes } from "./presentation-pptx-archive";

/** A PNG header is all the exporter reads; the importer never decodes pixels. */
function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width); new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

const frame = (id: string, x: number, label: string, extra: Partial<PresentationElement> = {}) => ({ id, type: "frame", x, y: 0, width: 960, height: 540, rotation: 0, content: { label, shape: "rect", color: "#6366f1" }, ...extra }) as PresentationElement;
const elements: PresentationElement[] = [
  frame("f1", 0, "Intro", { background: "#fef3c7" }),
  frame("f2", 1200, "Details"),
  { id: "title", parentId: "f1", type: "text", x: 80, y: 60, width: 600, height: 80, rotation: 0, content: { text: "Hello bold world", runs: [{ text: "Hello " }, { text: "bold", bold: true, color: "#ff0000" }, { text: " world", href: "https://example.com" }], fontSize: 40, bold: false, color: "#172033", align: "center", font: "serif" } },
  { id: "list", parentId: "f1", type: "text", x: 80, y: 200, width: 600, height: 120, rotation: 0, content: { text: "One\nTwo", fontSize: 24, bold: false, color: "", align: "left", list: "bullet", italic: true } },
  { id: "box", parentId: "f1", type: "shape", x: 700, y: 200, width: 200, height: 100, rotation: 30, content: { shape: "roundedRect", fill: "#2e86de", stroke: "#1b4f72", strokeWidth: 2, opacity: 0.5, cornerRadius: 20 } },
  { id: "arrow", parentId: "f1", type: "shape", x: 80, y: 400, width: 300, height: 40, rotation: 0, content: { shape: "arrow", fill: "", stroke: "#6366f1", strokeWidth: 4, opacity: 1, dash: "dash" } },
  { id: "both", type: "shape", x: 500, y: 400, width: 200, height: 40, rotation: 90, content: { shape: "doubleArrow", fill: "", stroke: "", strokeWidth: 3, opacity: 1 } },
  { id: "group", parentId: "f2", type: "frame", x: 1300, y: 100, width: 400, height: 200, rotation: 0, content: { label: "", shape: "none", color: "", isGroup: true } },
  { id: "ellipse", parentId: "group", type: "shape", x: 1300, y: 100, width: 150, height: 150, rotation: 0, content: { shape: "ellipse", fill: "#10b981", stroke: "", strokeWidth: 0, opacity: 1 } },
  { id: "diamond", parentId: "group", type: "shape", x: 1500, y: 100, width: 150, height: 150, rotation: 0, content: { shape: "diamond", fill: "#f59e0b", stroke: "#000000", strokeWidth: 1, opacity: 1, dash: "dot" } },
  { id: "photo", parentId: "f2", type: "image", x: 1300, y: 350, width: 200, height: 100, rotation: 0, content: { attachmentId: "att-photo", alt: "Team photo", fit: "cover", mask: "circle" } },
  { id: "chart", parentId: "f2", type: "chart", x: 1800, y: 300, width: 300, height: 200, rotation: 0, content: { title: "Revenue", kind: "bar", data: [{ label: "Q1", value: 12 }] } },
  // Outside every frame: on no slide.
  { id: "far", type: "text", x: 5000, y: 5000, width: 100, height: 40, rotation: 0, content: { text: "Far away", fontSize: 20, bold: false, color: "", align: "left" } },
];
const deck: PresentationSnapshot = {
  title: "Quarterly / Review", elements, background: "#ffffff", settings: defaultPresentationSettings,
  steps: [{ id: "s1", elementId: "f1", notes: "Welcome everyone.\nKeep it short." }, { id: "s2", elementId: "arrow", action: "fadeIn" }, { id: "s3", elementId: "f2" }],
};
const media = { "att-photo": { mime: "image/png", bytes: png(400, 100) } };
const exported = () => {
  const result = exportPresentationPptx(deck, media, { now: new Date("2026-10-20T10:00:00Z") });
  const files = unzipSync(result.bytes);
  return { ...result, files, xml: (name: string) => strFromU8(files[name]) };
};

describe("PowerPoint export: slides", () => {
  it("makes one slide per section-frame stop, in path order, ignoring fade steps", () => {
    const slides = pptxExportSlides(deck);
    expect(slides.map((slide) => slide.label)).toEqual(["Intro", "Details"]);
    expect(slides[0]).toMatchObject({ background: "#fef3c7", notes: "Welcome everyone.\nKeep it short.", bounds: { x: 0, y: 0, width: 960, height: 540 } });
    // Descendants plus the unparented double arrow whose centre lies inside the frame.
    expect(slides[0].elements.map((element) => element.id)).toEqual(["title", "list", "box", "arrow", "both"]);
    expect(slides[1].elements.map((element) => element.id)).toEqual(["group", "ellipse", "diamond", "photo", "chart"]);
  });

  it("takes only the fill of another section frame found by its centre, never its children", () => {
    const inner = [frame("big", -100, "Big", { width: 3000 }), frame("small", 100, "Small", { width: 200, height: 100 }), { ...elements[2], parentId: "big", x: 2500 }];
    expect(pptxSlideElements(inner, { x: 0, y: 0, width: 960, height: 540 }, "small").map((element) => element.id)).toEqual([]);
    expect(pptxSlideElements(inner, { x: 1000, y: 0, width: 960, height: 540 }).map((element) => element.id)).toEqual(["big"]);
  });

  it("falls back to one slide per camera stop, then to one slide fitting everything", () => {
    const noFrames = { ...deck, steps: [{ id: "a", elementId: "title" }] };
    expect(pptxExportSlides(noFrames)).toEqual([expect.objectContaining({ bounds: { x: 80, y: 60, width: 600, height: 80 }, elements: [expect.objectContaining({ id: "title" })] })]);
    const empty = pptxExportSlides({ ...deck, steps: [] });
    expect(empty).toHaveLength(1);
    expect(empty[0].bounds).toEqual({ x: 0, y: 0, width: 5100, height: 5040 });
    expect(empty[0].elements).toHaveLength(elements.length);
  });
});

describe("PowerPoint export: package", () => {
  it("writes a complete 16:9 PresentationML package", () => {
    const { files, xml, slides } = exported();
    expect(slides).toBe(2);
    for (const part of ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/slideMasters/slideMaster1.xml", "ppt/slideLayouts/slideLayout1.xml", "ppt/theme/theme1.xml", "ppt/notesMasters/notesMaster1.xml", "ppt/slides/slide2.xml", "docProps/core.xml"]) expect(files[part], part).toBeDefined();
    expect(xml("ppt/presentation.xml")).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
    expect(xml("[Content_Types].xml")).toContain('<Default Extension="png" ContentType="image/png"/>');
    expect(xml("docProps/core.xml")).toContain("<dc:title>Quarterly / Review</dc:title>");
    expect(xml("ppt/slides/slide1.xml")).toContain('<p:cSld name="Intro"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FEF3C7"/>');
  });

  it("writes only well-formed XML and resolvable internal relationships", () => {
    const { files } = exported();
    for (const name of Object.keys(files).filter((part) => /\.(xml|rels)$/.test(part))) {
      const root = readPptxXml(files, name);
      if (!name.endsWith(".rels")) continue;
      const owner = name.replace(/_rels\/([^/]+)\.rels$/, "$1");
      for (const rel of xmlNodes(root, "Relationship")) if (rel.getAttribute("TargetMode") !== "External") {
        expect(files[resolvePptxPath(name === "_rels/.rels" ? "" : owner, rel.getAttribute("Target")!)], `${name} → ${rel.getAttribute("Target")}`).toBeDefined();
      }
    }
  });

  it("maps text runs, font size, alignment, links and bullets", () => {
    const { xml } = exported();
    const slide = xml("ppt/slides/slide1.xml"), rels = xml("ppt/slides/_rels/slide1.xml.rels");
    // 960 px across 12192000 EMU: 1 px = 1 pt, so 40 px text is 40 pt.
    expect(slide).toContain('<a:pPr algn="ctr" marL="0" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="de-AT" sz="4000" dirty="0"><a:solidFill><a:srgbClr val="172033"/></a:solidFill><a:latin typeface="Times New Roman"/></a:rPr><a:t>Hello </a:t></a:r>');
    expect(slide).toContain('sz="4000" b="1" dirty="0"><a:solidFill><a:srgbClr val="FF0000"/>');
    expect(slide).toMatch(/<a:hlinkClick r:id="(rId\d+)"\/><\/a:rPr><a:t> world<\/a:t>/);
    expect(rels).toContain('Target="https://example.com" TargetMode="External"');
    expect(slide.match(/<a:buChar char="•"\/><\/a:pPr><a:r><a:rPr lang="de-AT" sz="2400" i="1"/g)).toHaveLength(2);
  });

  it("maps shapes, connectors, rotation, opacity and dashes", () => {
    const { xml } = exported();
    const one = xml("ppt/slides/slide1.xml"), two = xml("ppt/slides/slide2.xml");
    expect(one).toContain('<a:xfrm rot="1800000"><a:off x="8890000" y="2540000"/><a:ext cx="2540000" cy="1270000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 20000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="2E86DE"><a:alpha val="50000"/>');
    expect(one).toContain('<p:cxnSp>');
    expect(one).toContain('<a:off x="1016000" y="5334000"/><a:ext cx="3810000" cy="0"/></a:xfrm><a:prstGeom prst="line">');
    expect(one).toContain('<a:prstDash val="dash"/><a:round/><a:tailEnd type="triangle"');
    expect(one).toMatch(/rot="5400000".*<a:headEnd type="triangle"[^>]*\/><a:tailEnd type="triangle"/);
    expect(two).toMatch(/<p:grpSp>.*<a:chOff x="1270000" y="1270000"\/>.*prst="ellipse".*prst="diamond".*<a:prstDash val="sysDot"\/>.*<\/p:grpSp>/);
  });

  it("embeds pictures with their crop and mask, and leaves charts as labelled placeholders", () => {
    const { xml, files, warnings } = exported();
    const two = xml("ppt/slides/slide2.xml");
    expect(files["ppt/media/image1.png"]).toEqual(media["att-photo"].bytes);
    expect(xml("ppt/slides/_rels/slide2.xml.rels")).toContain('Target="../media/image1.png"');
    // A 4:1 picture covering a 2:1 box shows its middle half.
    expect(two).toContain('descr="Team photo"');
    expect(two).toContain('<a:srcRect l="25000" r="25000"/>');
    expect(two).toContain('<a:prstGeom prst="ellipse">');
    expect(two).toContain("<a:t>Revenue</a:t>");
    expect(two).toContain("<a:t>Q1: 12</a:t>");
    expect(warnings).toEqual([{ slide: 2, code: "chart" }]);
  });

  it("writes speaker notes only for stops that have them", () => {
    const { xml, files } = exported();
    expect(xml("ppt/notesSlides/notesSlide1.xml")).toContain("<a:t>Welcome everyone.</a:t></a:r></a:p><a:p><a:r><a:rPr lang=\"de-AT\" dirty=\"0\"/><a:t>Keep it short.</a:t>");
    expect(files["ppt/notesSlides/notesSlide2.xml"]).toBeUndefined();
  });

  it("turns missing or unsupported images into placeholders with a warning", () => {
    const { warnings } = exportPresentationPptx(deck, {});
    expect(warnings).toContainEqual({ slide: 2, code: "missingMedia" });
    expect(exportPresentationPptx(deck, { "att-photo": { mime: "image/svg+xml", bytes: strToU8("<svg/>") } }).warnings).toContainEqual({ slide: 2, code: "unsupportedImage" });
  });

  it("builds a header-safe file name", () => {
    expect(pptxFileName('Q3 "Plan" / Ärger\r\n')).toEqual({ ascii: "Q3 Plan Arger.pptx", encoded: "Q3%20Plan%20%C3%84rger.pptx" });
    expect(pptxFileName("   ").ascii).toBe("presentation.pptx");
  });
});

describe("PowerPoint export: canvas shapes beyond the basics", () => {
  it("exports the newer kinds as presets, text in shapes, and elbow or curved lines as paths", () => {
    const shape = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({ id, type: "shape", parentId: "f", x: 100, y: 100, width: 200, height: 100, rotation: 0, content: { shape: kind, fill: "#ffffff", stroke: "#123456", strokeWidth: 2, opacity: 1, ...extra } }) as PresentationElement;
    const routed = (id: string, route: "elbow" | "curve", points: { x: number; y: number }[]) => shape(id, "arrow", { route, points });
    const snapshot: PresentationSnapshot = { title: "Shapes", background: "", settings: defaultPresentationSettings, steps: [{ id: "s", elementId: "f" }], elements: [
      frame("f", 0, "Shapes"),
      shape("star", "star"), shape("bubble", "callout", { text: "Hello there", runs: [{ text: "Hello", bold: true }, { text: " there" }] }),
      routed("elbow", "elbow", [{ x: 24, y: 24 }, { x: 100, y: 24 }, { x: 100, y: 76 }, { x: 176, y: 76 }]),
      routed("curve", "curve", [{ x: 24, y: 24 }, { x: 80, y: 24 }, { x: 120, y: 76 }, { x: 176, y: 76 }]),
    ] };
    const slide = strFromU8(unzipSync(exportPresentationPptx(snapshot, {}, { now: new Date("2026-10-20T10:00:00Z") }).bytes)["ppt/slides/slide1.xml"]);
    expect(slide).toContain('prst="star5"'); expect(slide).toContain('prst="wedgeRectCallout"');
    expect(slide).toMatch(/prst="wedgeRectCallout".*<p:txBody><a:bodyPr[^>]*anchor="ctr".*<a:rPr[^>]*b="1".*Hello<\/a:t>.*there<\/a:t>/);
    expect(slide).toMatch(/<a:custGeom>.*<a:moveTo>.*<\/a:moveTo><a:lnTo>.*<a:lnTo>.*<a:lnTo>.*<\/a:path>.*<a:tailEnd type="triangle"/);
    expect(slide).toContain("<a:cubicBezTo>");
  });
});

describe("image crop geometry", () => {
  it("reads PNG sizes and inverts cover crops", () => {
    expect(imageSize(png(400, 100))).toEqual({ width: 400, height: 100 });
    const placement = imagePlacement({ width: 200, height: 100 }, { attachmentId: "a", alt: "", fit: "cover", cropX: 0, zoom: 2 }, { width: 400, height: 400 });
    expect(placement).toMatchObject({ x: 0, y: 0, width: 200, height: 100, crop: { l: 0, r: 0.5, t: 0.375, b: 0.375 } });
    expect(srcRectToImageCrop({ l: 0, r: 50, t: 37.5, b: 37.5 })).toEqual({ fit: "cover", zoom: 2, cropX: 0, cropY: 50 });
    expect(srcRectToImageCrop(undefined)).toBeNull();
  });

  it("shrinks a letterboxed (contain) picture to its visible area", () => {
    expect(imagePlacement({ width: 200, height: 100 }, { attachmentId: "a", alt: "" }, { width: 100, height: 100 })).toMatchObject({ x: 50, y: 0, width: 100, height: 100, crop: { l: 0, t: 0, r: 0, b: 0 } });
  });
});

/** The exported group's own transform (not the slide tree's). */
const groupXfrm = /(name="Group \d+"\/>.*?<p:grpSpPr><a:xfrm)>/;

describe("PowerPoint round trip", () => {
  it("re-imports slides, text, shape kinds, pictures and notes", async () => {
    const { bytes } = exported();
    const { snapshot, media: imported, warnings } = await importPresentationPptx(bytes, "Round trip");
    expect(warnings.some((warning) => warning.code === "fallback")).toBe(false);
    const frames = snapshot.elements.filter((element) => element.type === "frame" && !element.content.isGroup);
    expect(frames.map((element) => element.type === "frame" && element.content.label)).toEqual(["Intro", "Details"]);
    expect(snapshot.steps.map((step) => step.notes)).toEqual(["Welcome everyone.\nKeep it short.", ""]);
    const texts = snapshot.elements.flatMap((element) => element.type === "text" ? [element.content.text] : []);
    expect(texts).toEqual(expect.arrayContaining(["Hello bold world", "One\nTwo"]));
    const title = snapshot.elements.find((element) => element.type === "text" && element.content.text === "Hello bold world");
    expect(title).toMatchObject({ content: { fontSize: 40, align: "center", font: "serif", runs: [{ text: "Hello " }, { text: "bold", bold: true, color: "#ff0000" }, { text: " world", href: "https://example.com" }] } });
    expect(snapshot.elements.find((element) => element.type === "text" && element.content.text === "One\nTwo")).toMatchObject({ content: { list: "bullet" } });
    const kinds = snapshot.elements.flatMap((element) => element.type === "shape" ? [element.content.shape] : []);
    expect(kinds).toEqual(expect.arrayContaining(["roundedRect", "arrow", "doubleArrow", "ellipse", "diamond"]));
    const arrow = snapshot.elements.find((element) => element.type === "shape" && element.content.shape === "arrow")!;
    expect(arrow.x - frames[0].x).toBeCloseTo(80, 0); expect(arrow.y - frames[0].y + arrow.height / 2).toBeCloseTo(420, 0); expect(arrow.width).toBeCloseTo(300, 0);
    const vertical = snapshot.elements.find((element) => element.type === "shape" && element.content.shape === "doubleArrow")!;
    expect(vertical.rotation).toBe(90);
    expect(snapshot.elements.some((element) => element.type === "frame" && element.content.isGroup)).toBe(true);
    const photo = snapshot.elements.find((element) => element.type === "image");
    expect(imported).toHaveLength(1);
    expect(photo).toMatchObject({ width: 200, height: 100, content: { fit: "cover", zoom: 1, cropX: 50, cropY: 50, mask: "circle" } });
  });

  it("applies a rotated group's transform to its members on import", async () => {
    const files = unzipSync(exported().bytes);
    const slide = strFromU8(files["ppt/slides/slide2.xml"]);
    files["ppt/slides/slide2.xml"] = strToU8(slide.replace(groupXfrm, '$1 rot="5400000">'));
    const { snapshot, warnings } = await importPresentationPptx(zipSync(files), "Rotated");
    expect(warnings.map((warning) => warning.code)).not.toContain("transform");
    const group = snapshot.elements.find((element) => element.type === "frame" && element.content.isGroup)!;
    expect(group.rotation).toBe(90);
    const ellipse = snapshot.elements.find((element) => element.type === "shape" && element.content.shape === "ellipse")!;
    // The ellipse sat left of the group centre (−125, −25); a quarter turn moves it above.
    const centre = { x: group.x + group.width / 2, y: group.y + group.height / 2 };
    expect(ellipse.x + ellipse.width / 2 - centre.x).toBeCloseTo(25, 0);
    expect(ellipse.y + ellipse.height / 2 - centre.y).toBeCloseTo(-125, 0);
    expect(ellipse.rotation).toBe(90);
  });

  it("swaps a connector's ends when its group is mirrored horizontally", async () => {
    const files = unzipSync(exportPresentationPptx({ ...deck, elements: [frame("f1", 0, "Intro"), { id: "g", parentId: "f1", type: "frame", x: 100, y: 100, width: 300, height: 100, rotation: 0, content: { label: "", shape: "none", color: "", isGroup: true } }, { ...elements[5], parentId: "g", x: 100, y: 130 }], steps: [{ id: "s", elementId: "f1" }] }, {}).bytes);
    const slide = strFromU8(files["ppt/slides/slide1.xml"]);
    files["ppt/slides/slide1.xml"] = strToU8(slide.replace(groupXfrm, '$1 flipH="1">'));
    const { snapshot } = await importPresentationPptx(zipSync(files), "Flipped");
    const line = snapshot.elements.find((element) => element.type === "shape")!;
    expect(line).toMatchObject({ x: 100, rotation: 0, content: { shape: "line", startHead: "triangle", endHead: "none" } });
  });
});
