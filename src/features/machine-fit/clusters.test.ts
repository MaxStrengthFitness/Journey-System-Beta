import { describe, expect, it } from "vitest";
import { buildCohort } from "./cohort";
import {
  countField,
  medianOfPoints,
  modeOf,
  numericOf,
  suggestCluster,
  universalPicks,
  weightedMedian,
} from "./clusters";
import { ROW_FIELDS, body, client, compoundRowStudio } from "./fixtures";
import { DEFAULT_MATCH_SPEC } from "./match-spec";

const studio = compoundRowStudio();
const bandFor = (heightIn: number) => buildCohort(studio, body(heightIn), DEFAULT_MATCH_SPEC).samples;
const pickOf = (picks: { key: string; value: string }[], key: string) => picks.find((p) => p.key === key)?.value;

describe("numericOf / medians", () => {
  it("reads normalised numbers, including the underscore decimal", () => {
    expect(numericOf("6")).toBe(6);
    expect(numericOf("3_75")).toBe(3.75);
    expect(numericOf("b")).toBeNull();
    expect(numericOf("p3")).toBeNull();
  });

  it("takes the ordinary median, weighting each point by its clients", () => {
    expect(medianOfPoints([{ x: 4, n: 1 }, { x: 5, n: 1 }])).toBe(4.5);
    expect(medianOfPoints([{ x: 3, n: 1 }, { x: 4, n: 5 }, { x: 9, n: 1 }])).toBe(4);
    expect(medianOfPoints([])).toBeNull();
    expect(weightedMedian(bandFor(67), "seat")).toBe(4);
  });
});

describe("modeOf", () => {
  it("settles a tie by the wider group, then by the middle, then by order", () => {
    const tied = [client(66, { seat: "3" }), client(66, { seat: "5" })];
    const wide = countField([...tied, client(70, { seat: "5" })], "seat");
    expect(modeOf(countField(tied, "seat"), tied, "seat", wide)?.value).toBe("5");
    // No wider group: both are equally far from the middle (4), so plain order decides.
    expect(modeOf(countField(tied, "seat"), tied, "seat")?.value).toBe("3");
  });
});

