// @vitest-environment jsdom
/**
 * The boundary clock, mounted: it renders nothing between boundaries, moves at
 * one, at the studio's midnight, and at once when new data puts a boundary
 * behind it; useSettledNow keeps the time it handed out until a boundary.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useBoundaryClock, useSettledNow, type BoundaryClock } from "./boundary-clock";
import { setActiveTimeZone } from "./studio-time";

const NOON = Date.parse("2026-09-27T16:00:00Z"); // noon Eastern
let renders = 0;
let latest: BoundaryClock | null = null;

function Probe({ boundaries, extra }: { boundaries: readonly number[]; extra?: readonly number[] }) {
  renders += 1;
  latest = useBoundaryClock(boundaries);
  if (extra) latest.watch("extra", extra);
  return null;
}

let settled: Date | null = null;
function Settled({ now, boundaries }: { now: Date; boundaries: readonly number[] }) {
  settled = useSettledNow(now, boundaries);
  return null;
}

let root: Root;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  setActiveTimeZone("America/New_York");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(NOON);
  renders = 0;
  latest = null;
  settled = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const minutes = async (n: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(n * 60_000);
  });
};

describe("useBoundaryClock", () => {
  it("renders nothing for hours without a boundary, then moves at the studio's midnight", async () => {
    const none: number[] = [];
    await act(async () => root.render(<Probe boundaries={none} />));
    const first = renders;
    await minutes(11 * 60 + 58); // to 11:58 PM Eastern
    expect(renders).toBe(first);
    expect(latest!.now.getTime()).toBe(NOON);
    await minutes(3); // past midnight Eastern
    expect(renders).toBe(first + 1);
    expect(latest!.now.getTime()).toBe(Date.parse("2026-09-28T04:00:00Z"));
  });

  it("moves within the minute of a boundary", async () => {
    const at = [NOON + 30 * 60_000];
    await act(async () => root.render(<Probe boundaries={at} />));
    await minutes(29);
    expect(latest!.now.getTime()).toBe(NOON);
    await minutes(1);
    expect(latest!.now.getTime()).toBe(NOON + 30 * 60_000);
  });

  it("moves at once when new data puts a boundary behind the time it holds", async () => {
    const none: number[] = [];
    await act(async () => root.render(<Probe boundaries={none} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000); // between two checks
    });
    expect(latest!.now.getTime()).toBe(NOON);
    // A booking that arrives already ended twenty seconds ago.
    await act(async () => root.render(<Probe boundaries={none} extra={[NOON + 20_000]} />));
    expect(latest!.now.getTime()).toBe(NOON + 40_000);
  });
});

describe("useSettledNow", () => {
  it("keeps the time it handed out until the given time crosses a boundary", async () => {
    const b = [NOON + 10 * 60_000];
    await act(async () => root.render(<Settled now={new Date(NOON)} boundaries={b} />));
    const first = settled;
    await act(async () => root.render(<Settled now={new Date(NOON + 5 * 60_000)} boundaries={b} />));
    expect(settled).toBe(first);
    await act(async () => root.render(<Settled now={new Date(NOON + 10 * 60_000)} boundaries={b} />));
    expect(settled!.getTime()).toBe(NOON + 10 * 60_000);
    // New boundaries (new data): the time given is taken.
    await act(async () => root.render(<Settled now={new Date(NOON + 11 * 60_000)} boundaries={[NOON + 60 * 60_000]} />));
    expect(settled!.getTime()).toBe(NOON + 11 * 60_000);
  });
});
