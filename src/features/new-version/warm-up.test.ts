import { describe, expect, it, vi } from "vitest";
import { warmUp } from "./warm-up";

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
    warmUp([first, second], { after: clock.after, online: () => true });
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
      { after: clock.after, online: () => true },
    );
    clock.fire();
    await flush();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing while the iPad says it is offline", async () => {
    const load = vi.fn(async () => {});
    const clock = manual();
    warmUp([load], { after: clock.after, online: () => false });
    clock.fire();
    await flush();
    expect(load).not.toHaveBeenCalled();
  });

  it("fetches nothing once cancelled", async () => {
    const load = vi.fn(async () => {});
    const clock = manual();
    const cancel = warmUp([load], { after: clock.after, online: () => true });
    cancel();
    expect(clock.cancel).toHaveBeenCalled();
    clock.fire();
    await flush();
    expect(load).not.toHaveBeenCalled();
  });
});
