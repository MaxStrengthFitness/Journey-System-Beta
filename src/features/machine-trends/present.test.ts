import { describe, expect, it } from "vitest";
import {
  headlineFor,
  heightLabel,
  loadSentence,
  presentMachineTrends,
  settingLabel,
  type MachineTrendDoc,
} from "./present";
import { MIN_CLIENTS } from "./trends";

/** A settings cell. `byHeight` is part of the stored shape and this screen does not read it. */
function sv(clients: number, sets: number, medianBest: number | null) {
  return { clients, sets, medianBest, byHeight: {} };
}

function doc(over: Partial<MachineTrendDoc> = {}): MachineTrendDoc {
  return {
    machineId: "m-compound-row",
    clients: 12,
    sets: 140,
    sessions: 120,
    load: { min: 60, p25: 90, median: 120, p75: 150, max: 220, avg: 124 },
    settings: {},
    byHeight: {},
    studios: {},
    windowDays: 90,
    computedAt: "2026-09-14T07:00:00.000Z",
    ...over,
  };
}

describe("presentMachineTrends", () => {
  it("tells a failed read from an absent document", () => {
    expect(presentMachineTrends({ trend: null, failed: true }).kind).toBe("unreadable");
    expect(presentMachineTrends({ trend: null, failed: false }).kind).toBe("none");
    // Nothing at all — the hook has not answered yet.
    expect(presentMachineTrends(null).kind).toBe("unreadable");
  });

  it("treats a document with no sets as nobody having trained on it", () => {
    // The fit block keeps a document alive for a machine with set-ups but no
    // sets this window. A page of zeroes would read as a broken screen.
    const view = presentMachineTrends({ trend: doc({ clients: 0, sets: 0, sessions: 0, load: null }), failed: false });
    expect(view.kind).toBe("none");
  });

  it("says 'not enough data yet' below the minimum sample", () => {
    const view = presentMachineTrends({ trend: doc({ clients: MIN_CLIENTS - 1, load: null }), failed: false });
    expect(view.kind).toBe("thin");
    expect(headlineFor(view)).toContain("not enough");
    // and never a load, even if a future job wrote one
    const withLoad = presentMachineTrends({ trend: doc({ clients: MIN_CLIENTS - 1 }), failed: false });
    expect(withLoad.kind).toBe("thin");
  });

  it("opens up at exactly the minimum sample", () => {
    const view = presentMachineTrends({ trend: doc({ clients: MIN_CLIENTS }), failed: false });
    expect(view.kind).toBe("ready");
  });

  it("puts the busiest setting first, and the busiest value first inside it", () => {
    const view = presentMachineTrends({
      trend: doc({
        settings: {
          seat: { "4": sv(2, 9, null), "5": sv(7, 40, 130) },
          "chest-pad": {
            "2": sv(1, 3, null),
            "3": sv(9, 55, 120),
            "1": sv(9, 20, 95),
          },
        },
      }),
      failed: false,
    });
    if (view.kind !== "ready") throw new Error("expected ready");
    expect(view.settings.map((s) => s.key)).toEqual(["chest-pad", "seat"]);
    expect(view.settings[0].label).toBe("Chest pad");
    expect(view.settings[0].clients).toBe(19);
    // 9 and 9 tie, so the value decides — stable order, not whichever key came back first.
    expect(view.settings[0].rows.map((r) => r.value)).toEqual(["1", "3", "2"]);
    expect(view.settings[1].rows[0]).toEqual({ value: "5", clients: 7, sets: 40, medianBest: 130 });
  });

  it("keeps a withheld median as null rather than turning it into a zero", () => {
    const view = presentMachineTrends({
      trend: doc({ settings: { gap: { "3": sv(2, 4, null) } } }),
      failed: false,
    });
    if (view.kind !== "ready") throw new Error("expected ready");
    expect(view.settings[0].rows[0].medianBest).toBeNull();
  });

  it("sorts heights shortest first and drops the ones nobody is at", () => {
    const view = presentMachineTrends({
      trend: doc({
        byHeight: {
          "72": { clients: 3, sets: 20, medianBest: null },
          "64": { clients: 6, sets: 44, medianBest: 90 },
          "68": { clients: 0, sets: 0, medianBest: null },
        },
      }),
      failed: false,
    });
    if (view.kind !== "ready") throw new Error("expected ready");
    expect(view.heights.map((h) => h.label)).toEqual(["5'4\"", "6'0\""]);
    expect(view.heights[0].medianBest).toBe(90);
  });

  it("falls back to a 90-day window when the document predates the stamp", () => {
    const view = presentMachineTrends({ trend: doc({ windowDays: undefined }), failed: false });
    if (view.kind !== "ready") throw new Error("expected ready");
    expect(view.windowDays).toBe(90);
    expect(view.asOf).toBe("2026-09-14T07:00:00.000Z");
  });
});

describe("the sentences", () => {
  it("names the window in the headline, because a count alone means nothing", () => {
    const view = presentMachineTrends({ trend: doc(), failed: false });
    expect(headlineFor(view)).toBe("12 clients, 140 sets, 120 sessions in the last 90 days.");
  });

  it("says nothing about load when the job withheld the distribution", () => {
    expect(loadSentence(null)).toBeNull();
  });

  it("quotes quartiles, rounded, because the stack is in whole pounds", () => {
    expect(loadSentence({ min: 60.4, p25: 90, median: 119.6, p75: 150, max: 220, avg: 124 })).toBe(
      "Best loads run from 60 to 220 lb. Half of these clients are between 90 and 150, and the middle one is at 120.",
    );
  });

  it("is explicit that an unreadable machine is unknown, not empty", () => {
    expect(headlineFor({ kind: "unreadable" })).toContain("could not be loaded");
    expect(headlineFor({ kind: "none" })).toContain("Nobody has trained");
  });
});

describe("labels", () => {
  it("makes a storage key readable without shouting", () => {
    expect(settingLabel("chest-pad")).toBe("Chest pad");
    expect(settingLabel("seat")).toBe("Seat");
    expect(settingLabel("back_pad")).toBe("Back pad");
    expect(settingLabel("")).toBe("");
  });

  it("prints inches as a person says them", () => {
    expect(heightLabel(68)).toBe("5'8\"");
    expect(heightLabel(72)).toBe("6'0\"");
    // Not a human height: shown as-is rather than as 0'3"
    expect(heightLabel(3)).toBe("3");
  });
});
