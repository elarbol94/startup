import { describe, expect, it } from "vitest";
import { presentationSaveState, type PresentationSaveInput } from "./presentation-save-state";

const input = (overrides: Partial<PresentationSaveInput>): PresentationSaveInput => ({
  collaboration: { status: "saved", hasPendingChanges: false }, online: true, local: "idle", dirty: false, failed: false, ...overrides,
});

describe("presentationSaveState", () => {
  it("ignores the canvas dirty flag while collaborating", () => {
    expect(presentationSaveState(input({ dirty: true, local: "error" }))).toBe("saved");
  });
  it("reports pending changes as saving while connected", () => {
    expect(presentationSaveState(input({ collaboration: { status: "saving", hasPendingChanges: true } }))).toBe("saving");
  });
  it("holds pending changes offline when the browser is offline or the transport reconnects", () => {
    expect(presentationSaveState(input({ online: false, collaboration: { status: "saving", hasPendingChanges: true } }))).toBe("offline");
    expect(presentationSaveState(input({ collaboration: { status: "reconnecting", hasPendingChanges: true } }))).toBe("offline");
  });
  it("is saved when reconnecting without anything pending", () => {
    expect(presentationSaveState(input({ online: false, collaboration: { status: "reconnecting", hasPendingChanges: false } }))).toBe("saved");
  });
  it("reports refused writes as errors", () => {
    expect(presentationSaveState(input({ collaboration: { status: "denied", hasPendingChanges: true } }))).toBe("error");
    expect(presentationSaveState(input({ collaboration: { status: "error", hasPendingChanges: true } }))).toBe("error");
  });
  it("keeps the local bookkeeping without collaboration", () => {
    expect(presentationSaveState(input({ collaboration: null, dirty: true }))).toBe("unsaved");
    expect(presentationSaveState(input({ collaboration: null, dirty: true, failed: true }))).toBe("error");
    expect(presentationSaveState(input({ collaboration: null, local: "saving", dirty: true }))).toBe("saving");
    expect(presentationSaveState(input({ collaboration: null, local: "saved" }))).toBe("saved");
  });
});