describe("setting clusters", () => {
  it("builds the set-up as a chain: each value is the most common GIVEN the ones before it", () => {
    const result = suggestCluster({ fieldKeys: ROW_FIELDS, cohort: bandFor(67), everyone: studio });
    expect(result.picks.map((p) => `${p.key}=${p.value}`)).toEqual(["gap=0", "seat=4", "chest=3", "handles=in"]);

    const seat = result.picks.find((p) => p.key === "seat")!;
    expect(seat).toMatchObject({ support: 5, outOf: 6, strength: "strong", given: { gap: "0" } });

    const chest = result.picks.find((p) => p.key === "chest")!;
    // Read among the Seat-4 clients only — that is the cluster.
    expect(chest).toMatchObject({ support: 5, outOf: 5, given: { gap: "0", seat: "4" } });

    // Handles follow nothing: split two and two among those clients. Offered, but only "fair".
    const handles = result.picks.find((p) => p.key === "handles")!;
    expect(handles).toMatchObject({ support: 2, outOf: 4, strength: "fair" });

    expect(result.seenTogether).toBe(2);
    expect(result.pinnedScope).toBe("none");
  });

  it("never offers a pair nobody uses: a per-field mode would, the chain does not", () => {
    // Half sit high with the pad in, half low with the pad out, and one
    // straddler makes Seat 6 and Chest 5 the two single most common values.
    const split = [
      client(66, { seat: "6", chest: "2" }),
      client(66, { seat: "6", chest: "2" }),
      client(66, { seat: "6", chest: "2" }),
      client(66, { seat: "6", chest: "3" }),
      client(66, { seat: "2", chest: "5" }),
      client(66, { seat: "2", chest: "5" }),
      client(66, { seat: "3", chest: "5" }),
      client(66, { seat: "3", chest: "5" }),
    ];
    // Field by field: Seat 6 (4 clients) and Chest 5 (4 clients). Nobody sits at Seat 6 with Chest 5.
    expect(modeOf(countField(split, "seat"), split, "seat")?.value).toBe("6");
    expect(modeOf(countField(split, "chest"), split, "chest")?.value).toBe("5");
    expect(split.some((s) => s.settings.seat === "6" && s.settings.chest === "5")).toBe(false);

    const result = suggestCluster({ fieldKeys: ["seat", "chest"], cohort: split, everyone: split });
    const offered = Object.fromEntries(result.picks.map((p) => [p.key, p.value]));
    expect(split.some((s) => s.settings.seat === offered.seat && s.settings.chest === offered.chest)).toBe(true);
    expect(result.seenTogether).toBeGreaterThanOrEqual(2);
  });

  it("re-suggests from a value the trainer set by hand — across every height when her band has too few", () => {
    // A 5'7" client the trainer has sat at Seat 3: only one 5'6"–5'8" client
    // sits there, so the link is read from everyone at Seat 3.
    const result = suggestCluster({
      fieldKeys: ROW_FIELDS,
      cohort: bandFor(67),
      everyone: studio,
      pinned: { seat: "3" },
    });
    expect(result.pinnedScope).toBe("all");
    expect(pickOf(result.picks, "seat")).toBeUndefined(); // never suggests over a pinned value
    expect(pickOf(result.picks, "chest")).toBe("4"); // not the band's own favourite, Chest 3
    expect(result.picks.find((p) => p.key === "chest")!.given).toEqual({ seat: "3" });
  });

  it("conditions inside the band when enough similar clients share the pinned value", () => {
    const result = suggestCluster({
      fieldKeys: ROW_FIELDS,
      cohort: bandFor(67),
      everyone: studio,
      pinned: { seat: "4" },
    });
    expect(result.pinnedScope).toBe("band");
    expect(pickOf(result.picks, "chest")).toBe("3");
  });

  it("ignores a pinned key the machine does not have, and skips what it is told to skip", () => {
    const result = suggestCluster({
      fieldKeys: ROW_FIELDS,
      cohort: bandFor(67),
      everyone: studio,
      pinned: { "foot-plate": "2" },
      skip: ["handles", "gap"],
    });
    expect(result.pinned).toEqual({});
    expect(result.picks.map((p) => p.key)).toEqual(["seat", "chest"]);
    expect(result.seenTogether).toBe(5);
  });

  it("uses whatever each client has filled in — a missing field does not disqualify her", () => {
    const patchy = [
      client(66, { seat: "4" }),
      client(66, { seat: "4", chest: "3" }),
      client(66, { seat: "4", chest: "3" }),
      client(66, { chest: "3" }),
      client(66, { seat: "5" }),
    ];
    const result = suggestCluster({ fieldKeys: ["seat", "chest"], cohort: patchy, everyone: patchy });
    expect(pickOf(result.picks, "seat")).toBe("4");
    expect(pickOf(result.picks, "chest")).toBe("3");
  });

  it("says nothing about a field only one client has an opinion on", () => {
    const lonely = [client(66, { seat: "4", pillow: "yes" }), client(66, { seat: "4" }), client(66, { seat: "4" })];
    const result = suggestCluster({ fieldKeys: ["seat", "pillow"], cohort: lonely, everyone: lonely });
    expect(result.picks.map((p) => p.key)).toEqual(["seat"]);
  });

  it("returns the picks in the machine's own field order, however they were reasoned", () => {
    const result = suggestCluster({ fieldKeys: ["handles", "chest", "seat", "gap"], cohort: bandFor(67), everyone: studio });
    expect(result.picks.map((p) => p.key)).toEqual(["handles", "chest", "seat", "gap"]);
  });
});

describe("universal values", () => {
  it("finds the value nearly everyone uses whatever their build, and nothing else", () => {
    const picks = universalPicks(ROW_FIELDS, studio);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ key: "gap", value: "0", support: 23, outOf: 24, universal: true, strength: "strong" });
  });

  it("needs a real number of clients before calling anything universal", () => {
    expect(universalPicks(ROW_FIELDS, studio.slice(0, 6))).toEqual([]);
  });
});
