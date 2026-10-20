import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { defaultPresentationSettings, type PresentationElement, type PresentationSnapshot } from "./presentation";
import { importPresentationPptx } from "./presentation-pptx";
import { exportPresentationPptx } from "./presentation-pptx-export";
import { readPptxXml } from "./presentation-pptx-archive";

type ShapeContent = Extract<PresentationElement, { type: "shape" }>["content"];
type TextContent = Extract<PresentationElement, { type: "text" }>["content"];

const frame = { id: "f", type: "frame", x: 0, y: 0, width: 960, height: 540, rotation: 0, content: { label: "Format", shape: "rect", color: "" } } as PresentationElement;
const shape = (id: string, content: Partial<ShapeContent>, box: Partial<PresentationElement> = {}) =>
  ({ id, parentId: "f", type: "shape", x: 100, y: 100, width: 200, height: 100, rotation: 0, ...box, content: { shape: "rect", fill: "#ffffff", stroke: "#123456", strokeWidth: 2, opacity: 1, ...content } }) as PresentationElement;
const text = (id: string, content: Partial<TextContent>) =>
  ({ id, parentId: "f", type: "text", x: 100, y: 300, width: 600, height: 200, rotation: 0, content: { text: "", fontSize: 20, bold: false, color: "#172033", align: "left", ...content } }) as PresentationElement;
const deck = (...elements: PresentationElement[]): PresentationSnapshot => ({ title: "Format", background: "", settings: defaultPresentationSettings, steps: [{ id: "s", elementId: "f" }], elements: [frame, ...elements] });
const media = { "att-tile": { mime: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 8, 0, 0, 0, 8]) } };
const exportDeck = (snapshot: PresentationSnapshot) => exportPresentationPptx(snapshot, media, { now: new Date("2026-10-20T10:00:00Z") });
const slideXml = (snapshot: PresentationSnapshot) => strFromU8(unzipSync(exportDeck(snapshot).bytes)["ppt/slides/slide1.xml"]);

/** The children of every `<p:spPr>` in the slide, by local name, in document order. */
function spPrChildren(xml: string) {
  const root = readPptxXml({ "slide.xml": new TextEncoder().encode(xml) }, "slide.xml");
  return [...root.getElementsByTagName("p:spPr")].map((node) => [...node.childNodes].filter((child) => child.nodeType === 1).map((child) => (child as unknown as Element).localName));
}
const spPrOrder = ["xfrm", "custGeom", "prstGeom", "noFill", "solidFill", "gradFill", "blipFill", "pattFill", "ln", "effectLst", "scene3d", "sp3d"];
const inOrder = (names: string[], order: string[]) => names.every((name, index) => index === 0 || order.indexOf(names[index - 1]) <= order.indexOf(name)) && names.every((name) => order.includes(name));

describe("PowerPoint export: Format pane fills", () => {
  it("writes a linear gradient with stops, transparency and PowerPoint's angle", () => {
    const xml = slideXml(deck(shape("g", { fillStyle: { type: "gradient", kind: "linear", angle: 90, stops: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1, transparency: 0.25 }, { color: "#00ff00", position: 0.5 }] } })));
    expect(xml).toContain('<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="50000"><a:srgbClr val="00FF00"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"><a:alpha val="75000"/></a:srgbClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>');
  });

  it("writes radial gradients as a circle path and pattern fills with both colours", () => {
    const xml = slideXml(deck(
      shape("r", { fillStyle: { type: "gradient", kind: "radial", angle: 0, stops: [{ color: "#ffffff", position: 0 }, { color: "#000000", position: 1 }], rotateWithShape: false } }),
      shape("p", { fillStyle: { type: "pattern", pattern: "dkDnDiag", foreground: "#156082", background: "#ffffff" }, fillTransparency: 0.5 }),
    ));
    expect(xml).toContain('<a:gradFill rotWithShape="0">');
    expect(xml).toContain('<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>');
    expect(xml).toContain('<a:pattFill prst="dkDnDiag"><a:fgClr><a:srgbClr val="156082"><a:alpha val="50000"/></a:srgbClr></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"><a:alpha val="50000"/></a:srgbClr></a:bgClr></a:pattFill>');
  });

  it("embeds a picture fill through the slide's image relationship, tiled or stretched", () => {
    const { bytes } = exportDeck(deck(shape("t", { fillStyle: { type: "picture", attachmentId: "att-tile", tile: true, transparency: 0.2 } }), shape("s", { fillStyle: { type: "picture", attachmentId: "att-tile" } })));
    const files = unzipSync(bytes), xml = strFromU8(files["ppt/slides/slide1.xml"]);
    expect(files["ppt/media/image1.png"]).toBeDefined();
    expect(xml).toMatch(/<a:blipFill rotWithShape="1"><a:blip r:embed="rId\d+"><a:alphaModFix amt="80000"\/><\/a:blip><a:tile [^>]*\/><\/a:blipFill>/);
    expect(xml).toMatch(/<a:blipFill rotWithShape="1"><a:blip r:embed="rId\d+"><\/a:blip><a:stretch><a:fillRect\/><\/a:stretch><\/a:blipFill>/);
  });

  it("falls back to the solid fill when a picture fill's image is missing", () => {
    const result = exportPresentationPptx(deck(shape("t", { fill: "#abcdef", fillStyle: { type: "picture", attachmentId: "gone" } })), {});
    expect(strFromU8(unzipSync(result.bytes)["ppt/slides/slide1.xml"])).toContain('<a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill><a:ln');
    expect(result.warnings).toContainEqual({ slide: 1, code: "missingMedia" });
  });
});

