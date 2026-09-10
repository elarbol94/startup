import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { decode, encode } from "./codec";
import type { CollaborationProvider } from "./provider";

export function collaborationCursors(provider: CollaborationProvider) {
  const key = new PluginKey("collaboration-cursors");
  return Extension.create({
    name: "collaborationCursors",
    addProseMirrorPlugins() {
      return [new Plugin({
        key,
        state: { init: () => 0, apply: (_tr, value) => value + 1 },
        view(view) {
          const unsubscribe = provider.subscribe(() => { if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true)); });
          return {
            update(view) {
              const binding = ySyncPluginKey.getState(view.state)?.binding;
              if (!binding) return;
              const { anchor, head } = view.state.selection;
              try {
                provider.setPresence({ cursor: {
                  anchor: encode(Y.encodeRelativePosition(absolutePositionToRelativePosition(anchor, binding.type, binding.mapping))),
                  head: encode(Y.encodeRelativePosition(absolutePositionToRelativePosition(head, binding.type, binding.mapping))),
                } });
              } catch { /* Structural edits may temporarily have no mapped position. */ }
            },
            destroy: unsubscribe,
          };
        },
        props: {
          decorations(state) {
            const binding = ySyncPluginKey.getState(state)?.binding;
            if (!binding) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            for (const person of provider.people) {
              if (!person.cursor) continue;
              try {
                const anchor = relativePositionToAbsolutePosition(provider.doc, binding.type, Y.decodeRelativePosition(decode(person.cursor.anchor)), binding.mapping);
                const head = relativePositionToAbsolutePosition(provider.doc, binding.type, Y.decodeRelativePosition(decode(person.cursor.head)), binding.mapping);
                if (anchor === null || head === null) continue;
                if (anchor !== head) decorations.push(Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), { style: "background:rgba(99,102,241,.15)" }));
                decorations.push(Decoration.widget(head, () => {
                  const cursor = document.createElement("span");
                  cursor.style.cssText = "border-left:2px solid #6366f1;position:relative;pointer-events:none";
                  const label = document.createElement("span"); label.textContent = person.name;
                  label.style.cssText = "position:absolute;bottom:100%;left:0;background:#4338ca;color:white;font:10px sans-serif;padding:2px 4px;white-space:nowrap;border-radius:3px";
                  cursor.append(label); return cursor;
                }, { key: person.client, side: 1 }));
              } catch { /* Expired presence is harmless. */ }
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      })];
    },
  });
}
