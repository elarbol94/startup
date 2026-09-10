import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { commentHighlightDecorations, type CommentHighlightThread } from "./comment-highlight-extension";

const schema = new Schema({
  nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*" }, text: {} },
  marks: { comment: { attrs: { threadId: { default: null }, threadIds: { default: [] } } }, bold: {} },
});
const thread: CommentHighlightThread = {
  id: "thread-1", resolvedAt: null, createdBy: "author", createdByMarkColor: "blue",
  comments: [{ id: "message-1" }],
};
function doc(ids = [thread.id], bold = false) {
  return schema.node("doc", null, [schema.node("paragraph", null, schema.text("Commented text", [
    schema.mark("comment", { threadIds: ids }), ...(bold ? [schema.mark("bold")] : []),
  ]))]);
}
function highlights(threads: CommentHighlightThread[], document = doc()) {
  return commentHighlightDecorations(document, { threads, activeThreadId: thread.id }).find();
}

describe("comment highlight visibility", () => {
  it("never highlights a stored anchor without a live comment", () => {
    expect(highlights([])).toHaveLength(0);
    expect(highlights([{ ...thread, comments: [] }])).toHaveLength(0);
  });
  it("removes the highlight on deletion and restores it on undo", () => {
    expect(highlights([thread])).toHaveLength(1);
    expect(highlights([])).toHaveLength(0);
    expect(highlights([thread])).toHaveLength(1);
  });
  it("keeps deleted anchors plain after formatting and serialization", () => {
    const reloaded = schema.nodeFromJSON(doc([thread.id], true).toJSON());
    expect(highlights([], reloaded)).toHaveLength(0);
    expect(reloaded.textContent).toBe("Commented text");
    expect(reloaded.firstChild?.firstChild?.marks.some((mark) => mark.type.name === "bold")).toBe(true);
  });
  it("retains highlighting while any overlapping thread has a comment", () => {
    const document = doc([thread.id, "thread-2"]);
    expect(highlights([{ ...thread, id: "thread-2" }], document)).toHaveLength(1);
    expect(highlights([], document)).toHaveLength(0);
  });
});
