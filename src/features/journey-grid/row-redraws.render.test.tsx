// @vitest-environment jsdom
/**
 * A keystroke in today's column redraws that row and not the others (speed
 * round, Oct 5 2026; R10). Every row of the grid is memoised, and the live
 * column used to reach each row as one object that was new on every
 * keystroke (its `values` changed), so every row redrew for one number.
 * The rows now take the live column without its values (useRowLive) and
 * their own value as `liveValue`.
 *
 * Every row says its journey summary on each draw, so counting the calls to
 * `journeySummary` counts the rows drawn.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { JourneyRow, JourneySession, LiveColumn, LiveSet } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const drawn = vi.hoisted(() => ({ rows: [] as string[] }));
vi.mock("./stats", async (importOriginal) => {
  const real = await importOriginal<typeof import("./stats")>();
  return {
    ...real,
    journeySummary: (...args: Parameters<typeof real.journeySummary>) => {
      drawn.rows.push(args[0].machine.id);
      return real.journeySummary(...args);
    },
  };
});

import { JourneyGrid } from "./JourneyGrid";

class QuietObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= QuietObserver;

const SESSIONS: JourneySession[] = [1, 2, 3].map((n) => ({
  id: `s${n}`,
  sessionNumber: n,
  date: `2026-09-0${n}`,
  trainerInitials: "AJ",
}));
const MACHINE_IDS = ["m1", "m2", "m3", "m4", "m5"];
const ROWS: JourneyRow[] = MACHINE_IDS.map((id, i) => ({
  machine: { id, name: `Machine ${i + 1}`, group: "Push" as const },
  sets: Object.fromEntries(
    SESSIONS.map((s) => [s.id, { sessionId: s.id, outcome: "performed" as const, weight: 100 + i, reps: 10, quality: 2 as const }]),
  ),
}));
const SECTIONS = [{ id: "today", label: "Today", rows: ROWS, numbered: true }];
const TODAY: JourneySession = { id: "today", sessionNumber: 4, date: "2026-09-04", trainerInitials: "AJ" };

const blank = (weight: number): LiveSet => ({ weight, reps: null, seconds: null, isTSC: false, quality: null });
const onChange = () => {};
const onFocusMachine = () => {};

/** A live column as the tracker hands it: a new object, same callbacks, with these values. */
const liveWith = (values: Record<string, LiveSet>): LiveColumn => ({
  session: TODAY,
  routineMachineIds: MACHINE_IDS,
  values,
  onChange,
  focusMachineId: "m2",
  onFocusMachine,
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("the grid's rows on a keystroke (R10)", () => {
  it("redraws only the row whose value changed", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const values = Object.fromEntries(MACHINE_IDS.map((id, i) => [id, blank(100 + i)]));
    const draw = (v: Record<string, LiveSet>) =>
      root!.render(<JourneyGrid sessions={SESSIONS} sections={SECTIONS} live={liveWith(v)} />);

    await act(async () => draw(values));
    // Every row drew on the way in.
    for (const id of MACHINE_IDS) expect(drawn.rows).toContain(id);

    drawn.rows = [];
    // One keystroke: reps on the second machine.
    await act(async () => draw({ ...values, m2: { ...values.m2, reps: 1 } }));
    expect(drawn.rows).toEqual(["m2"]);

    drawn.rows = [];
    // The next keystroke on the same machine, same story.
    await act(async () => draw({ ...values, m2: { ...values.m2, reps: 11 } }));
    expect(drawn.rows).toEqual(["m2"]);
  });
});
