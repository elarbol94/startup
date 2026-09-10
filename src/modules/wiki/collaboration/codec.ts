import { richSchema, toDoc, fromDoc, type Content } from "./rich-text";
import * as Y from "yjs";
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type { TiptapNode } from "../lib/tiptap";
import { normalizeSteps, type PresentationSnapshot } from "../lib/presentation";

export const LOCAL = "collaboration-local";
export const REMOTE = "collaboration-remote";
export type Kind = "page" | "presentation";

// Match y-prosemirror's representation: adjacent marked text shares an XmlText.
export function replaceDocument(fragment: Y.XmlFragment, document: TiptapNode) {
  const children = (nodes: TiptapNode[]): (Y.XmlElement | Y.XmlText)[] => {
    const result: (Y.XmlElement | Y.XmlText)[] = [];
    let textRuns: { insert: string; attributes: Record<string, unknown> }[] = [];
    const flush = () => { if (textRuns.length) { const text = new Y.XmlText(); text.applyDelta(textRuns); result.push(text); textRuns = []; } };
    for (const node of nodes) {
      if (node.type === "text") {
        textRuns.push({ insert: node.text ?? "", attributes: Object.fromEntries((node.marks ?? []).map(mark => [mark.type!, mark.attrs ?? {}])) });
      } else {
        flush();
        const element = new Y.XmlElement(node.type!);
        for (const [key, value] of Object.entries(node.attrs ?? {})) if (value !== null) element.setAttribute(key, value as string);
        element.insert(0, children(node.content ?? []));
        result.push(element);
      }
    }
    flush();
    return result;
  };
  fragment.delete(0, fragment.length);
  fragment.insert(0, children(document.content ?? []));
}
export const documentJSON = (doc: Y.Doc) => yXmlFragmentToProsemirrorJSON(doc.getXmlFragment("body")) as TiptapNode;

function editText(target: Y.Text, value: string) {
  const old = target.toString();
  let start = 0;
  while (start < old.length && start < value.length && old[start] === value[start]) start++;
  let end = 0;
  while (end < old.length - start && end < value.length - start && old[old.length - 1 - end] === value[value.length - 1 - end]) end++;
  if (old.length - start - end) target.delete(start, old.length - start - end);
  if (value.length - start - end) target.insert(start, value.slice(start, value.length - end));
}
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const textKeys = new Set(["text", "title", "label", "notes", "alt"]);
export function patchMap(map: Y.Map<unknown>, before: Record<string, unknown>, after: Record<string, unknown>) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    const value = after[key];
    if (value === undefined) { map.delete(key); continue; }
    const current = map.get(key);
    if (isObject(value)) {
      const child = current instanceof Y.Map ? current : new Y.Map<unknown>();
      if (child !== current) map.set(key, child);
      patchMap(child, isObject(before[key]) ? before[key] : {}, value);
    } else if (typeof value === "string" && textKeys.has(key)) {
      const child = current instanceof Y.Text ? current : new Y.Text();
      if (child !== current) map.set(key, child);
      editText(child, value);
    } else map.set(key, value);
  }
}

function patchCollection(doc: Y.Doc, name: string, before: { id: string }[], after: { id: string }[]) {
  const items = doc.getMap<Y.Map<unknown>>(name);
  const removed = doc.getMap<boolean>(`${name}-deleted`);
  const order = doc.getArray<string>(`${name}-order`);
  const old = new Map(before.map(item => [item.id, item]));
  const next = new Set(after.map(item => item.id));
  for (const item of before) if (!next.has(item.id)) removed.set(item.id, true);
  for (const item of after) {
    if (removed.has(item.id)) continue;
    let map = items.get(item.id);
    if (!map) { map = new Y.Map(); items.set(item.id, map); }
    patchMap(map, old.get(item.id) ?? {}, item);
    if (name === "elements" && "type" in item && item.type === "text") {
      const next = item as unknown as { content: Content };
      const previous = old.get(item.id) as unknown as { content: Content } | undefined;
      if (!same(previous?.content.text, next.content.text) || !same(previous?.content.runs, next.content.runs)) {
        const fragment = doc.getXmlFragment(`rich:${item.id}`);
        const json = toDoc(next.content);
        if (!same(yXmlFragmentToProsemirrorJSON(fragment), json)) updateYFragment(doc, fragment, richSchema.nodeFromJSON(json), { mapping: new Map(), isOMark: new Map() });
      }
    }
  }
  if (!same(before.map(item => item.id), after.map(item => item.id))) {
    order.delete(0, order.length);
    order.insert(0, after.map(item => item.id));
  }
}
function collection(doc: Y.Doc, name: string) {
  const items = doc.getMap<Y.Map<unknown>>(name);
  const removed = doc.getMap<boolean>(`${name}-deleted`);
  return [...new Set([...doc.getArray<string>(`${name}-order`).toArray(), ...[...items.keys()].sort()])]
    .filter(id => items.has(id) && !removed.has(id)).map(id => items.get(id)!.toJSON());
}
export function patchPresentation(doc: Y.Doc, before: PresentationSnapshot, after: PresentationSnapshot) {
  doc.transact(() => {
    patchCollection(doc, "elements", before.elements, after.elements);
    patchCollection(doc, "steps", before.steps, after.steps);
    patchMap(doc.getMap("settings"), { background: before.background, settings: before.settings, title: before.title }, { background: after.background, settings: after.settings, title: after.title });
  }, LOCAL);
}
export function presentationJSON(doc: Y.Doc): PresentationSnapshot {
  const elements = (collection(doc, "elements") as PresentationSnapshot["elements"]).map(element => {
    if (element.type !== "text") return element;
    const fragment = doc.getXmlFragment(`rich:${element.id}`);
    return { ...element, content: { ...element.content, ...fromDoc(yXmlFragmentToProsemirrorJSON(fragment)) } };
  });
  const steps = collection(doc, "steps") as PresentationSnapshot["steps"];
  return { ...doc.getMap("settings").toJSON(), elements, steps: normalizeSteps(steps, elements) } as PresentationSnapshot;
}
export function seedPage(doc: Y.Doc, content: TiptapNode, documentMode: boolean, settings: Record<string, unknown>) {
  doc.transact(() => {
    replaceDocument(doc.getXmlFragment("body"), content);
    patchMap(doc.getMap("layout"), {}, { documentMode, settings });
  });
}
export const encode = (bytes: Uint8Array) => {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
export const decode = (value: string) => {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
};
