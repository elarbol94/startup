// Tab handling inside the wiki editor. Tab and Shift+Tab move between table cells (Tab in
// the last cell adds a row), list items keep their own indent/outdent keymaps (which run
// first because of their higher priority), and in other text Tab inserts a tab
// character instead of moving focus out of the editor and losing the next keystroke.
// Keyboard users leave the editor with Escape followed by Tab or Shift+Tab.
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { moveToTableCell } from "../../lib/table-navigation";

const LIST_ITEMS = new Set(["listItem", "taskItem"]);
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"]);

export const EditorTabKeymap = Extension.create({
  name: "editorTabKeymap",
  // Below the list item extensions (100) so their sink/lift commands win in lists.
  priority: 90,
  addKeyboardShortcuts() {
    const inList = () => {
      const { $from } = this.editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth -= 1) if (LIST_ITEMS.has($from.node(depth).type.name)) return true;
      return false;
    };
    const move = (direction: 1 | -1) => {
      const tr = moveToTableCell(this.editor.state, direction);
      if (!tr) return false;
      this.editor.view.dispatch(tr);
      return true;
    };
    return {
      Tab: () => {
        if (!this.editor.isEditable) return false;
        if (move(1)) return true;
        // A list item that cannot be indented further keeps focus without changes.
        if (inList()) return true;
        if (!this.editor.state.selection.$from.parent.isTextblock) return true;
        return this.editor.commands.command(({ tr }) => { tr.insertText("\t"); return true; });
      },
      "Shift-Tab": () => {
        if (!this.editor.isEditable) return false;
        if (move(-1)) return true;
        const { selection, doc } = this.editor.state;
        if (!inList() && selection.empty && selection.from > 0 && doc.textBetween(selection.from - 1, selection.from) === "\t") {
          return this.editor.commands.deleteRange({ from: selection.from - 1, to: selection.from });
        }
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    // Escape arms a one-shot exit: the next Tab/Shift+Tab bypasses every editor keymap
    // and performs the browser's normal focus navigation.
    let exitArmed = false;
    return [new Plugin({
      key: new PluginKey("editorTabExit"),
      props: {
        handleDOMEvents: {
          keydown(_view, event) {
            if (event.key === "Escape") { exitArmed = true; return false; }
            if (event.key === "Tab" && exitArmed && !event.ctrlKey && !event.altKey && !event.metaKey) {
              exitArmed = false;
              // True without preventDefault: ProseMirror skips its handlers, the browser moves focus.
              return true;
            }
            if (!MODIFIER_KEYS.has(event.key)) exitArmed = false;
            return false;
          },
          blur() { exitArmed = false; return false; },
        },
      },
    })];
  },
});
