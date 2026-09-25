import { describe, expect, it } from "vitest";
import { deriveSaveStatus } from "./save-status";

describe("deriveSaveStatus", () => {
  it("only reports saved when the transport says everything is stored", () => {
    expect(deriveSaveStatus({ status: "saved", savedAt: 5 })).toEqual({ state: "saved", reason: null, savedAt: 5 });
    expect(deriveSaveStatus({ status: "saving" }).state).toBe("saving");
    expect(deriveSaveStatus({ status: "connecting" }).state).toBe("connecting");
  });

  it("reports a lost connection as offline, never as saved", () => {
    expect(deriveSaveStatus({ status: "reconnecting", savedAt: 5 })).toEqual({ state: "offline", reason: null, savedAt: 5 });
  });

  it("turns a stalled save into unsaved", () => {
    expect(deriveSaveStatus({ status: "saving", stalled: true }).state).toBe("unsaved");
    expect(deriveSaveStatus({ status: "saved", stalled: true }).state).toBe("saved");
  });

  it("keeps the reason of failed saves and lost access", () => {
    expect(deriveSaveStatus({ status: "error", errorReason: "tooLarge" })).toMatchObject({ state: "error", reason: "tooLarge" });
    expect(deriveSaveStatus({ status: "denied" })).toMatchObject({ state: "error", reason: "denied" });
  });
});
