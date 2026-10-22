import { describe, expect, it } from "vitest";
import { presentationSettingsSchema } from "./presentation-model";
import { restorePresentationLocation } from "./presentation-location";
import { exitPresentationDetail, presentationStops } from "./presentation-details";
import type { PresentationElement } from "./presentation-model";

const frame = (id: string, parentId?: string, detailId?: string): PresentationElement => ({
  id, type: "frame", parentId, detailId, x: 0, y: id === "root" ? 0 : 100000, width: 960, height: 540,
  rotation: 0, content: { label: id, shape: "rect", color: "" },
});
const elements = [frame("root"), frame("outer", "root", "page"), frame("page"), frame("inner", "page", "nested"), frame("nested")];
const steps = [{ id: "root-stop", elementId: "root" }, { id: "page-stop", elementId: "page" }, { id: "nested-stop", elementId: "nested" }];

describe("reloadable presentation locations", () => {
  it("restores the second detail level and rebuilds both parent returns even for unlisted openers", () => {
    const stops = presentationStops(elements, steps);
    const position = restorePresentationLocation(elements, stops, { sceneId: "nested", stepId: "nested-stop" });
    expect(position).toEqual({ index: 2, returns: [0, 1] });
    const parent = exitPresentationDetail(elements, stops, position)!;
    expect(parent).toEqual({ index: 1, returns: [0] });
    expect(exitPresentationDetail(elements, stops, parent)).toEqual({ index: 0, returns: [] });
  });
  it("uses stable stop identities when the path is reordered", () => {
    const stops = presentationStops(elements, [steps[2], steps[0], steps[1]]);
    expect(restorePresentationLocation(elements, stops, { sceneId: "nested", stepId: "nested-stop" })).toEqual({ index: 0, returns: [1, 2] });
  });
  it("rejects stale scenes and cross-scene stop identities and falls back within a valid scene", () => {
    const stops = presentationStops(elements, steps);
    expect(restorePresentationLocation(elements, stops, { sceneId: "deleted", stepId: "nested-stop" })).toEqual({ index: 0, returns: [] });
    expect(restorePresentationLocation(elements, stops, { sceneId: "page", stepId: "nested-stop" })).toEqual({ index: 1, returns: [0] });
  });
  it("retains from-current-stop links and supplies their nested return trail", () => {
    const stops = presentationStops(elements, steps);
    expect(restorePresentationLocation(elements, stops, {}, "nested-stop")).toEqual({ index: 2, returns: [0, 1] });
    expect(restorePresentationLocation([], [], {})).toEqual({ index: -1, returns: [] });
  });
});

describe("presentation start preferences", () => {
  it("keeps legacy decks in path mode and accepts an explicit saved free mode", () => {
    expect(presentationSettingsSchema.parse({}).startMode).toBe("path");
    expect(presentationSettingsSchema.parse({ startMode: "free" }).startMode).toBe("free");
    expect(presentationSettingsSchema.safeParse({ startMode: "anything" }).success).toBe(false);
  });
});
