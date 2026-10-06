import { describe, expect, it, vi } from "vitest";
import { IDLE_TIMEOUT_MS, NO_IDLE_PAUSE_MS, WARM_UP_AFTER_MS, warmUp, whenIdle } from "./warm-up";

function manual() {
  let run: (() => void) | null = null;
  const cancel = vi.fn();
  return {
    after: (fn: () => void) => {
      run = fn;
      return cancel;
    },
    fire: () => run?.(),
    cancel,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const now = () => Promise.resolve();

describe("warmUp", () => {
  it("waits, then fetches each file once, one after the other", async () => {
    const order: string[] = [];
    let finishFirst: () => void = () => {};
    const first = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          order.push("tracker");
          finishFirst = resolve;
        }),
    );
    const second = vi.fn(async () => void order.push("pulse"));
    const clock = manual();
    warmUp([first, second], { after: clock.after, online: () => true, between: now });
    expect(first).not.toHaveBeenCalled();

    clock.fire();
    await flush();
    expect(order).toEqual(["tracker"]);
    finishFirst();
    await flush();
    expect(order).toEqual(["tracker", "pulse"]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("carries on past a file that fails, and throws nothing", async () => {
    const second = vi.fn(async () => {});
    const clock = manual();
    warmUp(
      [
        async () => {
          throw new TypeError("Importing a module script failed.");
        },
        second,
      ],
      { after: clock.after, online: () => true, between: now },
    );
    clock.fire();
    await flush();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing while the iPad says it is offline", async () => {
    const load = vi.fn(async () => {});
    const clock = manual();
    warmUp([load], { after: clock.after, online: () => false, between: now });
    clock.fire();
    await flush();
    expect(load).not.toHaveBeenCalled();
  });

  it("fetches nothing once cancelled", async () => {
    const load = vi.fn(async () => {});
    const clock = manual();
    const cancel = warmUp([load], { after: clock.after, online: () => true, between: now });
    cancel();
    expect(clock.cancel).toHaveBeenCalled();
    clock.fire();
    await flush();
    expect(load).not.toHaveBeenCalled();
  });

  it("waits for an idle moment between one file and the next", async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const between = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const clock = manual();
    warmUp(
      [async () => void order.push("tracker"), async () => void order.push("profile")],
      { after: clock.after, online: () => true, between },
    );
    clock.fire();
    await flush();
    expect(order).toEqual(["tracker"]);
    expect(between).toHaveBeenCalledTimes(1);
    release();
    await flush();
    expect(order).toEqual(["tracker", "profile"]);
  });

  it("by default starts WARM_UP_AFTER_MS after the shell, then at an idle moment", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn(async () => {});
      warmUp([load], { online: () => true });
      vi.advanceTimersByTime(WARM_UP_AFTER_MS - 1);
      expect(load).not.toHaveBeenCalled();
      // No requestIdleCallback here (as on Safari): a short pause stands in.
      vi.advanceTimersByTime(1 + NO_IDLE_PAUSE_MS);
      await vi.runAllTimersAsync();
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("whenIdle", () => {
  it("asks the browser for an idle moment, no later than the timeout, and can be cancelled", () => {
    const requestIdleCallback = vi.fn((_cb: () => void, _opts?: { timeout: number }) => 7);
    const cancelIdleCallback = vi.fn();
    const run = vi.fn();
    const cancel = whenIdle(run, IDLE_TIMEOUT_MS, { requestIdleCallback, cancelIdleCallback });
    expect(requestIdleCallback).toHaveBeenCalledWith(run, { timeout: IDLE_TIMEOUT_MS });
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it("uses a short timer where there is no requestIdleCallback", () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      whenIdle(run, IDLE_TIMEOUT_MS, {});
      vi.advanceTimersByTime(NO_IDLE_PAUSE_MS - 1);
      expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
