import { describe, expect, it } from "vitest";
import { findSimilarContacts } from "../network-utils";
import { emptyCaptureForm, hasCaptureContent, NEW_CONTACT, restoreCaptureForm, selectCaptureTarget } from "./quick-capture-draft";

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

  it("restores 'not spoken yet' and never together with 'met today'", () => {
    expect(hasCaptureContent({ ...emptyCaptureForm, notYetSpoken: true, metToday: false })).toBe(false);
    expect(restoreCaptureForm({ name: "Lena", notYetSpoken: true, metToday: true }))
      .toEqual({ ...emptyCaptureForm, name: "Lena", notYetSpoken: true, metToday: false });
    expect(restoreCaptureForm({ name: "Lena", notYetSpoken: "yes" })).toEqual({ ...emptyCaptureForm, name: "Lena" });
  });
});

describe("quick capture target", () => {
  const contacts = [{ id: "maria", name: "Maria Huber" }, { id: "hueber", name: "Maria Hueber" }];
  const target = (name: string, chosen = "") => selectCaptureTarget(findSimilarContacts(name, contacts), chosen);

  it("preselects an exact match, but never a near-miss", () => {
    expect(target("maria huber")).toBe("maria");
    expect(target("Maria Hubr")).toBe(NEW_CONTACT);
    expect(target("Huber Maria")).toBe(NEW_CONTACT);
    expect(target("Sebastian")).toBe(NEW_CONTACT);
  });

  it("keeps an explicit choice while it is still offered", () => {
    expect(target("Maria Huber", "hueber")).toBe("hueber");
    expect(target("Maria Hubr", "maria")).toBe("maria");
    expect(target("Maria Huber", NEW_CONTACT)).toBe(NEW_CONTACT);
    // A stale choice (e.g. from a restored draft) falls back to the default.
    expect(target("Maria Hubr", "gone")).toBe(NEW_CONTACT);
    expect(target("Sebastian", "maria")).toBe(NEW_CONTACT);
  });
});
