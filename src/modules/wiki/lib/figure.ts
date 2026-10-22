import type { TiptapNode } from "./tiptap";

export function removeFigureNumberPrefix(caption: string) { return caption.replace(/^\s*(?:abbildung|abb\.|figure|fig\.)\s*(?:\d+|x)(?:\s*[.:—–-]\s*|\s+|$)/i, ""); }
export function stripFigureNumber(caption: string) { return removeFigureNumberPrefix(caption).trim(); }
export function isFigure(type: string | undefined) { return type === "commentableImage" || type === "mermaidDiagram"; }
export function numberedFigure(attrs: Record<string, unknown> = {}) {
  return attrs.numbered !== false && (attrs.numbered === true || attrs.includeInFigureIndex !== false);
}
export type FigureEntry = { nodeId: string; caption: string; number: number; included: boolean; src: string; assetId: string };
export function documentFigures(doc: TiptapNode): FigureEntry[] {
  const figures: FigureEntry[] = [];
  const visit = (node: TiptapNode) => {
    if (isFigure(node.type) && numberedFigure(node.attrs)) figures.push({
      nodeId: String(node.attrs?.nodeId ?? ""), caption: stripFigureNumber(String(node.attrs?.caption ?? "")),
      number: figures.length + 1, included: node.attrs?.includeInFigureIndex !== false,
      src: node.type === "mermaidDiagram" && node.attrs?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(node.attrs.svg))}` : String(node.attrs?.src ?? ""), assetId: String(node.attrs?.assetId ?? ""),
    });
    node.content?.forEach(visit);
  };
  visit(doc);
  return figures;
}
export function hasFigureList(doc: TiptapNode): boolean {
  return doc.type === "figureList" || Boolean(doc.content?.some(hasFigureList));
}
export function relativeFigurePath(input: string, prefix = "") {
  let value = input.trim().replace(/\\/g, "/");
  const base = prefix.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (base && (value.toLowerCase().startsWith(`${base.toLowerCase()}/`))) value = value.slice(base.length + 1);
  if (!value || value.length > 1000 || /[\u0000-\u001f:]/.test(value) || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("invalidPath");
  return value;
}
export type FigureCrop = { x: number; y: number; width: number; height: number };
const finite = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export function figureCrop(value: unknown): FigureCrop {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const x = Math.max(0, Math.min(0.95, finite(input.x, 0)));
  const y = Math.max(0, Math.min(0.95, finite(input.y, 0)));
  return { x, y, width: Math.max(0.05, Math.min(1 - x, finite(input.width, 1))), height: Math.max(0.05, Math.min(1 - y, finite(input.height, 1))) };
}
export function figureWidth(value: unknown) { return Math.max(10, Math.min(100, finite(value, 100))); }