describe("PowerPoint export: lines and effects", () => {
  it("writes a dashed compound line with caps, joins, transparency and sized arrowheads", () => {
    const xml = slideXml(deck(shape("l", { shape: "line", stroke: "#ff0000", strokeWidth: 3, dash: "longDashDot", compound: "double", cap: "square", join: "miter", lineTransparency: 0.4, startHead: "stealth", endHead: "oval", startSize: { width: "sm", length: "lg" }, endSize: { width: "lg", length: "sm" } })));
    expect(xml).toContain('<a:ln w="38100" cap="sq" cmpd="dbl"><a:solidFill><a:srgbClr val="FF0000"><a:alpha val="60000"/></a:srgbClr></a:solidFill><a:prstDash val="lgDashDot"/><a:miter lim="800000"/><a:headEnd type="stealth" w="sm" len="lg"/><a:tailEnd type="oval" w="lg" len="sm"/></a:ln>');
  });

  it("maps PowerPoint's dash kinds; a round dot gets a round cap, an open freeform its arrowheads", () => {
    const xml = slideXml(deck(
      shape("a", { dash: "roundDot", join: "bevel" }), shape("b", { dash: "squareDot" }), shape("c", { dash: "longDashDotDot", compound: "triple" }),
      shape("d", { fill: "", freeform: { d: "M0 0 L100 50", w: 100, h: 50, closed: false }, endHead: "diamond" }),
    ));
    expect(xml).toContain('cap="rnd"><a:solidFill><a:srgbClr val="123456"/></a:solidFill><a:prstDash val="sysDot"/><a:bevel/></a:ln>');
    expect(xml).toMatch(/<a:ln w="25400"><a:solidFill><a:srgbClr val="123456"\/><\/a:solidFill><a:prstDash val="sysDot"\/><a:round\/>/);
    expect(xml).toContain('cmpd="tri"><a:solidFill><a:srgbClr val="123456"/></a:solidFill><a:prstDash val="lgDashDotDot"/>');
    expect(xml).toMatch(/<\/a:custGeom><a:noFill\/><a:ln [^>]*>.*?<a:tailEnd type="diamond" w="lg" len="lg"\/><\/a:ln>/);
  });

  it("writes an outer shadow and glow in effect-list order, then 3-D scene and bevel", () => {
    const xml = slideXml(deck(shape("e", { effects: {
      shadow: { type: "outer", color: "#000000", transparency: 0.6, size: 100, blur: 4, angle: 45, distance: 3 },
      glow: { color: "#ffc000", size: 10, transparency: 0.4 }, softEdges: 2.5,
      bevel: { preset: "circle", width: 6, height: 6 }, rotation3d: { x: 20, y: 10, z: 0, perspective: 45 },
    } })));
    expect(xml).toContain('<a:effectLst><a:glow rad="127000"><a:srgbClr val="FFC000"><a:alpha val="60000"/></a:srgbClr></a:glow><a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw><a:softEdge rad="31750"/></a:effectLst>');
    expect(xml).toContain('<a:scene3d><a:camera prst="perspectiveFront" fov="2700000"><a:rot lat="600000" lon="1200000" rev="0"/></a:camera><a:lightRig rig="threePt" dir="t"/></a:scene3d><a:sp3d><a:bevelT w="76200" h="76200" prst="circle"/></a:sp3d></p:spPr>');
  });

  it("writes inner and perspective shadows and reflections", () => {
    const xml = slideXml(deck(
      shape("i", { effects: { shadow: { type: "inner", color: "#000000", transparency: 0.5, size: 100, blur: 5, angle: 90, distance: 4 } } }),
      shape("p", { effects: { shadow: { type: "perspective", color: "#000000", transparency: 0.8, size: 100, blur: 6, angle: 225, distance: 1 }, reflection: { transparency: 0.5, size: 50, blur: 0.5, distance: 0 } } }),
    ));
    expect(xml).toContain('<a:innerShdw blurRad="63500" dist="50800" dir="5400000">');
    expect(xml).toContain('<a:outerShdw blurRad="76200" dist="12700" dir="13500000" sx="100000" sy="23000" kx="1200000" algn="b" rotWithShape="0">');
    expect(xml).toContain('<a:reflection blurRad="6350" stA="50000" endPos="50000" dist="0" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>');
  });

  it("keeps every shape property list in DrawingML schema order", () => {
    const xml = slideXml(deck(
      shape("all", { fillStyle: { type: "pattern", pattern: "pct50", foreground: "#000000", background: "#ffffff" }, dash: "dash", effects: { shadow: { type: "outer", color: "#000000", transparency: 0, size: 90, blur: 1, angle: 0, distance: 1 }, glow: { color: "#ff0000", size: 5, transparency: 0 }, reflection: { transparency: 0.5, size: 30, blur: 0, distance: 0 }, softEdges: 1, bevel: { preset: "angle", width: 3, height: 3 }, rotation3d: { x: 0, y: 0, z: 30, perspective: 0 } } }),
      shape("line", { shape: "arrow", effects: { shadow: { type: "outer", color: "#000000", transparency: 0, size: 100, blur: 1, angle: 0, distance: 1 } } }),
    ));
    const lists = spPrChildren(xml);
    expect(lists.map((children) => children.length)).toEqual([7, 4]);
    for (const children of lists) expect(inOrder(children, spPrOrder), children.join(" ")).toBe(true);
    const effects = /<a:effectLst>(.*?)<\/a:effectLst>/.exec(xml)![1].match(/<a:(\w+)/g)!.map((tag) => tag.slice(3)).filter((tag) => ["glow", "innerShdw", "outerShdw", "reflection", "softEdge"].includes(tag));
    expect(effects).toEqual(["glow", "outerShdw", "reflection", "softEdge"]);
  });

  it("leaves shapes without the new fields exactly as before", () => {
    const xml = slideXml(deck(shape("plain", { fill: "#2e86de", opacity: 0.5 })));
    expect(xml).toContain('<a:solidFill><a:srgbClr val="2E86DE"><a:alpha val="50000"/></a:srgbClr></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="123456"><a:alpha val="50000"/></a:srgbClr></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln></p:spPr>');
  });
});

