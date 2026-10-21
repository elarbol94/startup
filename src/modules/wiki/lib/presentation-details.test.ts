import { describe, expect, it } from "vitest";
import {
  createPresentationDetail,
  enterPresentationDetail,
  exitPresentationDetail,
  presentationDetails,
  presentationElementCaption,
  presentationSceneElements,
  presentationSceneTrail,
  presentationScenePosition,
  presentationStops,
  removePresentationDetail,
  stepPresentationPosition,
  PRESENTATION_DETAIL_ORIGIN,
  type PresentationElement,
  type PresentationStep,
} from "./presentation";

const frame = (id: string, x: number, y: number, extra: Partial<PresentationElement> = {}): PresentationElement =>
  ({ id, type: "frame", x, y, width: 960, height: 540, rotation: 0, content: { label: id, shape: "rect", color: "" }, ...extra }) as PresentationElement;
const box = (id: string, x: number, y: number, extra: Partial<PresentationElement> = {}): PresentationElement =>
  ({ id, type: "shape", x, y, width: 150, height: 100, rotation: 0,
    content: { shape: "roundedRect", fill: "", stroke: "", strokeWidth: 2, opacity: 1, text: id }, ...extra }) as PresentationElement;
const step = (id: string, elementId: string): PresentationStep => ({ id, elementId });

/** An overview frame with two boxes; "lend" opens a detail page that has its own box opening another. */
function deck(): PresentationElement[] {
  return [
    frame("overview", 0, 0),
    box("start", 40, 40, { parentId: "overview" }),
    box("lend", 40, 200, { parentId: "overview", detailId: "lendPage" }),
    frame("lendPage", 0, 100_000),
    box("process", 40, 100_040, { parentId: "lendPage", detailId: "processPage" }),
    frame("processPage", 1400, 100_000),
  ];
}

describe("detail page links", () => {
  it("splits the canvas into the overview and one scene per detail page", () => {
    const elements = deck();
    expect(presentationSceneElements(elements, null).map((e) => e.id)).toEqual(["overview", "start", "lend"]);
    expect(presentationSceneElements(elements, "lendPage").map((e) => e.id)).toEqual(["lendPage", "process"]);
    expect(presentationSceneElements(elements, "processPage").map((e) => e.id)).toEqual(["processPage"]);
  });

  it("lists the way down to a nested page, outermost first", () => {
    expect(presentationSceneTrail(deck(), "processPage").map(({ box }) => box.id)).toEqual(["lend", "process"]);
    expect(presentationSceneTrail(deck(), null)).toEqual([]);
  });

  it("ignores links that could hide content for good", () => {
    const elements = [
      frame("a", 0, 0),
      box("self", 10, 10, { parentId: "a", detailId: "a" }), // opens the frame it sits in
      box("missing", 10, 200, { detailId: "nowhere" }),
      frame("x", 0, 5000), box("toY", 10, 5010, { parentId: "x", detailId: "y" }),
      frame("y", 2000, 5000), box("toX", 2010, 5010, { parentId: "y", detailId: "x" }), // a loop nobody reaches
    ];
    const { boxByFrame } = presentationDetails(elements);
    expect([...boxByFrame.keys()]).toEqual([]);
    expect(presentationSceneElements(elements, null)).toHaveLength(elements.length);
  });

  it("shows a detail page as a normal frame again once the element opening it is gone", () => {
    const elements = deck().filter((element) => element.id !== "lend");
    expect(presentationSceneElements(elements, null).map((e) => e.id)).toContain("lendPage");
  });
});

describe("creating and removing detail pages", () => {
  it("names the page after the box and puts it below the deck", () => {
    const elements = [box("lend", 0, 0, { content: { shape: "rect", fill: "", stroke: "", strokeWidth: 2, opacity: 1, text: "Gegenstands-\nverleih" } } as Partial<PresentationElement>)];
    const next = createPresentationDetail(elements, "lend", "page");
    const page = next.at(-1)!;
    expect(next[0].detailId).toBe("page");
    expect(page).toMatchObject({ type: "frame", y: PRESENTATION_DETAIL_ORIGIN.y, content: { label: "Gegenstandsverleih" } });
    const second = createPresentationDetail([...next, box("ride", 0, 200)], "ride", "page2").at(-1)!;
    expect(second.x).toBeGreaterThan(page.x + page.width);
  });

  it("does not give one element two pages", () => {
    const elements = deck();
    expect(createPresentationDetail(elements, "lend", "again")).toBe(elements);
  });

  it("removes a page with everything on it, nested pages included", () => {
    const next = removePresentationDetail(deck(), "lend");
    expect(next.map((e) => e.id)).toEqual(["overview", "start", "lend"]);
    expect(next.find((e) => e.id === "lend")?.detailId).toBeUndefined();
  });

  it("reads multi-line captions as one phrase", () => {
    expect(presentationElementCaption(box("b", 0, 0, { content: { shape: "rect", fill: "", stroke: "", strokeWidth: 2, opacity: 1, text: " Mitfahr\nbörse " } } as Partial<PresentationElement>))).toBe("Mitfahr börse");
  });
});

describe("presenting detail pages", () => {
  const elements = deck();
  const steps = [step("s1", "overview"), step("s2", "start"), step("d1", "process"), step("s3", "lend")];
  const stops = presentationStops(elements, steps);

  it("keeps each step in its scene and gives step-less pages one stop", () => {
    expect(stops.map((stop) => [stop.step.elementId, stop.sceneId, stop.stepIndex])).toEqual([
      ["overview", null, 0], ["start", null, 1], ["process", "lendPage", 2], ["lend", null, 3], ["processPage", "processPage", null],
    ]);
  });

  it("walks the overview without wandering into detail pages", () => {
    const next = stepPresentationPosition(elements, stops, { index: 1, returns: [] }, 1);
    expect(next).toEqual({ index: 3, returns: [] });
    expect(stepPresentationPosition(elements, stops, next, 1)).toEqual(next);
    expect(presentationScenePosition(stops, 3)).toEqual({ current: 3, total: 3 });
  });

  it("returns to where a page was opened after its last stop", () => {
    const inside = enterPresentationDetail(stops, { index: 1, returns: [] }, "lendPage")!;
    expect(inside).toEqual({ index: 2, returns: [1] });
    const deeper = enterPresentationDetail(stops, inside, "processPage")!;
    expect(deeper).toEqual({ index: 4, returns: [1, 2] });
    expect(stepPresentationPosition(elements, stops, deeper, 1)).toEqual(inside);
    expect(stepPresentationPosition(elements, stops, inside, -1)).toEqual({ index: 1, returns: [] });
  });

  it("finds the way back without history, from the stop of the opening element", () => {
    expect(exitPresentationDetail(elements, stops, { index: 2, returns: [] })).toEqual({ index: 3, returns: [] });
    expect(exitPresentationDetail(elements, stops, { index: 0, returns: [] })).toBeNull();
  });
});
