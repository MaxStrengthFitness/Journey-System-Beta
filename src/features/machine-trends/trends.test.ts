import { describe, expect, it } from "vitest";
import {
  MIN_CLIENTS,
  buildMachineTrends,
  distributionOf,
  normalizeSettingKey,
  normalizeSettingValue,
  normalizeSnapshot,
  parseHeightInches,
  type TrendClientInput,
  type TrendLogInput,
} from "./trends";

describe("parseHeightInches", () => {
  it("reads the app's own format and its variants", () => {
    expect(parseHeightInches("5'10\"")).toBe(70);
    expect(parseHeightInches("5' 10\"")).toBe(70);
    expect(parseHeightInches("5'10")).toBe(70);
    expect(parseHeightInches("6'")).toBe(72);
    expect(parseHeightInches("5 ft 4")).toBe(64);
    expect(parseHeightInches("5'10.5\"")).toBe(71);
  });

  it("accepts bare inches like the edit form's fallback, and nothing silly", () => {
    expect(parseHeightInches("70")).toBe(70);
    expect(parseHeightInches("70 in")).toBe(70);
    expect(parseHeightInches("")).toBeNull();
    expect(parseHeightInches("   ")).toBeNull();
    expect(parseHeightInches("tall")).toBeNull();
    expect(parseHeightInches("180cm")).toBeNull();
    expect(parseHeightInches("5'13\"")).toBeNull();
    expect(parseHeightInches("12")).toBeNull();
    expect(parseHeightInches(null)).toBeNull();
    expect(parseHeightInches(undefined)).toBeNull();
  });
});

describe("setting normalisation", () => {
  it("folds labels and slugs onto one key", () => {
    expect(normalizeSettingKey("Chest Pad")).toBe("chest-pad");
    expect(normalizeSettingKey("chest-pad")).toBe("chest-pad");
    expect(normalizeSettingKey("  Seat  ")).toBe("seat");
    expect(normalizeSettingKey("Back Pad / Angle")).toBe("back-pad-angle");
  });

  it("keeps the position and drops the noise", () => {
    expect(normalizeSettingValue("6")).toBe("6");
    expect(normalizeSettingValue(" 6 ")).toBe("6");
    expect(normalizeSettingValue(6)).toBe("6");
    expect(normalizeSettingValue("Seat 6", "Seat")).toBe("6");
    expect(normalizeSettingValue("B")).toBe("b");
    expect(normalizeSettingValue("6.5")).toBe("6_5");
    // One number, one value, however it was typed.
    expect(normalizeSettingValue("2.")).toBe("2");
    expect(normalizeSettingValue("2.0")).toBe("2");
    expect(normalizeSettingValue("02")).toBe("2");
    expect(normalizeSettingValue("3.50")).toBe("3_5");
    expect(normalizeSettingValue(".5")).toBe("0_5");
    expect(normalizeSettingValue("0")).toBe("0");
    expect(normalizeSettingValue("3-5")).toBe("3-5");
    expect(normalizeSettingValue("p2")).toBe("p2");
    expect(normalizeSettingValue("")).toBeNull();
    expect(normalizeSettingValue("-")).toBeNull();
    expect(normalizeSettingValue("n/a")).toBeNull();
    expect(normalizeSettingValue(null)).toBeNull();
    expect(normalizeSettingValue("a".repeat(60))).toBeNull();
  });

  it("normalises a whole snapshot and returns null for an empty one", () => {
    expect(normalizeSnapshot({ "Chest Pad": "6", Seat: " 3 ", Notes: "" })).toEqual({ "chest-pad": "6", seat: "3" });
    expect(normalizeSnapshot({ Notes: "" })).toBeNull();
    expect(normalizeSnapshot(null)).toBeNull();
    expect(normalizeSnapshot(undefined)).toBeNull();
  });
});

describe("distributionOf", () => {
  it("is null below the named minimum sample", () => {
    expect(distributionOf([100, 110, 120, 130])).toBeNull();
    expect(MIN_CLIENTS).toBe(5);
  });

  it("reports the five-number summary and the mean", () => {
    expect(distributionOf([120, 100, 140, 110, 130])).toEqual({
      min: 100,
      p25: 110,
      median: 120,
      p75: 130,
      max: 140,
      avg: 120,
    });
  });
});

function performed(over: Partial<TrendLogInput>): TrendLogInput {
  return { outcome: "performed", reps: "8", sessionId: "s1", machineId: "compound-row", ...over };
}

function clientsOf(rows: TrendClientInput[]): Map<string, TrendClientInput> {
  return new Map(rows.map((c) => [c.id, c]));
}

