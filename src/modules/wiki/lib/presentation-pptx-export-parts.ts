// Static PresentationML parts for the .pptx export: one theme, one blank master and
// layout, the notes master, content types and the package/document relationships.
// Kept minimal but complete enough for PowerPoint, LibreOffice and pptxtojson.

export const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const SLIDE_CX = 12192000, SLIDE_CY = 6858000;
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const REL_TYPES = {
  slide: `${REL}/slide`, slideLayout: `${REL}/slideLayout`, slideMaster: `${REL}/slideMaster`, theme: `${REL}/theme`,
  notesSlide: `${REL}/notesSlide`, notesMaster: `${REL}/notesMaster`, image: `${REL}/image`, hyperlink: `${REL}/hyperlink`,
  presProps: `${REL}/presProps`, viewProps: `${REL}/viewProps`, tableStyles: `${REL}/tableStyles`,
  officeDocument: `${REL}/officeDocument`, extendedProperties: `${REL}/extended-properties`,
  coreProperties: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
} as const;

/** Escapes text and attribute values and drops characters XML 1.0 cannot carry. */
export function xmlEscape(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type PptxRel = { id: string; type: string; target: string; external?: boolean };
export const relsXml = (rels: PptxRel[]) => `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((rel) => `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${xmlEscape(rel.target)}"${rel.external ? ' TargetMode="External"' : ""}/>`).join("")}</Relationships>`;

const CT = "application/vnd.openxmlformats-officedocument";
export function contentTypesXml(slides: number, notes: number[], mediaExtensions: Map<string, string>) {
  const defaults = [["rels", "application/vnd.openxmlformats-package.relationships+xml"], ["xml", "application/xml"], ...mediaExtensions];
  const overrides: Array<[string, string]> = [
    ["/ppt/presentation.xml", `${CT}.presentationml.presentation.main+xml`],
    ["/ppt/presProps.xml", `${CT}.presentationml.presProps+xml`], ["/ppt/viewProps.xml", `${CT}.presentationml.viewProps+xml`],
    ["/ppt/tableStyles.xml", `${CT}.presentationml.tableStyles+xml`],
    ["/ppt/slideMasters/slideMaster1.xml", `${CT}.presentationml.slideMaster+xml`], ["/ppt/slideLayouts/slideLayout1.xml", `${CT}.presentationml.slideLayout+xml`],
    ["/ppt/theme/theme1.xml", `${CT}.theme+xml`], ["/ppt/theme/theme2.xml", `${CT}.theme+xml`],
    ["/ppt/notesMasters/notesMaster1.xml", `${CT}.presentationml.notesMaster+xml`],
    ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"], ["/docProps/app.xml", `${CT}.extended-properties+xml`],
    ...Array.from({ length: slides }, (_, index): [string, string] => [`/ppt/slides/slide${index + 1}.xml`, `${CT}.presentationml.slide+xml`]),
    ...notes.map((number): [string, string] => [`/ppt/notesSlides/notesSlide${number}.xml`, `${CT}.presentationml.notesSlide+xml`]),
  ];
  return `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults.map(([extension, type]) => `<Default Extension="${extension}" ContentType="${type}"/>`).join("")}${overrides.map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`).join("")}</Types>`;
}

export function presentationXml(slides: number) {
  const ids = Array.from({ length: slides }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 10}"/>`).join("");
  return `${XML_HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="${SLIDE_CX}" cy="${SLIDE_CY}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="de-AT"/></a:defPPr></p:defaultTextStyle></p:presentation>`;
}

export function presentationRels(slides: number): PptxRel[] {
  return [
    { id: "rId1", type: REL_TYPES.slideMaster, target: "slideMasters/slideMaster1.xml" },
    { id: "rId2", type: REL_TYPES.notesMaster, target: "notesMasters/notesMaster1.xml" },
    { id: "rId3", type: REL_TYPES.theme, target: "theme/theme1.xml" },
    { id: "rId4", type: REL_TYPES.presProps, target: "presProps.xml" },
    { id: "rId5", type: REL_TYPES.viewProps, target: "viewProps.xml" },
    { id: "rId6", type: REL_TYPES.tableStyles, target: "tableStyles.xml" },
    ...Array.from({ length: slides }, (_, index) => ({ id: `rId${index + 10}`, type: REL_TYPES.slide, target: `slides/slide${index + 1}.xml` })),
  ];
}

