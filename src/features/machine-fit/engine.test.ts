import { describe, expect, it } from "vitest";
import { auditForMachine, companySpec, suggestForMachine, withoutSelf } from "./engine";
import { ROW_FIELDS, body, client, compoundRowStudio } from "./fixtures";
import { buildCompanyBlock, samplesFromCompanyBlock } from "./fit-index";
import { DEFAULT_MATCH_SPEC, withFactor } from "./match-spec";
import type { FitSample } from "./types";

const studio = compoundRowStudio();
/** The same clients as the rest of the company sees them: anonymous cells. */
const company = samplesFromCompanyBlock(buildCompanyBlock(new Map([["solon", studio]]), "2026-09-13T07:00:00.000Z"));

const suggest = (args: Partial<Parameters<typeof suggestForMachine>[0]> & { heightIn?: number | null }) =>
  suggestForMachine({
    fieldKeys: ROW_FIELDS,
    target: body(args.heightIn === undefined ? 67 : args.heightIn),
    sources: { studio, company },
    spec: DEFAULT_MATCH_SPEC,
    ...args,
  });

describe("which tier answers", () => {
  it("uses the studio's own clients when they are close to her", () => {
    const result = suggest({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tier).toBe("studio");
    expect(result.cohort.ring).toBe(1);
    expect(result.picks.map((p) => `${p.key}=${p.value}`)).toEqual(["gap=0", "seat=4", "chest=3", "handles=in"]);
    // Handles are a coin-flip, so the set-up as a whole is offered but not bulk-accepted.
    expect(result.strength).toBe("fair");
  });

  it("calls a set-up strong when every pick is, and the values are seen together", () => {
    const result = suggest({ skip: ["handles"] });
    expect(result.ok && result.strength).toBe("strong");
    expect(result.ok && result.seenTogether).toBe(5);
  });

  it("a brand-new studio starts on company data", () => {
    const result = suggest({ sources: { studio: [], company } });
    expect(result.ok && result.tier).toBe("company");
    expect(result.ok && result.picks.find((p) => p.key === "seat")?.value).toBe("4");
  });

  it("prefers a tight company band to a studio band stretched to its limit", () => {
    // This studio has five clients, all 3" from her; the company has plenty at her height.
    const sparse = [70, 70, 70, 64, 64].map((h) => client(h, { seat: h === 70 ? "3" : "5" }));
    const result = suggest({ sources: { studio: sparse, company } });
    expect(result.ok && result.tier).toBe("company");
    expect(result.ok && result.cohort.ring).toBe(1);
  });

  it("stays with the studio when it is just as tight as the company", () => {
    const result = suggest({ sources: { studio, company } });
    expect(result.ok && result.tier).toBe("studio");
  });

  it("turns every factor but height and gender off for the company tier", () => {
    const spec = withFactor({ ...DEFAULT_MATCH_SPEC, gender: true }, "wingspan", { on: true });
    const c = companySpec(spec);
    expect(c.numeric.wingspan.on).toBe(false);
    expect(c.numeric.height.on).toBe(true);
    expect(c.gender).toBe(true);
  });
});

describe("when there is little to go on", () => {
  it("with no height on file, offers only what nearly everyone uses", () => {
    const result = suggest({ heightIn: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.picks).toHaveLength(1);
    expect(result.picks[0]).toMatchObject({ key: "gap", value: "0", universal: true });
    expect(result.cohort.used).toEqual([]);
  });

  it("with too few similar clients, says how many there are instead of quoting them", () => {
    const few = studio.filter((s) => (s.factors.heightIn ?? 0) >= 73);
    const result = suggest({ heightIn: 76, sources: { studio: few, company: null } });
    expect(result.ok).toBe(false);
    // `=== false`, not a truthiness test: this project compiles without
    // strictNullChecks, and only an equality check narrows the union there.
    if (result.ok !== false) return;
    expect(result.reason).toBe("thin");
    expect(result.cohort?.clients).toBe(3);
  });

  it("fills a field the similar clients cannot speak for with a universal value", () => {
    // Nobody near 5'7" has a gap recorded, but the studio as a whole is at Gap 0.
    const noGapNearby = studio.map((s) =>
      (s.factors.heightIn ?? 0) >= 66 && (s.factors.heightIn ?? 0) <= 68
        ? { ...s, settings: Object.fromEntries(Object.entries(s.settings).filter(([k]) => k !== "gap")) }
        : s,
    );
    const result = suggest({ sources: { studio: noGapNearby, company: null } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gap = result.picks.find((p) => p.key === "gap");
    expect(gap).toMatchObject({ value: "0", universal: true });
    expect(result.picks.find((p) => p.key === "seat")?.universal).toBeUndefined();
  });

  it("has nothing to say with no data at all", () => {
    expect(suggest({ sources: { studio: null, company: null } })).toMatchObject({ ok: false, reason: "no-data" });
    expect(suggest({ sources: { studio: [], company: [] } })).toMatchObject({ ok: false, reason: "no-data" });
    expect(suggest({ heightIn: null, sources: { studio: [], company: null } })).toMatchObject({
      ok: false,
      reason: "no-height",
    });
  });

  it("never suggests over a value the trainer already set", () => {
    const result = suggest({ pinned: { seat: "4", gap: "0" } });
    expect(result.ok && result.picks.map((p) => p.key)).toEqual(["chest", "handles"]);
  });
});

describe("auditing against the company", () => {
  it("takes one client out of the cell that looks exactly like her", () => {
    const cells: FitSample[] = [
      { settings: { seat: "9" }, n: 1, factors: { heightIn: 67, gender: "f" } },
      { settings: { seat: "4" }, n: 6, factors: { heightIn: 67, gender: "f" } },
    ];
    const out = withoutSelf(cells, body(67, { gender: "f" }), { seat: "9" });
    expect(out).toHaveLength(1);
    expect(out[0].settings.seat).toBe("4");

    const shared = withoutSelf([{ ...cells[0], n: 3 }, cells[1]], body(67, { gender: "f" }), { seat: "9" });
    expect(shared[0].n).toBe(2);
    // A different body, or different settings, is somebody else.
    expect(withoutSelf(cells, body(66, { gender: "f" }), { seat: "9" })).toHaveLength(2);
  });

  it("flags her against company data when the studio cannot judge", () => {
    const result = auditForMachine({
      fieldKeys: ROW_FIELDS,
      settings: { gap: "0", seat: "9", chest: "3" },
      target: body(67, { gender: "f" }),
      targetClientId: "her",
      sources: { studio: [], company },
      spec: DEFAULT_MATCH_SPEC,
    });
    expect(result.tier).toBe("company");
    expect(result.flags.map((f) => f.kind === "value" && f.key)).toEqual(["seat"]);
  });

  it("has nothing to check on a machine she is not set up on", () => {
    const result = auditForMachine({
      fieldKeys: ROW_FIELDS,
      settings: {},
      target: body(67),
      sources: { studio, company: null },
      spec: DEFAULT_MATCH_SPEC,
    });
    expect(result.flags).toEqual([]);
    expect(result.state).toBe("checked");
  });
});

describe("a strong set-up is one most similar clients actually hold", () => {
  it("does not call a set-up strong when each step is a majority but the whole is rare", () => {
    // Twelve clients at her height. Seat 4 is 7 of 12; among those Chest 3 is 4 of 7;
    // among those Pad B is 2 of 4 — every step at least half, the whole only 2 in 12.
    const rows: FitSample[] = [
      ...Array.from({ length: 2 }, () => client(67, { seat: "4", chest: "3", pad: "b" })),
      ...Array.from({ length: 2 }, () => client(67, { seat: "4", chest: "3", pad: "c" })),
      ...Array.from({ length: 3 }, () => client(67, { seat: "4", chest: "2", pad: "a" })),
      ...Array.from({ length: 5 }, () => client(67, { seat: "5", chest: "4", pad: "d" })),
    ];
    const result = suggestForMachine({
      fieldKeys: ["seat", "chest", "pad"],
      target: body(67),
      sources: { studio: rows, company: null },
      spec: DEFAULT_MATCH_SPEC,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seenTogether).toBeLessThan(result.cohort.clients * 0.3);
    expect(result.strength).toBe("fair");
  });
});
