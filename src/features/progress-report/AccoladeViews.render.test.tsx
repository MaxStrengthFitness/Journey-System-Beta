// @vitest-environment jsdom
/**
 * Render tests for the accolade cards and editor. The live bug these guard —
 * "MOVEMENT SLOT +0% — INCREASE FROM UNDEFINED TO UNDEFINED" on a client's
 * card — was a rendering bug, and only a mounted component shows what the
 * client actually reads. Raw react-dom/client, like
 * features/client-profile/profile-nav.render.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AccoladeCards, AccoladeSlotEditor, FocusHistoryPanel, FocusSnapshotCard } from "./AccoladeViews";
import { buildSlot, draftSlots, type HighlightSlot, type SlotContext } from "./accolades";
import type { ClientFocus } from "../../types/journal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(ui: React.ReactNode): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return { host, root };
}

async function unmount({ host, root }: { host: HTMLElement; root: Root }) {
  await act(async () => root.unmount());
  host.remove();
}

const ctx: SlotContext = {
  stats: {
    leg: { startWeight: 100, currentWeight: 140, percentageIncrease: 40, totalVolume: 9000, perfectSets: 2, sessionCount: 6 },
    thin: { startWeight: 100, currentWeight: 120, percentageIncrease: 20, sessionCount: 1 },
  },
  labels: new Map([["leg", "Leg Press"], ["thin", "Chest"]]),
  sets: [],
  sessionsInWindow: 20,
  windowStart: "2026-06-01",
  windowEnd: "2026-08-10",
};

const machines = [
  { id: "leg", name: "Leg Press" },
  { id: "thin", name: "Chest" },
];

describe("AccoladeCards", () => {
  it("draws nothing at all for an old report's blank slots", async () => {
    const blanks: HighlightSlot[] = [
      { label: "", startValue: "", currentValue: "" },
      { label: "", metricType: "strength_gain" },
      { label: "", metricType: "strength_gain" },
    ];
    const m = await mount(<AccoladeCards slots={blanks} />);
    expect(m.host.innerHTML).toBe("");
    await unmount(m);
  });

  it("draws only the real slots, titled by kind, with no undefined anywhere", async () => {
    const slots: HighlightSlot[] = [
      { label: "", metricType: "strength_gain", percentageIncrease: 0 },
      { label: "Leg Press", machineId: "leg", percentageIncrease: 25, startValue: "100 lbs", currentValue: "125 lbs" },
      buildSlot({ metricType: "consistency" }, ctx).slot,
    ];
    const m = await mount(<AccoladeCards slots={slots} />);
    const cards = m.host.querySelectorAll('[data-testid="accolade-card"]');
    expect(cards).toHaveLength(2);
    const text = m.host.textContent ?? "";
    expect(text).toContain("Strength gain");
    expect(text).toContain("+25%");
    expect(text).toContain("Consistency");
    expect(text).toContain("2.0 a week");
    expect(text).not.toMatch(/undefined|NaN|Movement Slot|\+0%/i);
    await unmount(m);
  });
});

describe("AccoladeSlotEditor", () => {
  const render = (slot: HighlightSlot, loading = false) =>
    mount(
      <AccoladeSlotEditor
        index={0}
        slot={slot}
        machines={machines}
        ctx={ctx}
        candidates={[]}
        takenKeys={new Set()}
        loading={loading}
        onChange={() => {}}
      />,
    );

  it("shows an empty slot as 'Choose an accolade'", async () => {
    const m = await render({ label: "" });
    expect(m.host.textContent).toContain("Choose an accolade");
    expect(m.host.textContent).not.toContain("Suggested from data");
    await unmount(m);
  });

  it("marks a drafted slot until it is edited", async () => {
    const [first] = draftSlots(ctx);
    expect(first.suggested).toBe(true);
    const m = await render(first);
    expect(m.host.textContent).toContain("Suggested from data");
    expect(m.host.textContent).toContain("+40%");
    await unmount(m);
  });

  it("says 'not enough data yet' for a choice below its minimum", async () => {
    const m = await render(buildSlot({ metricType: "strength_gain", machineId: "thin" }, ctx).slot);
    expect(m.host.textContent).toMatch(/not enough data yet/i);
    expect(m.host.textContent).not.toMatch(/undefined|NaN/);
    await unmount(m);
  });

  it("says it is still reading rather than 'no data' while loading", async () => {
    const m = await render({ label: "", metricType: "strength_gain", machineId: "none" }, true);
    expect(m.host.textContent).toContain("Reading the client's sessions");
    await unmount(m);
  });
});

describe("focus history", () => {
  const ts = (iso: string) => ({ toDate: () => new Date(iso) });
  const focus = {
    id: "f1",
    category: "Pace",
    status: "passed",
    intent: "Slow the lowering phase",
    trainerInitials: "AJ",
    startedAt: ts("2026-06-01T12:00:00"),
    passedAt: ts("2026-06-23T12:00:00"),
    updatedAt: ts("2026-06-23T12:00:00"),
  } as unknown as ClientFocus;

  it("the editor panel lists focuses as sentences", async () => {
    const m = await mount(<FocusHistoryPanel focuses={[focus]} status="ready" asOf={new Date("2026-09-15T12:00:00")} />);
    expect(m.host.textContent).toContain("Pace — achieved after 3 weeks · set by AJ");
    await unmount(m);
  });

  it("the editor panel says when it couldn't read, and when there is nothing", async () => {
    const err = await mount(<FocusHistoryPanel focuses={[]} status="error" asOf={new Date()} />);
    expect(err.host.textContent).toMatch(/couldn't read/i);
    await unmount(err);
    const none = await mount(<FocusHistoryPanel focuses={[]} status="ready" asOf={new Date()} />);
    expect(none.host.textContent).toMatch(/no coaching focus/i);
    await unmount(none);
  });

  it("the printed card reads the saved snapshot and nothing else", async () => {
    const m = await mount(
      <FocusSnapshotCard entries={[{ category: "Path", status: "active", weeks: 2, trainerInitials: "KM" }]} />,
    );
    expect(m.host.textContent).toContain("Path — in progress for 2 weeks · set by KM");
    await unmount(m);
    const empty = await mount(<FocusSnapshotCard entries={undefined} />);
    expect(empty.host.innerHTML).toBe("");
    await unmount(empty);
  });
});