const color = (name: string, value: string) => `<a:${name}><a:srgbClr val="${value}"/></a:${name}>`;
const solid = (alpha?: number) => `<a:solidFill><a:schemeClr val="phClr">${alpha ? `<a:alpha val="${alpha}"/>` : ""}</a:schemeClr></a:solidFill>`;
export function themeXml(name: string) {
  const colors = `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${color("dk2", "172033")}${color("lt2", "E7E6E6")}${color("accent1", "6366F1")}${color("accent2", "0EA5E9")}${color("accent3", "10B981")}${color("accent4", "F59E0B")}${color("accent5", "EF4444")}${color("accent6", "8B5CF6")}${color("hlink", "2563EB")}${color("folHlink", "7C3AED")}`;
  const fonts = (face: string) => `<a:latin typeface="${face}"/><a:ea typeface=""/><a:cs typeface=""/>`;
  const line = (width: number) => `<a:ln w="${width}" cap="flat" cmpd="sng" algn="ctr">${solid()}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return `${XML_HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${name}"><a:themeElements><a:clrScheme name="Management Platform">${colors}</a:clrScheme><a:fontScheme name="Management Platform"><a:majorFont>${fonts("Calibri")}</a:majorFont><a:minorFont>${fonts("Calibri")}</a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${solid()}${solid(80000)}${solid(60000)}</a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${solid()}${solid(80000)}${solid(60000)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
export const EMPTY_TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const level = (sz: number) => `<a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="${sz}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>`;

export const slideMasterXml = () => `${XML_HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${level(4400)}</p:titleStyle><p:bodyStyle>${level(2800)}</p:bodyStyle><p:otherStyle>${level(1800)}</p:otherStyle></p:txStyles></p:sldMaster>`;
export const slideMasterRels = (): PptxRel[] => [{ id: "rId1", type: REL_TYPES.slideLayout, target: "../slideLayouts/slideLayout1.xml" }, { id: "rId2", type: REL_TYPES.theme, target: "../theme/theme1.xml" }];
export const slideLayoutXml = () => `${XML_HEAD}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
export const slideLayoutRels = (): PptxRel[] => [{ id: "rId1", type: REL_TYPES.slideMaster, target: "../slideMasters/slideMaster1.xml" }];

export const notesMasterXml = () => `${XML_HEAD}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${EMPTY_TREE}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="de-AT"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap ${CLR_MAP}/><p:notesStyle>${level(1200)}</p:notesStyle></p:notesMaster>`;
export const notesMasterRels = (): PptxRel[] => [{ id: "rId1", type: REL_TYPES.theme, target: "../theme/theme2.xml" }];

/** Speaker notes: one paragraph per line in the body placeholder. */
export function notesSlideXml(notes: string) {
  const paragraphs = notes.split("\n").map((line) => line ? `<a:p><a:r><a:rPr lang="de-AT" dirty="0"/><a:t>${xmlEscape(line)}</a:t></a:r></a:p>` : '<a:p><a:endParaRPr lang="de-AT"/></a:p>').join("");
  return `${XML_HEAD}<p:notes ${NS}><p:cSld><p:spTree>${EMPTY_TREE}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}
export const notesSlideRels = (slide: number): PptxRel[] => [{ id: "rId1", type: REL_TYPES.notesMaster, target: "../notesMasters/notesMaster1.xml" }, { id: "rId2", type: REL_TYPES.slide, target: `../slides/slide${slide}.xml` }];

export const smallParts = (title: string, slides: number, created: Date) => ({
  "_rels/.rels": relsXml([
    { id: "rId1", type: REL_TYPES.officeDocument, target: "ppt/presentation.xml" },
    { id: "rId2", type: REL_TYPES.coreProperties, target: "docProps/core.xml" },
    { id: "rId3", type: REL_TYPES.extendedProperties, target: "docProps/app.xml" },
  ]),
  "docProps/app.xml": `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Management Platform</Application><Slides>${slides}</Slides><PresentationFormat>Widescreen</PresentationFormat></Properties>`,
  "docProps/core.xml": `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${created.toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`,
  "ppt/presProps.xml": `${XML_HEAD}<p:presentationPr ${NS}/>`,
  "ppt/viewProps.xml": `${XML_HEAD}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`,
  "ppt/tableStyles.xml": `${XML_HEAD}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
  "ppt/presentation.xml": presentationXml(slides),
  "ppt/_rels/presentation.xml.rels": relsXml(presentationRels(slides)),
  "ppt/theme/theme1.xml": themeXml("Management Platform"),
  "ppt/theme/theme2.xml": themeXml("Notes"),
  "ppt/slideMasters/slideMaster1.xml": slideMasterXml(),
  "ppt/slideMasters/_rels/slideMaster1.xml.rels": relsXml(slideMasterRels()),
  "ppt/slideLayouts/slideLayout1.xml": slideLayoutXml(),
  "ppt/slideLayouts/_rels/slideLayout1.xml.rels": relsXml(slideLayoutRels()),
  "ppt/notesMasters/notesMaster1.xml": notesMasterXml(),
  "ppt/notesMasters/_rels/notesMaster1.xml.rels": relsXml(notesMasterRels()),
});