describe("PowerPoint export: text body, paragraphs and characters", () => {
  it("writes the Text Box section into bodyPr", () => {
    const xml = slideXml(deck(text("t", { text: "Columns", body: { anchor: "bottom", anchorCenter: true, direction: "vertical270", autofit: "shrink", insets: { left: 10, top: 5, right: 10, bottom: 5 }, wrap: false, columns: 2, columnSpacing: 12 } })));
    expect(xml).toContain('<a:bodyPr vert="vert270" wrap="none" lIns="127000" tIns="63500" rIns="127000" bIns="63500" numCol="2" spcCol="152400" rtlCol="0" anchor="b" anchorCtr="1"><a:normAutofit/></a:bodyPr>');
    expect(slideXml(deck(text("r", { text: "Grow", body: { autofit: "resize", anchor: "middle" } })))).toContain('rtlCol="0" anchor="ctr"><a:spAutoFit/></a:bodyPr>');
  });

  it("writes multi-level bulleted and numbered paragraphs with spacing", () => {
    const xml = slideXml(deck(text("p", { text: "Intro\nFirst\nNested\nStep", paragraphs: [
      { align: "justify", spaceBefore: 6, spaceAfter: 12, lineSpacing: { rule: "multiple", value: 1.5 } },
      { bullet: { kind: "char", char: "■", font: "Wingdings" }, indent: 27, special: "hanging", by: 27 },
      { level: 1, bullet: { kind: "char", char: "–" }, lineSpacing: { rule: "exactly", value: 18 } },
      { bullet: { kind: "number", scheme: "romanUcPeriod", start: 3 }, special: "firstLine", by: 10 },
    ] })));
    const paragraphs = xml.match(/<a:pPr[^>]*>.*?<\/a:pPr>/g)!;
    expect(paragraphs).toEqual([
      '<a:pPr algn="just" marL="0" indent="0"><a:lnSpc><a:spcPct val="150000"/></a:lnSpc><a:spcBef><a:spcPts val="600"/></a:spcBef><a:spcAft><a:spcPts val="1200"/></a:spcAft><a:buNone/></a:pPr>',
      '<a:pPr algn="l" marL="342900" indent="-342900"><a:buFont typeface="Wingdings"/><a:buChar char="■"/></a:pPr>',
      '<a:pPr algn="l" marL="762000" indent="-304800" lvl="1"><a:lnSpc><a:spcPts val="1800"/></a:lnSpc><a:buFont typeface="Arial"/><a:buChar char="–"/></a:pPr>',
      '<a:pPr algn="l" marL="304800" indent="127000"><a:buFont typeface="+mj-lt"/><a:buAutoNum type="romanUcPeriod" startAt="3"/></a:pPr>',
    ]);
  });

  it("writes strike, baseline, highlight, spacing, size and caps on runs", () => {
    const xml = slideXml(deck(text("r", { text: "H2O x2 big", runs: [
      { text: "H" }, { text: "2", baseline: -25 }, { text: "O ", strike: "double" }, { text: "x", highlight: "#ffff00", spacing: 3 }, { text: "2", baseline: 30 }, { text: " big", size: 40, caps: "small", strike: "single" },
    ] })));
    expect(xml).toContain('<a:rPr lang="de-AT" sz="2000" baseline="-25000" dirty="0">');
    expect(xml).toContain('<a:rPr lang="de-AT" sz="2000" strike="dblStrike" dirty="0">');
    expect(xml).toContain('<a:rPr lang="de-AT" sz="2000" spc="300" dirty="0"><a:solidFill><a:srgbClr val="172033"/></a:solidFill><a:highlight><a:srgbClr val="FFFF00"/></a:highlight><a:latin typeface="Calibri"/></a:rPr><a:t>x</a:t>');
    expect(xml).toContain('<a:rPr lang="de-AT" sz="2000" baseline="30000" dirty="0">');
    expect(xml).toContain('<a:rPr lang="de-AT" sz="4000" strike="sngStrike" cap="small" dirty="0">');
  });

  it("writes WordArt fill, outline and effects in rPr order and its bevel on the body", () => {
    const xml = slideXml(deck(text("w", { text: "Word", textStyle: {
      fill: { type: "gradient", kind: "linear", angle: 0, stops: [{ color: "#ff0000", position: 0 }, { color: "#ffff00", position: 1 }] },
      outline: { color: "#000000", width: 1, transparency: 0.5 },
      effects: { shadow: { type: "outer", color: "#000000", transparency: 0.6, size: 100, blur: 3, angle: 45, distance: 2 }, bevel: { preset: "softRound", width: 6, height: 6 } },
    }, runs: [{ text: "Word", highlight: "#00ff00" }] })));
    expect(xml).toMatch(/<a:rPr [^>]*><a:ln w="12700"><a:solidFill><a:srgbClr val="000000"><a:alpha val="50000"\/><\/a:srgbClr><\/a:solidFill><\/a:ln><a:gradFill rotWithShape="1">.*?<\/a:gradFill><a:effectLst><a:outerShdw [^>]*>.*?<\/a:effectLst><a:highlight><a:srgbClr val="00FF00"\/><\/a:highlight><a:latin typeface="Calibri"\/><\/a:rPr>/);
    expect(xml).toContain('<a:noAutofit/><a:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></a:scene3d><a:sp3d><a:bevelT w="76200" h="76200" prst="softRound"/></a:sp3d></a:bodyPr>');
    expect(slideXml(deck(text("n", { text: "Hollow", textStyle: { fill: { type: "none" } } })))).toContain('dirty="0"><a:noFill/><a:latin');
  });

  it("carries a shape's body, paragraphs and WordArt into its text", () => {
    const xml = slideXml(deck(shape("s", { text: "One\nTwo", body: { anchor: "top" }, paragraphs: [{}, { spaceBefore: 4 }], textStyle: { fill: { type: "solid", color: "#ff0000", transparency: 0.5 } } })));
    expect(xml).toContain('anchor="t"><a:noAutofit/></a:bodyPr>');
    expect(xml).toContain('<a:spcBef><a:spcPts val="400"/></a:spcBef>');
    expect(xml).toContain('<a:solidFill><a:srgbClr val="FF0000"><a:alpha val="50000"/></a:srgbClr></a:solidFill><a:latin');
  });
});

