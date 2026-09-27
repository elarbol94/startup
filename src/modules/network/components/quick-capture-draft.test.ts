import { describe, expect, it } from "vitest";
import { emptyCaptureForm, hasCaptureContent, restoreCaptureForm } from "./quick-capture-draft";

describe("quick capture drafts", () => {
  it("counts only real input as a draft", () => {
    expect(hasCaptureContent(emptyCaptureForm)).toBe(false);
    expect(hasCaptureContent({ ...emptyCaptureForm, kind: "intro", metToday: false })).toBe(false);
    expect(hasCaptureContent({ ...emptyCaptureForm, name: "Anna" })).toBe(true);
    expect(hasCaptureContent({ ...emptyCaptureForm, tags: ["Design"] })).toBe(true);
  });

  it("restores a stored draft and repairs malformed fields", () => {
    expect(restoreCaptureForm({
      name: "Sebastian", note: "Kennt jemanden", kind: "intro", tags: ["Förderung", 3], metToday: false,
      municipality: { code: "61108", name: "Leoben" }, metContext: "Party",
    })).toEqual({
      ...emptyCaptureForm, name: "Sebastian", note: "Kennt jemanden", kind: "intro", tags: ["Förderung"], metToday: false,
      municipality: { code: "61108", name: "Leoben" }, metContext: "Party",
    });
    expect(restoreCaptureForm({ name: "Anna", kind: "bogus", municipality: { code: "x", name: "y" } }))
      .toEqual({ ...emptyCaptureForm, name: "Anna" });
    expect(restoreCaptureForm(null)).toBeNull();
    expect(restoreCaptureForm("text")).toBeNull();
    expect(restoreCaptureForm({ kind: "intro" })).toBeNull();
  });
});