describe("buildMachineTrends", () => {
  const clients = clientsOf([
    { id: "a", height: "5'7\"", homeStudioId: "westlake" },
    { id: "b", height: "5'7\"", homeStudioId: "westlake" },
    { id: "c", height: "6'1\"", homeStudioId: "solon" },
    { id: "d", height: "", homeStudioId: "solon" },
    { id: "e", height: "5'7\"", homeStudioId: "solon" },
    { id: "f", height: "5'2\"", homeStudioId: "" },
  ]);

  it("counts distinct clients, sets and sessions and keeps each client's best", () => {
    const logs: TrendLogInput[] = [
      performed({ clientId: "a", weight: "100", sessionId: "s1" }),
      performed({ clientId: "a", weight: "120", sessionId: "s2" }),
      performed({ clientId: "b", weight: "90", sessionId: "s3" }),
    ];
    const { machines, droppedSets } = buildMachineTrends(logs, clients);
    const m = machines["compound-row"];
    expect(m.clients).toBe(2);
    expect(m.sets).toBe(3);
    expect(m.sessions).toBe(3);
    expect(m.load).toBeNull(); // 2 clients < MIN_CLIENTS
    expect(m.studios.westlake).toEqual({ clients: 2, sets: 3, medianBest: null });
    expect(droppedSets).toBe(0);
  });

  it("only counts performed sets with a client, a machine and a load", () => {
    const logs: TrendLogInput[] = [
      performed({ clientId: "a", weight: "100" }),
      { ...performed({ clientId: "a", weight: "200" }), outcome: "skipped", reps: "" },
      { clientId: "a", machineId: "compound-row", weight: "150", sessionId: "s9" }, // legacy: no outcome, no count → skipped
      performed({ clientId: "a", weight: "0" }),
      performed({ clientId: "a", weight: "" }),
      performed({ clientId: null, weight: "100" }),
      performed({ clientId: "a", machineId: null, weight: "100" }),
    ];
    const { machines, droppedSets } = buildMachineTrends(logs, clients);
    expect(machines["compound-row"].sets).toBe(1);
    expect(machines["compound-row"].clients).toBe(1);
    expect(droppedSets).toBe(4); // 0-load, empty load, no client, no machine
  });

  it("answers 'which setting do clients at this height use' from the latest snapshot per client", () => {
    const logs: TrendLogInput[] = [
      performed({ clientId: "a", weight: "100", machineSettings: { "Chest Pad": "5" } }),
      performed({ clientId: "a", weight: "110", machineSettings: { "Chest Pad": "6" } }), // a moved to 6 — the latest counts
      performed({ clientId: "b", weight: "90", machineSettings: { "chest-pad": "6" } }),
      performed({ clientId: "c", weight: "150", machineSettings: { "Chest Pad": "Chest Pad 8" } }),
      performed({ clientId: "d", weight: "80", machineSettings: { "Chest Pad": "6" } }), // no height → not in byHeight
      performed({ clientId: "e", weight: "95" }), // no snapshot → not in settings at all
    ];
    const { machines } = buildMachineTrends(logs, clients);
    const chestPad = machines["compound-row"].settings["chest-pad"];
    expect(Object.keys(chestPad).sort()).toEqual(["6", "8"]);
    expect(chestPad["6"].clients).toBe(3); // a, b, d
    expect(chestPad["6"].sets).toBe(3); // a's second set, b's, d's
    expect(chestPad["6"].byHeight).toEqual({ "67": 2 });
    expect(chestPad["6"].medianBest).toBeNull();
    expect(chestPad["8"]).toEqual({ clients: 1, sets: 1, medianBest: null, byHeight: { "73": 1 } });
    expect(machines["compound-row"].byHeight["67"]).toEqual({ clients: 3, sets: 4, medianBest: null });
    expect(machines["compound-row"].studios.solon.clients).toBe(3);
  });

  it("writes medians once the named minimum is met", () => {
    const logs: TrendLogInput[] = ["a", "b", "c", "d", "e"].map((id, i) =>
      performed({ clientId: id, weight: String(100 + i * 10), machineSettings: { Seat: "3" } }),
    );
    const { machines } = buildMachineTrends(logs, clients);
    const m = machines["compound-row"];
    expect(m.load).toEqual({ min: 100, p25: 110, median: 120, p75: 130, max: 140, avg: 120 });
    expect(m.settings.seat["3"].medianBest).toBe(120);
    expect(m.studios.westlake.medianBest).toBeNull(); // only 2 of them are westlake
  });

  it("puts a client with no home studio under 'unknown' and never invents a height", () => {
    const logs: TrendLogInput[] = [performed({ clientId: "f", weight: "60" }), performed({ clientId: "zz", weight: "60" })];
    const { machines } = buildMachineTrends(logs, clients);
    expect(machines["compound-row"].studios.unknown.clients).toBe(2);
    expect(machines["compound-row"].byHeight).toEqual({ "62": { clients: 1, sets: 1, medianBest: null } });
  });

  it("keeps machines apart", () => {
    const logs: TrendLogInput[] = [
      performed({ clientId: "a", weight: "100", machineId: "leg-press" }),
      performed({ clientId: "a", weight: "50", machineId: "compound-row" }),
    ];
    const { machines } = buildMachineTrends(logs, clients);
    expect(Object.keys(machines).sort()).toEqual(["compound-row", "leg-press"]);
  });
});
