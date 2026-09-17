import { describe, expect, it } from "vitest";
import { auditMachine, comboAckKey, comboAckValue, countToReview, observedNotch, weightedSpread } from "./audit";
import { buildCohort } from "./cohort";
import { ROW_FIELDS, body, client, compoundRowStudio } from "./fixtures";
import { DEFAULT_MATCH_SPEC } from "./match-spec";
import type { FitAck, FitSample } from "./types";

const studio = compoundRowStudio();

function audit(
  settings: Record<string, string>,
  opts: { heightIn?: number | null; acks?: Record<string, FitAck>; samples?: FitSample[]; fieldKeys?: string[] } = {},
) {
  const samples = opts.samples ?? studio;
  const cohort = buildCohort(samples, body(opts.heightIn === undefined ? 67 : opts.heightIn), DEFAULT_MATCH_SPEC, {
    excludeClientId: "her",
  });
  return auditMachine({
    fieldKeys: opts.fieldKeys ?? [...ROW_FIELDS],
    settings,
    cohort,
    tier: "studio",
    minClients: DEFAULT_MATCH_SPEC.minClients,
    acks: opts.acks,
  });
}

const ack = (value: string): FitAck => ({ value, by: "uid-1", byName: "Alex S", at: "2026-09-17T14:00:00.000Z" });

describe("helpers", () => {
  it("reads one notch off the values in use", () => {
    expect(observedNotch(["3", "4", "6"])).toBe(1);
    expect(observedNotch(["3", "3_5", "5"])).toBe(0.5);
    expect(observedNotch(["4"])).toBe(1);
    expect(observedNotch(["in", "out"])).toBe(1);
  });

  it("measures spread as a sigma from the median distance", () => {
    const flat = [client(66, { seat: "4" }), client(66, { seat: "4" }), client(66, { seat: "4" })];
    expect(weightedSpread(flat, "seat", 4)).toBe(0);
    const wide = ["2", "3", "4", "5", "6"].map((v) => client(66, { seat: v }));
    expect(weightedSpread(wide, "seat", 4)).toBeCloseTo(1.4826, 4);
  });
});

describe("the passive audit", () => {
  it("says nothing about an ordinary set-up", () => {
    const result = audit({ gap: "0", seat: "4", chest: "3", handles: "in" });
    expect(result.state).toBe("checked");
    expect(result.flags).toEqual([]);
  });

  it("marks a numbered setting nobody similar is near as worth a look, with the evidence", () => {
    const result = audit({ gap: "0", seat: "9", chest: "3" });
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]).toMatchObject({
      kind: "value",
      key: "seat",
      value: "9",
      level: "rare",
      clients: 0,
      outOf: 6,
      median: 4,
    });
    const flag = result.flags[0];
    expect(flag.kind === "value" && flag.distribution[0]).toEqual({ value: "4", clients: 5 });
    expect(countToReview([result])).toBe(1);
  });

  it("uses distance, not just rarity: one notch off is nothing, two is a faint dot", () => {
    expect(audit({ seat: "5" }).flags).toEqual([]);
    const two = audit({ seat: "6" });
    expect(two.flags).toHaveLength(1);
    expect(two.flags[0].level).toBe("uncommon");
    // The faint dot is never counted anywhere.
    expect(countToReview([two])).toBe(0);
  });

  it("does not let a tight group make the next notch look extreme", () => {
    const allFours = Array.from({ length: 8 }, () => client(67, { seat: "4" }));
    expect(audit({ seat: "5" }, { samples: allFours }).flags).toEqual([]);
  });

  it("scales distance by how spread out the group is", () => {
    // Five notches from the middle is "worth a look" when everyone sits at 4…
    expect(audit({ seat: "9" }).flags[0].level).toBe("rare");
    // …and at most a faint dot in a studio that genuinely uses the whole rail.
    const spread = ["2", "3", "3", "4", "5", "6", "7", "8"].map((v) => client(67, { seat: v }));
    expect(audit({ seat: "9" }, { samples: spread }).flags.every((f) => f.level !== "rare")).toBe(true);
    expect(audit({ seat: "1" }, { samples: spread }).flags).toEqual([]);
  });

  it("never lets her own odd value vouch for itself", () => {
    const me = client(67, { seat: "9" }, { clientId: "her" });
    const result = audit({ seat: "9" }, { samples: [...studio, me] });
    expect(result.flags[0]).toMatchObject({ level: "rare", clients: 0 });
  });

  it("judges a lettered setting by share, and only calls it rare in a group big enough to mean it", () => {
    // Six similar clients, five with handles set: "nobody" is a faint dot.
    const small = audit({ handles: "wide" });
    expect(small.flags[0]).toMatchObject({ key: "handles", level: "uncommon", clients: 0, outOf: 5 });

    const big = Array.from({ length: 12 }, (_, i) => client(67, { handles: i % 2 ? "in" : "out" }));
    expect(audit({ handles: "wide" }, { samples: big }).flags[0].level).toBe("rare");
    expect(audit({ handles: "in" }, { samples: big }).flags).toEqual([]);
  });

  it("flags two ordinary values that no similar client uses together", () => {
    const halves = [
      ...Array.from({ length: 6 }, () => client(67, { seat: "4", chest: "3" })),
      ...Array.from({ length: 6 }, () => client(67, { seat: "3", chest: "4" })),
    ];
    const result = audit({ seat: "4", chest: "4" }, { samples: halves, fieldKeys: ["seat", "chest"] });
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]).toMatchObject({
      kind: "combo",
      keys: ["seat", "chest"],
      values: ["4", "4"],
      level: "uncommon",
      each: [6, 6],
      outOf: 12,
    });
  });

  it("does not cry 'combination' when chance alone would hardly have produced the pair", () => {
    // Seat 4 is common, Chest 4 is one client in six: they'd be expected together under once.
    const result = audit({ seat: "4", chest: "4" });
    expect(result.flags.filter((f) => f.kind === "combo")).toEqual([]);
  });

  it("stays quiet once a trainer has said the value is right — until the value changes", () => {
    const reviewed = audit({ seat: "9" }, { acks: { seat: ack("9") } });
    expect(reviewed.flags).toEqual([]);
    expect(reviewed.acknowledged).toHaveLength(1);

    const moved = audit({ seat: "8" }, { acks: { seat: ack("9") } });
    expect(moved.flags).toHaveLength(1);
    expect(moved.acknowledged).toEqual([]);
  });

  it("keys a reviewed pair the same way whichever order the fields come in", () => {
    expect(comboAckKey("seat", "chest")).toBe(comboAckKey("chest", "seat"));
    expect(comboAckValue(["seat", "chest"], ["4", "3"])).toBe(comboAckValue(["chest", "seat"], ["3", "4"]));
  });

  it("checks nothing below the minimum sample, and says why", () => {
    const tall = audit({ seat: "9" }, { heightIn: 78 });
    expect(tall.state).toBe("not-enough");
    expect(tall.flags).toEqual([]);

    const noHeight = audit({ seat: "9" }, { heightIn: null });
    expect(noHeight.state).toBe("no-height");
    expect(noHeight.flags).toEqual([]);
  });

  it("leaves a field unchecked when too few similar clients have it set at all", () => {
    const result = audit({ seat: "4", pillow: "yes" }, { fieldKeys: ["seat", "pillow"] });
    expect(result.unchecked).toEqual(["pillow"]);
    expect(result.flags).toEqual([]);
  });
});
