import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { CollaborationProvider } from "./provider";
import { PresentationBridge } from "./presentation-bridge";
import { defaultPresentationSettings, initialPresentationCanvasState } from "../lib/presentation";
import { LOCAL, patchPresentation, presentationJSON, REMOTE } from "./codec";

it("ignores rich-text normalization but retains actual text edits in undo history", () => {
  const provider = new CollaborationProvider("presentation", "normalization-test");
  const empty = { title: "Text", elements: [], steps: [], background: "", settings: defaultPresentationSettings };
  provider.doc.getMap("settings").set("title", empty.title);
  provider.doc.getMap("settings").set("background", empty.background);
  provider.doc.getMap("settings").set("settings", empty.settings);
  patchPresentation(provider.doc, empty, { ...empty, elements: [{ id: "a", type: "text", x: 0, y: 0, width: 200, height: 100, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" } }] });
  const source = presentationJSON(provider.doc);
  const bridge = new PresentationBridge(provider, initialPresentationCanvasState(source.elements, [], "", source.settings, "Text"), () => {});
  const stop = bridge.connect();
  const text = (provider.doc.getXmlFragment("rich:a").get(0) as Y.XmlElement).get(0) as Y.XmlText;
  provider.doc.transact(() => { text.delete(0, text.length); text.insert(0, "Hello"); }, ySyncPluginKey);
  expect(bridge.undo!.canUndo()).toBe(false);
  provider.doc.transact(() => text.insert(5, " edited"), ySyncPluginKey);
  expect(bridge.undo!.canUndo()).toBe(true);
  bridge.dispatch({ type: "undo" });
  expect(presentationJSON(provider.doc).elements[0]).toMatchObject({ content: { text: "Hello" } });
  expect(bridge.undo!.canUndo()).toBe(false);
  expect(bridge.undo!.canRedo()).toBe(true);
  stop();
});

it("does not feed unchanged React Flow geometry back into the render loop", () => {
  const provider = new CollaborationProvider("presentation", "test");
  const doc = provider.doc;
  const empty = { title: "Empty", elements: [], steps: [], background: "", settings: defaultPresentationSettings };
  patchPresentation(doc, { ...empty, settings: {} as typeof defaultPresentationSettings }, { ...empty, elements: [{ id: "a", type: "text", x: 100, y: 100, width: 200, height: 100, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" } }] });
  doc.getMap("settings").set("background", "");
  doc.getMap("settings").set("title", "Empty");
  const source = presentationJSON(doc);
  const initial = initialPresentationCanvasState(source.elements, source.steps, source.background, source.settings, source.title);
  const render = vi.fn(); const bridge = new PresentationBridge(provider, initial, render); const stop = bridge.connect(); render.mockClear();
  for (let i = 0; i < 100; i++) bridge.dispatch({ type: "geometry", at: i, tolerance: 0, gesture: false, changes: [{ id: "a", x: 100, y: 100 }] });
  doc.transact(() => {}, REMOTE);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(doc), REMOTE);
  expect(render).not.toHaveBeenCalled();
  bridge.dispatch({ type: "edit", at: Date.now(), elements: elements => elements.map(element => ({ ...element, x: 200 })) });
  expect(presentationJSON(doc).elements[0].x).toBe(200); expect(render).toHaveBeenCalled();
  render.mockClear(); doc.transact(() => doc.getMap<Y.Map<unknown>>("elements").get("a")!.set("y", 300), LOCAL);
  expect(render).toHaveBeenCalledTimes(1);
  bridge.undo!.stopCapturing();
  const text = (doc.getXmlFragment("rich:a").get(0) as Y.XmlElement).get(0) as Y.XmlText;
  doc.transact(() => text.insert(5, " local"), ySyncPluginKey);
  bridge.dispatch({ type: "undo" });
  expect(text.toString()).toBe("Hello");
  expect(presentationJSON(doc).elements[0]).toMatchObject({ x: 200, y: 300 });
  stop();
});

it("keeps a paused gesture in one undo step and separates the next command", () => {
  vi.useFakeTimers();
  const provider = new CollaborationProvider("presentation", "gesture-test");
  const empty = { title: "Gesture", elements: [], steps: [], background: "", settings: defaultPresentationSettings };
  patchPresentation(provider.doc, empty, { ...empty, elements: [{ id: "a", type: "text", x: 0, y: 0, width: 200, height: 100, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" } }] });
  const source = presentationJSON(provider.doc);
  const bridge = new PresentationBridge(provider, initialPresentationCanvasState(source.elements, [], "", source.settings, "Gesture"), () => {});
  const stop = bridge.connect();
  bridge.dispatch({ type: "gesture-start" });
  bridge.dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: true, changes: [{ id: "a", x: 50 }] });
  vi.advanceTimersByTime(2000);
  bridge.dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: true, changes: [{ id: "a", x: 100 }] });
  bridge.dispatch({ type: "gesture-end" });
  bridge.dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => current.map(e => ({ ...e, y: 80 })) });
  bridge.dispatch({ type: "undo" });
  expect(presentationJSON(provider.doc).elements[0]).toMatchObject({ x: 100, y: 0 });
  bridge.dispatch({ type: "undo" });
  expect(presentationJSON(provider.doc).elements[0]).toMatchObject({ x: 0, y: 0 });
  expect(bridge.undo!.canRedo()).toBe(true);
  bridge.dispatch({ type: "reset", snapshot: presentationJSON(provider.doc) });
  expect(bridge.undo!.canUndo()).toBe(false);
  expect(bridge.undo!.canRedo()).toBe(false);
  stop(); vi.useRealTimers();
});


it("cancels a gesture without undoing remote work or an earlier local edit", () => {
  const provider = new CollaborationProvider("presentation", "cancel-test");
  const empty = { title: "Cancel", elements: [], steps: [], background: "", settings: defaultPresentationSettings };
  patchPresentation(provider.doc, empty, { ...empty, elements: [{ id: "a", type: "text", x: 0, y: 0, width: 200, height: 100, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" } }] });
  const source = presentationJSON(provider.doc);
  const bridge = new PresentationBridge(provider, initialPresentationCanvasState(source.elements, [], "", source.settings, "Cancel"), () => {});
  const stop = bridge.connect();
  bridge.dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => current.map(e => ({ ...e, y: 20 })) });
  bridge.dispatch({ type: "gesture-start" });
  bridge.dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: true, changes: [{ id: "a", x: 100 }] });
  provider.doc.transact(() => provider.doc.getMap<Y.Map<unknown>>("elements").get("a")!.set("width", 300), REMOTE);
  expect(bridge.cancelGesture()).toBe(true);
  expect(presentationJSON(provider.doc).elements[0]).toMatchObject({ x: 0, y: 20, width: 300 });
  expect(bridge.undo!.canRedo()).toBe(false);
  expect(bridge.cancelGesture()).toBe(false);
  bridge.dispatch({ type: "undo" });
  expect(presentationJSON(provider.doc).elements[0]).toMatchObject({ y: 0, width: 300 });
  stop();
});


it("keeps local snap guides when projecting a collaborative geometry update", () => {
  const provider = new CollaborationProvider("presentation", "guides-test");
  const empty = { title: "Guides", elements: [], steps: [], background: "", settings: defaultPresentationSettings };
  patchPresentation(provider.doc, empty, { ...empty, elements: [0, 150, 500].map((x, i) => ({ id: String(i), type: "text" as const, x, y: 0, width: 100, height: 80, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" as const } })) });
  const source = presentationJSON(provider.doc), render = vi.fn();
  const bridge = new PresentationBridge(provider, initialPresentationCanvasState(source.elements, [], "", source.settings, source.title), render);
  const stop = bridge.connect(); render.mockClear();
  bridge.dispatch({ type: "gesture-start" });
  bridge.dispatch({ type: "geometry", at: Date.now(), tolerance: 8, gesture: true, changes: [{ id: "2", x: 305 }] });
  expect(presentationJSON(provider.doc).elements[2].x).toBe(300);
  expect(render.mock.calls.at(-1)?.[0].guides.filter((guide: { kind?: string }) => guide.kind === "distance")).toHaveLength(2);
  stop();
});


it("does not add undo entries for rich-text initialization that leaves content unchanged", () => {
  const provider = new CollaborationProvider("presentation", "rich-init");
  const empty = { title: "Init", elements: [], steps: [], background: "", settings: defaultPresentationSettings };
  patchPresentation(provider.doc, empty, { ...empty, elements: [{ id: "a", type: "text", x: 0, y: 0, width: 200, height: 100, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" } }] });
  const source = presentationJSON(provider.doc);
  const bridge = new PresentationBridge(provider, initialPresentationCanvasState(source.elements, [], "", source.settings, source.title), () => {});
  const stop = bridge.connect();
  const paragraph = provider.doc.getXmlFragment("rich:a").get(0) as Y.XmlElement;
  provider.doc.transact(() => paragraph.setAttribute("normalization", "default"), ySyncPluginKey);
  expect(bridge.undo!.canUndo()).toBe(false);
  const text = paragraph.get(0) as Y.XmlText;
  provider.doc.transact(() => text.insert(5, " edit"), ySyncPluginKey);
  expect(bridge.undo!.canUndo()).toBe(true);
  bridge.dispatch({ type: "undo" });
  expect(text.toString()).toBe("Hello");
  expect(bridge.undo!.canUndo()).toBe(false);
  stop();
});

it("keeps a drop into a frame, the frame's move and a created frame's stop in one shared undo step each", () => {
  vi.useFakeTimers();
  const provider = new CollaborationProvider("presentation", "frame-membership");
  const empty = { title: "Frames", elements: [], steps: [], background: "", settings: defaultPresentationSettings };
  patchPresentation(provider.doc, empty, { ...empty, elements: [
    { id: "f", type: "frame", x: 0, y: 0, width: 960, height: 540, rotation: 0, content: { label: "Rahmen 1", shape: "rect", color: "" } },
    { id: "a", type: "text", x: 2000, y: 0, width: 200, height: 100, rotation: 0, content: { text: "Hello", fontSize: 32, bold: false, color: "", align: "left" } },
  ] });
  const source = presentationJSON(provider.doc);
  const bridge = new PresentationBridge(provider, initialPresentationCanvasState(source.elements, [], "", source.settings, "Frames"), () => {});
  const stop = bridge.connect();
  const element = (id: string) => presentationJSON(provider.doc).elements.find(e => e.id === id);
  bridge.dispatch({ type: "gesture-start" });
  bridge.dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: true, changes: [{ id: "a", x: 1000 }] });
  vi.advanceTimersByTime(1000);
  bridge.dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: false, changes: [{ id: "a", x: 100, y: 100 }], membership: ["a"] });
  bridge.dispatch({ type: "gesture-end" });
  expect(element("a")).toMatchObject({ x: 100, parentId: "f" });
  vi.advanceTimersByTime(1000);
  bridge.dispatch({ type: "geometry", at: Date.now(), tolerance: 0, gesture: false, changes: [{ id: "f", x: 300 }], membership: ["f"] });
  expect(element("a")).toMatchObject({ x: 400, y: 100 });
  vi.advanceTimersByTime(1000);
  bridge.dispatch({ type: "edit", at: Date.now(), separate: true,
    elements: current => [...current, { id: "g", type: "frame", x: 3000, y: 0, width: 960, height: 540, rotation: 0, content: { label: "Rahmen 2", shape: "rect", color: "" } }],
    steps: current => [...current, { id: "s", elementId: "g" }] });
  expect(presentationJSON(provider.doc).steps).toHaveLength(1);
  bridge.dispatch({ type: "undo" });
  expect(element("g")).toBeUndefined(); expect(presentationJSON(provider.doc).steps).toHaveLength(0);
  bridge.dispatch({ type: "undo" });
  expect(element("f")).toMatchObject({ x: 0 }); expect(element("a")).toMatchObject({ x: 100, parentId: "f" });
  bridge.dispatch({ type: "undo" });
  expect(element("a")).toMatchObject({ x: 2000 }); expect(element("a")).not.toHaveProperty("parentId");
  bridge.dispatch({ type: "redo" });
  expect(element("a")).toMatchObject({ x: 100, parentId: "f" });
  stop(); vi.useRealTimers();
});
