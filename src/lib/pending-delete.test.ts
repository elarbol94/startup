import { describe, expect, it, vi } from "vitest";
import { createPendingDeleteQueue } from "./pending-delete";

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 0;
  return {
    timers: {
      setTimer: (fn: () => void) => {
        pending.set(next, fn);
        return next++;
      },
      clearTimer: (handle: unknown) => void pending.delete(handle as number),
    },
    fireAll: () => {
      const fns = [...pending.values()];
      pending.clear();
      fns.forEach((fn) => fn());
    },
    count: () => pending.size,
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pending delete queue", () => {
  it("hides ids immediately and commits after the timeout", async () => {
    const clock = fakeTimers();
    const queue = createPendingDeleteQueue({ timers: clock.timers });
    const commit = vi.fn(async () => {});
    const onCommitted = vi.fn();
    queue.schedule({ hiddenIds: ["a", "b"], commit, onCommitted });
    expect([...queue.hiddenIds()]).toEqual(["a", "b"]);
    expect(commit).not.toHaveBeenCalled();
    clock.fireAll();
    await tick();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(queue.hiddenIds().size).toBe(0);
  });

  it("cancels on undo without committing", async () => {
    const clock = fakeTimers();
    const queue = createPendingDeleteQueue({ timers: clock.timers });
    const commit = vi.fn(async () => {});
    const listener = vi.fn();
    queue.subscribe(listener);
    const key = queue.schedule({ hiddenIds: ["a"], commit });
    expect(queue.cancel(key)).toBe(true);
    expect(clock.count()).toBe(0);
    clock.fireAll();
    await tick();
    expect(commit).not.toHaveBeenCalled();
    expect(queue.hiddenIds().size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(queue.cancel(key)).toBe(false);
  });

  it("flushes pending entries immediately and only once", async () => {
    const clock = fakeTimers();
    const queue = createPendingDeleteQueue({ timers: clock.timers });
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    queue.schedule({ hiddenIds: ["a"], commit: first });
    queue.schedule({ hiddenIds: ["b"], commit: second });
    await queue.flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(clock.count()).toBe(0);
    expect(queue.size()).toBe(0);
    await queue.flush();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("un-hides and reports errors from failed commits", async () => {
    const clock = fakeTimers();
    const queue = createPendingDeleteQueue({ timers: clock.timers });
    const onError = vi.fn();
    const onCommitted = vi.fn();
    queue.schedule({ hiddenIds: ["a"], commit: async () => "blocked", onError, onCommitted });
    queue.schedule({
      hiddenIds: ["b"],
      commit: async () => {
        throw new Error("boom");
      },
      onError,
    });
    await queue.flush();
    expect(onError).toHaveBeenNthCalledWith(1, "blocked");
    expect(onError).toHaveBeenNthCalledWith(2, undefined);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(queue.hiddenIds().size).toBe(0);
  });
});