describe("PowerPoint round trip of formatting", () => {
  it("re-imports gradient, pattern, transparency, dashes, arrowheads, shadow, text box and character format", async () => {
    const { bytes } = exportDeck(deck(
      shape("g", { fillStyle: { type: "gradient", kind: "linear", angle: 90, stops: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1, transparency: 0.5 }] } }),
      shape("p", { fillStyle: { type: "pattern", pattern: "dkDnDiag", foreground: "#156082", background: "#ffffff" } }, { x: 400 }),
      shape("t", { fill: "#2e86de", fillTransparency: 0.25, lineTransparency: 0.5, dash: "longDash", effects: { shadow: { type: "outer", color: "#000000", transparency: 0.6, size: 100, blur: 4, angle: 90, distance: 3 } } }, { x: 700 }),
      shape("a", { shape: "arrow", dash: "dashDot", startHead: "diamond", endHead: "stealth", endSize: { width: "sm", length: "lg" } }, { y: 250, height: 20 }),
      shape("pic", { fillStyle: { type: "picture", attachmentId: "att-tile" } }, { y: 400 }),
      text("x", { text: "Top line\nSecond2", body: { anchor: "bottom", autofit: "shrink", wrap: false, insets: { left: 10, top: 2, right: 10, bottom: 2 } },
        paragraphs: [{ spaceBefore: 6, lineSpacing: { rule: "multiple", value: 1.5 } }, { spaceAfter: 12, align: "justify", lineSpacing: { rule: "exactly", value: 30 } }],
        runs: [{ text: "Top " }, { text: "line", strike: "single", spacing: 2 }, { text: "\nSecond" }, { text: "2", baseline: 30 }] }),
    ));
    const { snapshot, warnings, media: imported } = await importPresentationPptx(bytes, "Round trip");
    expect(warnings.map((warning) => warning.code)).not.toContain("fillSimplified");
    const shapes = snapshot.elements.filter((element): element is Extract<PresentationElement, { type: "shape" }> => element.type === "shape");
    expect(shapes.find((element) => element.content.fillStyle?.type === "gradient")?.content.fillStyle).toEqual({ type: "gradient", kind: "linear", angle: 90, stops: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1, transparency: 0.5 }] });
    expect(shapes.find((element) => element.content.fillStyle?.type === "pattern")?.content.fillStyle).toEqual({ type: "pattern", pattern: "dkDnDiag", foreground: "#156082", background: "#ffffff" });
    expect(shapes.find((element) => element.content.fill === "#2e86de")?.content).toMatchObject({ fillTransparency: 0.25, lineTransparency: 0.5, dash: "longDash", effects: { shadow: { type: "outer", color: "#000000", transparency: 0.6, blur: 4, angle: 90, distance: 3 } } });
    expect(shapes.find((element) => element.content.shape === "doubleArrow")?.content).toMatchObject({ dash: "dashDot", startHead: "diamond", endHead: "stealth", endSize: { width: "sm", length: "lg" } });
    const picture = shapes.find((element) => element.content.fillStyle?.type === "picture");
    expect(picture?.content.fillStyle).toEqual({ type: "picture", attachmentId: imported[0].key });
    const box = snapshot.elements.find((element): element is Extract<PresentationElement, { type: "text" }> => element.type === "text" && element.content.text.startsWith("Top"))!;
    expect(box.content.body).toEqual({ anchor: "bottom", autofit: "shrink", wrap: false, insets: { left: 10, top: 2, right: 10, bottom: 2 } });
    expect(box.content.paragraphs).toEqual([{ spaceBefore: 6, lineSpacing: { rule: "multiple", value: 1.5 } }, { align: "justify", spaceAfter: 12, lineSpacing: { rule: "exactly", value: 30 } }]);
    expect(box.content.runs).toEqual(expect.arrayContaining([expect.objectContaining({ text: "line", strike: "single", spacing: 2 }), expect.objectContaining({ text: "2", baseline: 30 })]));
  });
});
