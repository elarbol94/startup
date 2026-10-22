import { describe, expect, it } from "vitest";
import { formatElapsed, formatRemaining, parsePresenterMessage, presenterChannelName } from "./presenter";

describe("presenter channel naming", () => {
  it("keeps simultaneous players of the same presentation independent", () => {
    expect(presenterChannelName("abc", "first")).not.toBe(presenterChannelName("abc", "second"));
    expect(presenterChannelName("abc", "first")).not.toBe(presenterChannelName("abc"));
  });
  it("keys the channel name by presentation id", () => {
    expect(presenterChannelName("abc")).not.toBe(presenterChannelName("xyz"));
    expect(presenterChannelName("abc")).toBe(presenterChannelName("abc"));
  });
});

describe("presenter message parsing", () => {
  it("accepts a step message from the player", () => {
    expect(parsePresenterMessage({ type: "step", index: 3 })).toEqual({ type: "step", index: 3 });
  });

  it("accepts a goto message steering the player", () => {
    expect(parsePresenterMessage({ type: "goto", index: 0 })).toEqual({ type: "goto", index: 0 });
  });

  it("carries the detail pages to come back out of, so both windows walk the same path", () => {
    expect(parsePresenterMessage({ type: "step", index: 4, returns: [1, 2] })).toEqual({ type: "step", index: 4, returns: [1, 2] });
    expect(parsePresenterMessage({ type: "goto", index: 2, returns: [3] })).toEqual({ type: "goto", index: 2, returns: [3] });
    expect(parsePresenterMessage({ type: "goto", index: 2, returns: [-1] })).toBeNull();
  });

  it("accepts a request-step message from a freshly opened presenter window", () => {
    expect(parsePresenterMessage({ type: "request-step" })).toEqual({ type: "request-step" });
  });

  it("drops anything that isn't one of this feature's own messages", () => {
    expect(parsePresenterMessage({ type: "unrelated", foo: 1 })).toBeNull();
    expect(parsePresenterMessage(null)).toBeNull();
    expect(parsePresenterMessage("hello")).toBeNull();
    expect(parsePresenterMessage({ type: "step", index: -1 })).toBeNull();
    expect(parsePresenterMessage({ type: "step" })).toBeNull();
  });
});

describe("countdown to a talk's target length", () => {
  it("counts down in whole seconds, rounding up", () => {
    expect(formatRemaining(20 * 60_000, 0)).toBe("20:00");
    expect(formatRemaining(60_000, 500)).toBe("1:00");
    expect(formatRemaining(60_000, 59_500)).toBe("0:01");
    expect(formatRemaining(60_000, 60_000)).toBe("0:00");
  });

  it("shows the overrun with a minus once the target has passed", () => {
    expect(formatRemaining(60_000, 60_001)).toBe("−0:01");
    expect(formatRemaining(60_000, 125_000)).toBe("−1:05");
  });
});

describe("elapsed timer formatting", () => {
  it("formats under a minute", () => {
    expect(formatElapsed(5_000)).toBe("0:05");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsed(125_000)).toBe("2:05");
  });

  it("formats hours once the timer runs long", () => {
    expect(formatElapsed(3_661_000)).toBe("1:01:01");
  });

  it("never goes negative", () => {
    expect(formatElapsed(-500)).toBe("0:00");
  });
});
