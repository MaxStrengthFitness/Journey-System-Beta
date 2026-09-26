import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINISH_WAIT_MS, finishedElsewhere, settleOrQueue, withinOrNull } from "./finish-wait";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const never = <T,>() => new Promise<T>(() => {});

describe("settleOrQueue", () => {
  it("returns the database's answer when it comes in time", async () => {
    const outcome = settleOrQueue(Promise.resolve({ totalsSaved: true }), true);
    await expect(outcome).resolves.toEqual({ kind: "saved", value: { totalsSaved: true } });
  });

  it("reports a refusal that comes in time, as Finish always has", async () => {
    const err = new Error("permission-denied");
    const outcome = settleOrQueue(Promise.reject(err), true);
    await expect(outcome).resolves.toEqual({ kind: "failed", error: err });
  });

  it("stops waiting on a slow connection and takes the save as queued on the iPad", async () => {
    const outcome = settleOrQueue(never(), true);
    await vi.advanceTimersByTimeAsync(FINISH_WAIT_MS - 1);
    let done = false;
    void outcome.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toEqual({ kind: "queued" });
  });

  it("does not wait at all while the iPad knows it is offline", async () => {
    const outcome = settleOrQueue(never(), false);
    await vi.advanceTimersByTimeAsync(0);
    await expect(outcome).resolves.toEqual({ kind: "queued" });
  });

  it("offline, still reports a save the iPad refused at once rather than calling it queued", async () => {
    const err = new Error("invalid data");
    const outcome = settleOrQueue(Promise.reject(err), false);
    await vi.advanceTimersByTimeAsync(0);
    await expect(outcome).resolves.toEqual({ kind: "failed", error: err });
  });
});

describe("withinOrNull", () => {
  it("gives the value in time, and null late or on failure", async () => {
    await expect(withinOrNull(Promise.resolve(5), 100)).resolves.toBe(5);
    await expect(withinOrNull(Promise.reject(new Error("x")), 100)).resolves.toBeNull();
    const late = withinOrNull(never<number>(), 100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(late).resolves.toBeNull();
  });
});

describe("finishedElsewhere", () => {
  it("says yes when the database says the session is already Completed", async () => {
    await expect(finishedElsewhere(async () => "Completed", true)).resolves.toBe(true);
  });

  it("says no for a session still in progress, or with no status", async () => {
    await expect(finishedElsewhere(async () => "In-Progress", true)).resolves.toBe(false);
    await expect(finishedElsewhere(async () => null, true)).resolves.toBe(false);
  });

  it("offline, does not ask and says no, so Finish goes ahead", async () => {
    const read = vi.fn(async () => "Completed");
    await expect(finishedElsewhere(read, false)).resolves.toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("with no answer in time, or a failed read, says no", async () => {
    const slow = finishedElsewhere(() => never<string>(), true, 2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(slow).resolves.toBe(false);
    await expect(finishedElsewhere(async () => { throw new Error("unavailable"); }, true)).resolves.toBe(false);
  });

  it("says no when the question cannot even be asked", async () => {
    const throwsAtOnce = () => {
      throw new TypeError("no database");
    };
    await expect(finishedElsewhere(throwsAtOnce, true)).resolves.toBe(false);
  });
});
