import type { TemplatePalette } from "./presentation-template-palettes";
import type { PresentationElement, PresentationFrameElement, PresentationStep } from "./presentation";
import { layoutConnector, placeLine, type ConnectionSite } from "./presentation-connectors";
type ShapeElement = Extract<PresentationElement, { type: "shape" }>;
import type { PresentationTemplate } from "./presentation-templates";

export const spatialTemplateIds = ["topicmap", "journey", "layers", "comparison"] as const;
type SpatialId = (typeof spatialTemplateIds)[number];
export function isSpatialTemplateId(id: string): id is SpatialId {
  return spatialTemplateIds.some((candidate) => candidate === id);
}

/** Nested camera regions share one landscape; coordinates remain absolute for editing. */
export function buildSpatialTemplate(id: SpatialId, locale: "de" | "en", title?: string, palette?: TemplatePalette): PresentationTemplate {
  const de = locale === "de";
  const elements: PresentationElement[] = [];
  const steps: PresentationStep[] = [];
  const ink = palette?.ink ?? "#183e46", accent = palette?.accent ?? "#287b80", paper = palette?.paper ?? "#f5faf8";
  const soft = palette?.soft ?? "#e2efea", strong = palette?.strong ?? "#c6e2d8";
  const names = de ? { topicmap: "[Zentrale Idee]", journey: "[Unsere Reise]", layers: "[Das Gesamtbild]", comparison: "[Gemeinsame Frage]" }
    : { topicmap: "[Central idea]", journey: "[Our journey]", layers: "[The big picture]", comparison: "[Shared question]" };
  function frame(key: string, x: number, y: number, width: number, parent?: PresentationFrameElement, background?: string) {
    const f: PresentationFrameElement = { id: `${id}-${key}`, type: "frame", x, y, width, height: width * 9 / 16, rotation: 0, parentId: parent?.id, background, content: { label: "", shape: "none", color: "transparent" } };
    elements.push(f); return f;
  }
  function text(parent: PresentationFrameElement, key: string, x: number, y: number, width: number, height: number, value: string, size: number, bold = false, color = ink, align: "left" | "center" = "left") {
    elements.push({ id: `${parent.id}-${key}`, type: "text", parentId: parent.id, x: parent.x + x, y: parent.y + y, width, height, rotation: 0, content: { text: value, fontSize: size, color, bold, align, font: "sans" } });
  }
  // A connector: an end glued to a region follows it when the region moves; a free end stays
  // at its point. Geometry is laid out once every region exists, at the end.
  type End = { glue: PresentationElement; site: ConnectionSite } | { x: number; y: number };
  function line(parent: PresentationFrameElement, key: string, from: End, to: End) {
    const shape: ShapeElement = { id: `${id}-${key}`, type: "shape", parentId: parent.id, x: 0, y: 0, width: 20, height: 20, rotation: 0,
      content: { shape: "line", fill: "", stroke: palette?.connector ?? "#88b5ad", strokeWidth: 5, opacity: 1 } };
    // A line with no glued end is an ordinary line between two points.
    if (!("glue" in from) && !("glue" in to)) { elements.push(placeLine(shape, [from, to], "straight")); return; }
    const fromEnd = "glue" in from ? { fromId: from.glue.id, fromSite: from.site } : { from: { x: from.x, y: from.y } };
    const toEnd = "glue" in to ? { toId: to.glue.id, toSite: to.site } : { to: { x: to.x, y: to.y } };
    elements.push({ ...shape, content: { ...shape.content, connection: { ...fromEnd, ...toEnd } } });
  }
  /** What a line glues to in a region: its visible disc, or the region itself when it is a card. */
  const surface = (f: PresentationFrameElement) => elements.find((element) => element.id === `${f.id}-disc`) ?? f;
  const centerX = (f: PresentationFrameElement) => f.x + f.width / 2;
  function stop(f: PresentationFrameElement, detail = false) {
    steps.push({ id: `${id}-stop-${steps.length}`, elementId: f.id, notes: detail
      ? (de ? "Diesen Bereich erläutern. Platzhalter durch einen Gedanken und einen passenden Beleg ersetzen." : "Explain this region. Replace the placeholders with one idea and supporting evidence.")
      : (de ? "Die räumlichen Zusammenhänge zeigen. Vor dem nächsten Detail kurz in der Übersicht orientieren." : "Show how the regions connect. Pause in the overview to establish context before the next detail.") });
  }
  const root = frame("overview", 0, 0, 3200, undefined, paper);
  text(root, "title", 140, 80, 2900, 190, title?.trim() || names[id], title?.trim() ? Math.min(100, Math.floor(Math.sqrt(2900 * 150 / (title.trim().length * 1.15)))) : 100, true);
  text(root, "hint", 145, 285, 2800, 80, de ? "ÜBERBLICK  →  ZUSAMMENHÄNGE  →  DETAILS" : "OVERVIEW  →  CONNECTIONS  →  DETAILS", 34, false, accent);
  stop(root);
  function region(key: string, x: number, y: number, label: string, parent = root, width = 800, fill = soft) {
    const organic = id === "topicmap" || id === "journey";
    const f = frame(key, x, y, width, parent, organic ? undefined : fill);
    const scale = width / 800;
    const body = de ? "[Kerngedanke]\n[Beispiel oder Beleg]" : "[Key idea]\n[Example or evidence]";
    if (organic) {
      // The text lives in the disc, as in PowerPoint: moving or resizing the disc takes it along.
      const headingSize = Math.round(42 * scale), bodySize = Math.round(32 * scale);
      const runs = [{ text: label, bold: true, size: headingSize }, ...body.split("\n").flatMap((line) => [{ text: "\n" }, { text: line, size: bodySize }])];
      elements.push({ id: `${f.id}-disc`, type: "shape", parentId: f.id, x, y, width, height: f.height, rotation: 0,
        content: { shape: "ellipse", fill, stroke: accent, strokeWidth: 2, opacity: 1, text: `${label}\n${body}`, runs, fontSize: bodySize, color: ink, align: "center", font: "sans" } });
    } else {
      text(f, "label", 45 * scale, 35 * scale, 710 * scale, 110 * scale, label, Math.round(52 * scale), true);
      text(f, "body", 45 * scale, 200 * scale, 710 * scale, 160 * scale, body, Math.round(32 * scale));
    }
    return f;
  }
  if (id === "topicmap") {
    const cx = root.width / 2, cy = 1080, branchWidth = 640, branchHeight = branchWidth * 9 / 16;
    const center = region("center", cx - 400, cy - 225, de ? "[Leitgedanke]" : "[Core idea]", root, 800, strong);
    const branches = [
      region("north", cx - branchWidth / 2, cy - 480 - branchHeight / 2, de ? "[Perspektive A]" : "[Perspective A]", root, branchWidth),
      region("east", cx + 1000 - branchWidth / 2, cy - branchHeight / 2, de ? "[Perspektive B]" : "[Perspective B]", root, branchWidth),
      region("south", cx - branchWidth / 2, cy + 480 - branchHeight / 2, de ? "[Perspektive C]" : "[Perspective C]", root, branchWidth),
      region("west", cx - 1000 - branchWidth / 2, cy - branchHeight / 2, de ? "[Perspektive D]" : "[Perspective D]", root, branchWidth),
    ];
    const [north, east, south, west] = branches;
    line(root, "north-link", { glue: surface(north), site: "bottom" }, { glue: surface(center), site: "top" });
    line(root, "south-link", { glue: surface(center), site: "bottom" }, { glue: surface(south), site: "top" });
    line(root, "west-link", { glue: surface(west), site: "right" }, { glue: surface(center), site: "left" });
    line(root, "east-link", { glue: surface(center), site: "right" }, { glue: surface(east), site: "left" });
    stop(center, true);
    for (const branch of branches) { stop(root); stop(branch, true); }
  } else if (id === "journey") {
    const width = 640, margin = 200, gap = (root.width - 2 * margin - 4 * width) / 3;
    const axisY = 1080, distance = 140;
    const milestones = Array.from({ length: 4 }, (_, i) => {
      const x = margin + i * (width + gap);
      const y = i % 2 ? axisY + distance : axisY - distance - width * 9 / 16;
      return region(`milestone-${i}`, x, y, de ? `[Station ${i + 1}]` : `[Stop ${i + 1}]`, root, width);
    });
    line(root, "route", { x: centerX(milestones[0]), y: axisY }, { x: centerX(milestones[3]), y: axisY });
    milestones.forEach((f, i) => {
      line(root, `connection-${i}`, { glue: surface(f), site: i % 2 ? "top" : "bottom" }, { x: centerX(f), y: axisY });
      stop(f, true);
    });
  } else if (id === "layers") {
    const topic = frame("topic", (root.width - 2240) / 2, 420, 2240, root, palette?.soft ?? "#dfede7");
    text(topic, "label", 100, 70, 1900, 150, de ? "[Themengebiet]" : "[Topic area]", 92, true);
    text(topic, "context", 100, 250, 650, 340, de ? "[Zusammenhang]\n\nWie gehört das Detail zum Gesamtbild?" : "[Context]\n\nHow does the detail fit the big picture?", 48);
    const inset = topic.width * 0.05;
    const detail = frame("detail", topic.x + topic.width - inset - 1120, topic.y + topic.height - inset - 630, 1120, topic, palette?.strong ?? "#beddd2");
    text(detail, "label", 60, 45, 1000, 120, de ? "[Detail]" : "[Detail]", 65, true);
    text(detail, "context", 60, 195, 410, 320, de ? "[Erklärung]\n[Bezug zum Thema]" : "[Explanation]\n[Link to the topic]", 34);
    const evidence = region("evidence", detail.x + detail.width - detail.width * 0.05 - 520, detail.y + detail.height - detail.width * 0.05 - 520 * 9 / 16, de ? "[Beleg]" : "[Evidence]", detail, 520);
    stop(topic, true); stop(detail, true); stop(evidence, true); stop(detail); stop(topic);
  } else {
    const width = 960, margin = 280, top = 440;
    const left = region("left", margin, top, de ? "[Perspektive A]" : "[Perspective A]", root, width);
    const right = region("right", root.width - margin - width, top, de ? "[Perspektive B]" : "[Perspective B]", root, width, palette?.secondary ?? "#efe6d9");
    const synthesis = region("synthesis", (root.width - width) / 2, 1180, de ? "[Gemeinsames Fazit]" : "[Shared conclusion]", root, width, strong);
    const junctionY = (left.y + left.height + synthesis.y) / 2;
    line(root, "left-link", { glue: surface(left), site: "bottom" }, { x: centerX(left), y: junctionY });
    line(root, "right-link", { glue: surface(right), site: "bottom" }, { x: centerX(right), y: junctionY });
    line(root, "bridge", { x: centerX(left), y: junctionY }, { x: centerX(right), y: junctionY });
    line(root, "conclusion-link", { x: centerX(synthesis), y: junctionY }, { glue: surface(synthesis), site: "top" });
    stop(left, true); stop(root); stop(right, true); stop(root); stop(synthesis, true);
  }
  stop(root);
  const byId = new Map(elements.map((element) => [element.id, element]));
  return { id, elements: elements.map((element) => element.type === "shape" ? layoutConnector(element, byId) : element), steps };
}
