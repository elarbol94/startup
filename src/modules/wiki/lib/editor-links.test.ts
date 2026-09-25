import { describe, expect, it } from "vitest";
import { EDITOR_LINK_MODIFIER_CLASS, trackEditorLinkModifier } from "./editor-links";

function fakeView() {
  const classes = new Set<string>();
  const toggle = (name: string, on?: boolean) => { if (on) classes.add(name); else classes.delete(name); return Boolean(on); };
  return { classes, view: { dom: { classList: { toggle } } } as unknown as Parameters<typeof trackEditorLinkModifier>[0] };
}

describe("trackEditorLinkModifier", () => {
  it("marks the editor while Ctrl or Meta is held and clears it afterwards", () => {
    const { classes, view } = fakeView();
    trackEditorLinkModifier(view, { type: "mousemove", ctrlKey: true, metaKey: false });
    expect(classes.has(EDITOR_LINK_MODIFIER_CLASS)).toBe(true);
    trackEditorLinkModifier(view, { type: "keyup", ctrlKey: false, metaKey: false });
    expect(classes.has(EDITOR_LINK_MODIFIER_CLASS)).toBe(false);
    trackEditorLinkModifier(view, { type: "keydown", ctrlKey: false, metaKey: true });
    expect(classes.has(EDITOR_LINK_MODIFIER_CLASS)).toBe(true);
    trackEditorLinkModifier(view, { type: "mouseleave", ctrlKey: false, metaKey: true });
    expect(classes.has(EDITOR_LINK_MODIFIER_CLASS)).toBe(false);
  });
});
