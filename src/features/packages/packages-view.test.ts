import { describe, expect, it } from "vitest";
import { DEFAULT_PACKAGES } from "../renewals/settings";
import { lineup, MAX_WEEKS_AWAY } from "./package-table";
import { initialView, packagesViewReducer as r, type PackagesView } from "./packages-view";

const l = lineup({ packages: DEFAULT_PACKAGES });

describe("where the sheet opens", () => {
  it("on the 12-month package, recommended, a session at a time, every 4 weeks", () => {
    expect(initialView(l)).toEqual({
      selectedKey: "committed",
      recommendedKey: "committed",
      showAs: "session",
      pay: "monthly",
      weeksAway: 0,
      pickedDays: [],
      showOnce: false,
      showOther: false,
      notes: false,
    });
  });

  it("on the shortest length, unrecommended, when there is no 12 and no middle", () => {
    const two = lineup({ packages: [DEFAULT_PACKAGES[0], DEFAULT_PACKAGES[2]] });
    expect(initialView(two)).toMatchObject({ selectedKey: "trial", recommendedKey: null });
  });

  it("on nothing, for an empty lineup", () => {
    expect(initialView({ headline: [], once: [], other: [], headlineIsTwiceAWeek: false }).selectedKey).toBeNull();
  });
});

describe("taps", () => {
  const start = initialView(l);

  it("selecting a length never moves the recommendation", () => {
    const s = r(start, { type: "select", key: "trial" });
    expect(s.selectedKey).toBe("trial");
    expect(s.recommendedKey).toBe("committed");
  });

  it("the recommendation moves or clears, and the selection stays", () => {
    const moved = r(start, { type: "recommend", key: "transformed" });
    expect(moved).toMatchObject({ recommendedKey: "transformed", selectedKey: "committed" });
    expect(r(moved, { type: "recommend", key: null }).recommendedKey).toBeNull();
  });

  it("the recommendation survives changing how the price is shown and how they pay", () => {
    let s = r(start, { type: "showAs", value: "week" });
    s = r(s, { type: "pay", value: "full" });
    expect(s.recommendedKey).toBe("committed");
  });

  it("the stepper moves one week a tap, and stops at 0 and 16", () => {
    let s: PackagesView = start;
    s = r(s, { type: "away", delta: -1 });
    expect(s.weeksAway).toBe(0);
    for (let i = 0; i < 20; i++) s = r(s, { type: "away", delta: 1 });
    expect(s.weeksAway).toBe(MAX_WEEKS_AWAY);
    expect(r(s, { type: "away", delta: -1 }).weeksAway).toBe(MAX_WEEKS_AWAY - 1);
  });

  it("is a pure step, so StrictMode's double run moves the stepper once", () => {
    const once = r(start, { type: "away", delta: 1 });
    const again = r(start, { type: "away", delta: 1 });
    expect(once).toEqual(again);
    expect(start.weeksAway).toBe(0);
  });

  it("picks two days; a third replaces the oldest; a second tap unpicks", () => {
    let s = r(start, { type: "day", day: 2 });
    s = r(s, { type: "day", day: 5 });
    expect(s.pickedDays).toEqual([2, 5]);
    s = r(s, { type: "day", day: 1 });
    expect(s.pickedDays).toEqual([5, 1]);
    s = r(s, { type: "day", day: 5 });
    expect(s.pickedDays).toEqual([1]);
    expect(r(s, { type: "day", day: 9 })).toBe(s);
  });

  it("switches between the client's view and the trainer notes", () => {
    expect(r(start, { type: "notes", value: true }).notes).toBe(true);
    expect(r(r(start, { type: "notes", value: true }), { type: "notes", value: false }).notes).toBe(false);
  });
});
