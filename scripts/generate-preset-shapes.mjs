// Converts the DrawingML preset shape definitions (ECMA-376 Part 1, presetShapeDefinitions.xml,
// as redistributed by Apache POI under poi/src/main/resources/org/apache/poi/sl/draw/geom/) into
// the compact JSON the presentation canvas evaluates. PowerPoint draws its preset shapes from
// these same definitions, so the canvas reproduces their outlines, yellow handles, connection
// sites and text areas exactly.
//
// Usage: node scripts/generate-preset-shapes.mjs <presetShapeDefinitions.xml>
import { readFileSync, writeFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/generate-preset-shapes.mjs <presetShapeDefinitions.xml>");
const output = new URL("../src/modules/wiki/lib/preset-shapes/preset-shape-definitions.json", import.meta.url);

const doc = new DOMParser().parseFromString(readFileSync(source, "utf8"), "text/xml");
const children = (node, name) => [...node.childNodes].filter((child) => child.nodeType === 1 && (!name || child.localName === name));
const child = (node, name) => children(node, name)[0];
const attr = (node, name) => node.getAttribute(name) || undefined;
const guides = (list) => list ? children(list, "gd").map((gd) => [attr(gd, "name"), attr(gd, "fmla")]) : [];
const point = (node) => { const pt = child(node, "pt"); return [attr(pt, "x"), attr(pt, "y")]; };

const shapes = {};
for (const shape of children(doc.documentElement)) {
  const handles = [];
  const ahLst = child(shape, "ahLst");
  for (const handle of ahLst ? children(ahLst) : []) {
    const pos = child(handle, "pos");
    const keys = handle.localName === "ahXY"
      ? ["gdRefX", "minX", "maxX", "gdRefY", "minY", "maxY"]
      : ["gdRefR", "minR", "maxR", "gdRefAng", "minAng", "maxAng"];
    handles.push({ kind: handle.localName === "ahXY" ? "xy" : "polar", ...Object.fromEntries(keys.map((key) => [key, attr(handle, key)]).filter(([, value]) => value !== undefined)), x: attr(pos, "x"), y: attr(pos, "y") });
  }
  const cxnLst = child(shape, "cxnLst");
  const sites = cxnLst ? children(cxnLst, "cxn").map((cxn) => { const pos = child(cxn, "pos"); return [attr(cxn, "ang"), attr(pos, "x"), attr(pos, "y")]; }) : [];
  const rect = child(shape, "rect");
  const paths = children(child(shape, "pathLst"), "path").map((path) => {
    const commands = children(path).map((command) => {
      switch (command.localName) {
        case "moveTo": return ["M", ...point(command)];
        case "lnTo": return ["L", ...point(command)];
        case "arcTo": return ["A", attr(command, "wR"), attr(command, "hR"), attr(command, "stAng"), attr(command, "swAng")];
        case "quadBezTo": return ["Q", ...children(command, "pt").flatMap((pt) => [attr(pt, "x"), attr(pt, "y")])];
        case "cubicBezTo": return ["C", ...children(command, "pt").flatMap((pt) => [attr(pt, "x"), attr(pt, "y")])];
        case "close": return ["Z"];
        default: throw new Error(`Unknown path command ${command.localName}`);
      }
    });
    const entry = { commands };
    for (const key of ["w", "h"]) if (attr(path, key)) entry[key] = Number(attr(path, key));
    if (attr(path, "fill")) entry.fill = attr(path, "fill");
    if (attr(path, "stroke") === "0" || attr(path, "stroke") === "false") entry.stroke = false;
    return entry;
  });
  shapes[shape.localName] = {
    av: guides(child(shape, "avLst")),
    gd: guides(child(shape, "gdLst")),
    ah: handles,
    cxn: sites,
    ...(rect ? { rect: [attr(rect, "l"), attr(rect, "t"), attr(rect, "r"), attr(rect, "b")] } : {}),
    paths,
  };
}
writeFileSync(output, `${JSON.stringify(shapes)}\n`);
console.log(`${Object.keys(shapes).length} preset shapes written to ${output.pathname}`);
