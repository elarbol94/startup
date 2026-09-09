import type { TemplatePalette } from "./presentation-template-palettes";
import type { PresentationElement, PresentationFrameElement, PresentationStep } from "./presentation";
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
  // The renderer rotates lines around their midpoint, not their starting point.
  function line(parent: PresentationFrameElement, key: string, x1: number, y1: number, x2: number, y2: number) {
    const width = Math.hypot(x2 - x1, y2 - y1);
    elements.push({ id: `${id}-${key}`, type: "shape", parentId: parent.id,
      x: (x1 + x2) / 2 - width / 2, y: (y1 + y2) / 2 - 10, width, height: 20,
      rotation: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI,
      content: { shape: "line", fill: "", stroke: palette?.connector ?? "#88b5ad", strokeWidth: 5, opacity: 1 } });
  }
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
    if (organic) elements.push({ id: `${f.id}-disc`, type: "shape", parentId: f.id, x, y, width, height: f.height, rotation: 0, content: { shape: "ellipse", fill, stroke: accent, strokeWidth: 2, opacity: 1 } });
    const scale = width / 800;
    const body = de ? "[Kerngedanke]\n[Beispiel oder Beleg]" : "[Key idea]\n[Example or evidence]";
    if (organic) {
      const headingSize = Math.round(42 * scale), bodySize = Math.round(32 * scale);
      const headingHeight = headingSize * 1.15, bodyHeight = bodySize * 1.15 * 2;
      const gap = 24 * scale;
      const top = (f.height - headingHeight - gap - bodyHeight) / 2;
      text(f, "label", 125 * scale, top, 550 * scale, headingHeight + 2, label, headingSize, true, ink, "center");
      text(f, "body", 125 * scale, top + headingHeight + gap, 550 * scale, bodyHeight + 2, body, bodySize, false, ink, "center");
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
    line(root, "north-link", cx, north.y + north.height, cx, center.y);
    line(root, "south-link", cx, center.y + center.height, cx, south.y);
    line(root, "west-link", west.x + west.width, cy, center.x, cy);
    line(root, "east-link", center.x + center.width, cy, east.x, cy);
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
    line(root, "route", centerX(milestones[0]), axisY, centerX(milestones[3]), axisY);
    milestones.forEach((f, i) => {
      line(root, `connection-${i}`, centerX(f), Math.min(axisY, i % 2 ? f.y : f.y + f.height), centerX(f), Math.max(axisY, i % 2 ? f.y : f.y + f.height));
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
    line(root, "left-link", centerX(left), left.y + left.height, centerX(left), junctionY);
    line(root, "right-link", centerX(right), right.y + right.height, centerX(right), junctionY);
    line(root, "bridge", centerX(left), junctionY, centerX(right), junctionY);
    line(root, "conclusion-link", centerX(synthesis), junctionY, centerX(synthesis), synthesis.y);
    stop(left, true); stop(root); stop(right, true); stop(root); stop(synthesis, true);
  }
  stop(root);
  return { id, elements, steps };
}
