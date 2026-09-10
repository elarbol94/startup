import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { documentJSON, seedPage, patchPresentation, presentationJSON, LOCAL, REMOTE } from "./codec";
import { defaultPresentationSettings, type PresentationSnapshot } from "../lib/presentation";
const clone = (doc: Y.Doc) => { const next = new Y.Doc(); Y.applyUpdate(next, Y.encodeStateAsUpdate(doc)); return next; };
const merge = (docs: Y.Doc[]) => { const updates = docs.map(doc => Y.encodeStateAsUpdate(doc)); docs.forEach(doc => updates.slice().reverse().forEach(update => Y.applyUpdate(doc, update, REMOTE))); };
const empty: PresentationSnapshot = { title: "", elements: [], steps: [], background: "", settings: defaultPresentationSettings };
const deck: PresentationSnapshot = { ...empty, title: "Shared", elements: [{ id: "a", type: "text", x: 0, y: 0, width: 200, height: 100, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" } }] };
function seeded() { const doc = new Y.Doc(); patchPresentation(doc, empty, deck); return doc; }

describe("shared document state", () => {
  it("preserves adjacent marks, custom nodes and attributes when seeding", () => {
    const doc = new Y.Doc(); const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "plain " }, { type: "text", text: "bold", marks: [{ type: "bold", attrs: {} }] }, { type: "text", text: " tail" }] }, { type: "citation", attrs: { items: [{ sourceId: "s" }], label: "[1]" } }] };
    seedPage(doc, content, true, {});
    expect(documentJSON(doc)).toEqual(content);
  });
  it("converges three simultaneous inserts without losing any text, including replay", () => {
    const initial = new Y.Doc(); seedPage(initial, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] }, false, {});
    const docs = [clone(initial), clone(initial), clone(initial)];
    docs.forEach((doc, index) => ((doc.getXmlFragment("body").get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(5, ` user${index}`));
    merge(docs); merge(docs);
    docs.forEach(doc => { const text = JSON.stringify(documentJSON(doc)); for (let index = 0; index < 3; index++) expect(text).toContain(`user${index}`); });
    expect(documentJSON(docs[0])).toEqual(documentJSON(docs[2]));
  });
});
describe("shared presentation", () => {
  it("merges independent fields and character edits by three users", () => {
    const base = seeded();
    const peers = [clone(base), clone(base), clone(base)];
    peers.forEach((doc, index) => {
      const before = presentationJSON(doc);
      const after = structuredClone(before);
      if (index === 0) after.elements[0].x = 99;
      else if (index === 1) after.elements[0].y = 88;
      else after.title = "Renamed";
      patchPresentation(doc, before, after);
      ((doc.getXmlFragment("rich:a").get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(5, ` user${index}`);
    });
    merge(peers);
    const result = presentationJSON(peers[0]);
    expect(result.elements[0]).toMatchObject({ x: 99, y: 88 });
    expect(result.title).toBe("Renamed");
    for (let index = 0; index < 3; index++) expect((result.elements[0].content as { text: string }).text).toContain(`user${index}`);
    expect(result).toEqual(presentationJSON(peers[2]));
  });
  it("deletion wins over concurrent movement and reordering", () => {
    const base = seeded(); const a = clone(base); const b = clone(base);
    patchPresentation(a, deck, { ...deck, elements: [] });
    patchPresentation(b, deck, { ...deck, elements: deck.elements.map(element => ({ ...element, x: 200 })) });
    merge([a, b]); expect(presentationJSON(a).elements).toEqual([]); expect(presentationJSON(b).elements).toEqual([]);
  });
  it("undo affects only local operations", () => {
    const base = seeded(); const a = clone(base); const b = clone(base);
    const undo = new Y.UndoManager(a, { trackedOrigins: new Set([LOCAL]) });
    patchPresentation(a, deck, { ...deck, elements: deck.elements.map(element => ({ ...element, x: 150 })) });
    patchPresentation(b, deck, { ...deck, elements: deck.elements.map(element => ({ ...element, y: 200 })) });
    merge([a, b]); undo.undo(); merge([a, b]);
    expect(presentationJSON(a).elements[0]).toMatchObject({ x: 0, y: 200 });
  });
});

it("converges property conflicts, element ordering and simultaneous speaker notes", () => {
  const base = seeded();
  const initial = { ...deck, elements: [...deck.elements, { ...deck.elements[0], id: "b" }, { ...deck.elements[0], id: "c" }], steps: [{ id: "step", elementId: "a", notes: "Notes" }] };
  patchPresentation(base, deck, initial);
  const peers = [clone(base), clone(base), clone(base)];
  peers.forEach((doc, index) => {
    const before = presentationJSON(doc); const after = structuredClone(before);
    after.elements[0].x = index * 100;
    after.steps[0].notes += ` writer${index}`;
    if (index === 0) after.elements.reverse();
    patchPresentation(doc, before, after);
  });
  merge(peers);
  const result = presentationJSON(peers[0]);
  expect(result.elements.map(element => element.id)).toEqual(["c", "b", "a"]);
  for (let index = 0; index < 3; index++) expect(result.steps[0].notes).toContain(`writer${index}`);
  for (const peer of peers) expect(presentationJSON(peer)).toEqual(result);
});

it("preserves images, tables, references and comment marks during document initialization", () => {
  const document = { type: "doc", content: [
    { type: "image", attrs: { src: "/api/files/image-1", alt: "Existing image", width: 320 } },
    { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: [150] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Cell", marks: [{ type: "bold", attrs: {} }] }] }] }] }] },
    { type: "paragraph", content: [{ type: "text", text: "Commented", marks: [{ type: "comment", attrs: { id: "thread-1" } }] }, { type: "citation", attrs: { items: [{ sourceId: "source-1" }] } }] },
  ] };
  const doc = new Y.Doc(); seedPage(doc, document, true, {});
  expect(documentJSON(clone(doc))).toEqual(document);
});
