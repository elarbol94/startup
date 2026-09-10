import * as Y from "yjs";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { presentationCanvasReducer, type PresentationCanvasAction, type PresentationCanvasState } from "../lib/presentation";
import { LOCAL, patchPresentation, presentationJSON } from "./codec";
import { presentationValuesEqual } from "../lib/presentation-merge";
import type { CollaborationProvider } from "./provider";

const snapshotOf = (state: PresentationCanvasState) => ({ elements: state.elements, steps: state.steps, title: state.title, settings: state.settings, background: state.background });

/** Imperative adapter between canvas gestures and the external shared document. */
export class PresentationBridge {
  private state: PresentationCanvasState;
  undo: Y.UndoManager | null = null;
  constructor(private provider: CollaborationProvider | null, initial: PresentationCanvasState, private notify: (action: PresentationCanvasAction) => void) { this.state = initial; }
  connect = () => {
    if (!this.provider) return () => {};
    const doc = this.provider.doc;
    this.undo = new Y.UndoManager(doc, { trackedOrigins: new Set([LOCAL, ySyncPluginKey]) });
    doc.on("afterTransaction", this.sync);
    this.sync();
    return () => { doc.off("afterTransaction", this.sync); this.undo?.destroy(); this.undo = null; };
  };
  private sync = () => {
    if (!this.provider) return;
    const snapshot = presentationJSON(this.provider.doc);
    if (presentationValuesEqual(snapshotOf(this.state), snapshot)) return;
    this.state = { ...this.state, ...snapshot, dirty: false, failed: false };
    this.notify({ type: "shared", snapshot });
  };
  dispatch = (action: PresentationCanvasAction) => {
    if (this.provider && action.type === "undo") { this.undo?.undo(); return; }
    if (this.provider && action.type === "redo") { this.undo?.redo(); return; }
    const previous = this.state;
    const next = presentationCanvasReducer(previous, action);
    if (next === previous) return;
    this.state = next;
    if (this.provider && ["edit", "touch", "geometry", "source-headings"].includes(action.type)) {
      if (presentationValuesEqual(snapshotOf(previous), snapshotOf(next))) { this.notify(action); return; }
      patchPresentation(this.provider.doc, previous, next);
      const snapshot = presentationJSON(this.provider.doc);
      this.state = { ...next, ...snapshot, dirty: false, failed: false };
      this.notify({ type: "shared", snapshot });
    } else this.notify(action);
  };
}
