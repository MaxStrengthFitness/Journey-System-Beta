import { describe, expect, it } from "vitest";
import { ROW_FIELDS, body, client, compoundRowStudio } from "./fixtures";
import type { FitAuditSubject } from "./fit-index";
import {
  LINK_MIN_CLIENTS,
  MAX_BAND_INCHES,
  MAX_CLUSTERS,
  auditEveryone,
  bodyStats,
  buildKaizen,
  clusterReports,
  deriveFieldKeys,
  fieldReport,
  heightBands,
  linkOf,
  studioHabits,
  type KaizenSample,
} from "./kaizen";
import type { FitSample } from "./types";

const studio = compoundRowStudio();

const subjectOf = (s: FitSample, studioId: string | null = "solon", extra: Partial<FitAuditSubject> = {}): FitAuditSubject => ({
  clientId: s.clientId as string,
  studioId,
  settings: s.settings,
  factors: body(s.factors.heightIn ?? null, s.factors),
  acks: {},
  ...extra,
});

describe("bodyStats — who a group of clients are", () => {
  it("counts always, averages only from the minimum sample up", () => {
    const four = [client(64, {}), client(65, {}), client(66, {}), client(67, {}, { gender: "m" })];
    expect(bodyStats(four)).toMatchObject({
      clients: 4,
      women: 3,
      men: 1,
      withHeight: 4,
      avgHeightIn: null,
      minHeightIn: null,
      maxHeightIn: null,
    });
    const five = [...four, client(68, {}, { gender: "m" })];
    expect(bodyStats(five)).toMatchObject({ clients: 5, avgHeightIn: 66, minHeightIn: 64, maxHeightIn: 68 });
  });

  it("weights an anonymous company cell by its count", () => {
    const cells: FitSample[] = [
      { n: 9, settings: {}, factors: { heightIn: 60, gender: "f" } },
      { n: 1, settings: {}, factors: { heightIn: 70, gender: "m" } },
    ];
    expect(bodyStats(cells)).toMatchObject({ clients: 10, women: 9, men: 1, avgHeightIn: 61 });
  });

  it("holds weight and age to their own minimum, not the group's", () => {
    const group = [60, 61, 62, 63, 64, 65].map((h, i) => client(h, {}, i < 3 ? { weightLb: 140 + i, ageYears: 50 } : {}));
    const stats = bodyStats(group);
    expect(stats.avgHeightIn).not.toBeNull();
    expect(stats.avgWeightLb).toBeNull();
    expect(stats.avgAgeYears).toBeNull();
  });

  it("leaves a client with no gender on file out of both counts", () => {
    expect(bodyStats([client(64, {}, { gender: null })])).toMatchObject({ clients: 1, women: 0, men: 0 });
  });
});

describe("heightBands — the finest bands the data supports", () => {
  it("is one inch wide where the studio has plenty of clients that height", () => {
    const dense = [64, 64, 64, 64, 64, 65, 65, 65, 65, 65].map((h) => client(h, {}));
    expect(heightBands(dense)).toEqual([
      { from: 64, to: 64, clients: 5 },
      { from: 65, to: 65, clients: 5 },
    ]);
  });

  it("widens in the tails, but never past the limit", () => {
    const sparse = [58, 60, 61, 64, 64, 64, 64, 64].map((h) => client(h, {}));
    const bands = heightBands(sparse);
    expect(bands[0]).toEqual({ from: 58, to: 61, clients: 3 });
    expect(bands[0].to - bands[0].from + 1).toBeLessThanOrEqual(MAX_BAND_INCHES);
    expect(bands[1]).toEqual({ from: 64, to: 64, clients: 5 });
  });

  it("folds a thin last band into its neighbour when the two stay narrow", () => {
    const tail = [70, 70, 70, 70, 70, 72].map((h) => client(h, {}));
    expect(heightBands(tail)).toEqual([{ from: 70, to: 72, clients: 6 }]);
  });

  it("keeps a thin last band on its own when folding it in would make a band that says nothing", () => {
    const tail = [64, 64, 64, 64, 64, 76].map((h) => client(h, {}));
    expect(heightBands(tail)).toEqual([
      { from: 64, to: 64, clients: 5 },
      { from: 76, to: 76, clients: 1 },
    ]);
  });

  it("leaves out clients with no height rather than guessing a band for them", () => {
    const some = [client(64, {}), { n: 3, settings: {}, factors: {} } as FitSample];
    expect(heightBands(some)).toEqual([{ from: 64, to: 64, clients: 1 }]);
  });
});

describe("linkOf — does a setting follow a body measure", () => {
  it("finds the seat following height on the compound row, and says which way", () => {
    const link = linkOf(studio, "seat", "height");
    expect(link).not.toBeNull();
    expect(link!.clients).toBe(24);
    expect(link!.r).toBeLessThan(-0.9);
    // Roughly a notch lower for every three inches.
    expect(link!.slope).toBeLessThan(-0.25);
    expect(link!.slope).toBeGreaterThan(-0.45);
  });

  it("is not tested on fewer clients than the named minimum", () => {
    expect(linkOf(studio.slice(0, LINK_MIN_CLIENTS - 1), "seat", "height")).toBeNull();
    expect(linkOf(studio.slice(0, LINK_MIN_CLIENTS), "seat", "height")).not.toBeNull();
  });

  it("is not tested when one side does not vary — there is no line to draw", () => {
    expect(linkOf(studio, "gap", "height")).not.toBeNull(); // gap varies a little (one client on 2)
    const allZero = studio.map((s) => ({ ...s, settings: { ...s.settings, gap: "0" } }));
    expect(linkOf(allZero, "gap", "height")).toBeNull();
    const sameHeight = studio.map((s) => ({ ...s, factors: { ...s.factors, heightIn: 66 } }));
    expect(linkOf(sameHeight, "seat", "height")).toBeNull();
  });

  it("ignores words in a numbered field and measures nobody has", () => {
    expect(linkOf(studio, "handles", "height")).toBeNull();
    expect(linkOf(studio, "seat", "wingspan")).toBeNull();
  });

  it("weights a company cell by its count", () => {
    const cells: FitSample[] = [
      { n: 6, settings: { seat: "6" }, factors: { heightIn: 60 } },
      { n: 6, settings: { seat: "2" }, factors: { heightIn: 72 } },
      { n: 1, settings: { seat: "4" }, factors: { heightIn: 66 } },
    ];
    const link = linkOf(cells, "seat", "height");
    expect(link).toMatchObject({ clients: 13, r: -1 });
    expect(link!.slope).toBeCloseTo(-1 / 3, 2);
  });
});

describe("fieldReport — one setting, by value and by height", () => {
  const bands = heightBands(studio);

  it("lists a numbered field low to high, with who is on each value", () => {
    const seat = fieldReport("seat", studio, bands);
    expect(seat.numeric).toBe(true);
    expect(seat.clients).toBe(24);
    expect(seat.values.map((v) => v.value)).toEqual(["2", "3", "4", "5", "6"]);
    const two = seat.values[0];
    expect(two).toMatchObject({ clients: 5, men: 5, women: 0, avgHeightIn: 73, minHeightIn: 72, maxHeightIn: 74 });
    expect(two.share).toBeCloseTo(5 / 24, 3);
    // Four clients on Seat 6: counted, but too few to describe.
    expect(seat.values[4]).toMatchObject({ value: "6", clients: 4, avgHeightIn: null });
  });

  it("lists a worded field most used first, and does not look for a link", () => {
    const handles = fieldReport("handles", studio, bands);
    expect(handles.numeric).toBe(false);
    expect(handles.values.map((v) => v.value)).toEqual(["in", "out"]);
    expect(handles.clients).toBe(21);
    expect(handles.links).toEqual([]);
    expect(handles.tested).toEqual([]);
  });

  it("says where each height band mostly sits, and nothing for a band that is too thin", () => {
    const seat = fieldReport("seat", studio, bands);
    expect(seat.bands.length).toBe(bands.length);
    const short = seat.bands[0];
    expect(short.from).toBe(61);
    expect(short.top).toEqual({ value: "6", clients: 4 });
    expect(short.next).toEqual({ value: "5", clients: 1 });
    expect(short.median).toBe(6);
    const thin = fieldReport("seat", studio.slice(0, 3), heightBands(studio.slice(0, 3)));
    expect(thin.bands.every((b) => b.top === null && b.next === null && b.median === null)).toBe(true);
    expect(thin.bands[0].withField).toBe(3);
  });

  it("reports a link only when it is there, but records that it looked", () => {
    const seat = fieldReport("seat", studio, bands);
    expect(seat.tested).toEqual([{ factor: "height", clients: 24 }]);
    expect(seat.links.map((l) => l.factor)).toEqual(["height"]);
    const gap = fieldReport("gap", studio, bands);
    expect(gap.tested).toEqual([{ factor: "height", clients: 24 }]);
    expect(gap.links).toEqual([]);
  });

  it("does not credit weight with what height is doing", () => {
    // Weight here is just height in other units: it follows the seat exactly as well, and no better.
    const shadowed = studio.map((s) => ({ ...s, factors: { ...s.factors, weightLb: 100 + ((s.factors.heightIn ?? 0) - 60) * 5 } }));
    const seat = fieldReport("seat", shadowed, heightBands(shadowed));
    expect(seat.tested.map((t) => t.factor)).toEqual(["height", "weight"]);
    expect(seat.links.map((l) => l.factor)).toEqual(["height"]);
  });

  it("does report a second measure that beats height", () => {
    // Height says nothing here (shuffled); the seat tracks wingspan.
    const byWingspan = studio.map((s, i) => ({
      ...s,
      factors: { ...s.factors, heightIn: 60 + ((i * 7) % 15), wingspanIn: 80 - Number(s.settings.seat) * 3 },
    }));
    const seat = fieldReport("seat", byWingspan, heightBands(byWingspan));
    expect(seat.links[0].factor).toBe("wingspan");
    expect(seat.links.some((l) => l.factor === "height")).toBe(false);
  });

  it("counts the long tail of values instead of listing it", () => {
    const many = Array.from({ length: 15 }, (_, i) => [client(66, { pin: String(i + 1) }), client(66, { pin: String(i + 1) })]).flat();
    const pin = fieldReport("pin", many, heightBands(many));
    expect(pin.values).toHaveLength(12);
    expect(pin.otherClients).toBe(6);
  });
});

describe("clusterReports — whole set-ups seen more than once", () => {
  it("lists the combinations clients actually share, most common first", () => {
    const clusters = clusterReports(studio, ROW_FIELDS);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters.length).toBeLessThanOrEqual(MAX_CLUSTERS);
    expect(clusters[0].clients).toBeGreaterThanOrEqual(clusters[clusters.length - 1].clients);
    for (const c of clusters) expect(c.clients).toBeGreaterThanOrEqual(2);
    const top = clusters[0];
    expect(top.share).toBeCloseTo(top.clients / 24, 3);
  });

  it("never lists a set-up only one client has", () => {
    const loner = [...studio, client(80, { gap: "9", seat: "9", chest: "9", handles: "in" })];
    expect(clusterReports(loner, ROW_FIELDS).some((c) => c.settings.seat === "9")).toBe(false);
  });

  it("marks a set-up that names every field", () => {
    const clusters = clusterReports(studio, ROW_FIELDS);
    for (const c of clusters) expect(c.complete).toBe(ROW_FIELDS.every((k) => c.settings[k] !== undefined));
  });
});

describe("auditEveryone — the passive check, for the whole studio at once", () => {
  const odd = client(67, { gap: "0", seat: "9", chest: "3", handles: "in" }, { clientId: "odd" });
  const everyone = [...studio, odd];

  it("finds the one client sitting where nobody her height sits", () => {
    const rollup = auditEveryone({ fieldKeys: ROW_FIELDS, subjects: everyone.map((s) => subjectOf(s)), evidence: everyone });
    expect(rollup.findings.map((f) => f.clientId)).toEqual(["odd"]);
    expect(rollup.findings[0].flags[0]).toMatchObject({ key: "seat", value: "9", level: "rare" });
    // Enough to say who she was compared with (the ladder widened one step
    // to find five clients), and nothing that names them.
    expect(rollup.findings[0].cohort.bands.height).toEqual({ lo: 66, hi: 68 });
    expect(Object.keys(rollup.findings[0].cohort).sort()).toEqual(["bands", "clients", "ring", "used"]);
    expect(rollup.checked + rollup.notChecked).toBe(everyone.length);
  });

  it("does not let a client vouch for her own set-up", () => {
    // Five clients at 6'6", four of them agreeing. Without leave-one-out the
    // fifth would be in her own cohort.
    const tall = ["3", "3", "3", "3", "3", "9"].map((seat, i) => client(78, { seat }, { clientId: `t${i}` }));
    const rollup = auditEveryone({ fieldKeys: ["seat"], subjects: tall.map((s) => subjectOf(s)), evidence: tall });
    expect(rollup.findings.map((f) => f.clientId)).toEqual(["t5"]);
  });

  it("leaves alone a setting somebody has already marked right for this client", () => {
    const subjects = everyone.map((s) =>
      s.clientId === "odd" ? subjectOf(s, "solon", { acks: { seat: { value: "9", by: "", byName: "", at: "" } } }) : subjectOf(s),
    );
    expect(auditEveryone({ fieldKeys: ROW_FIELDS, subjects, evidence: everyone }).findings).toEqual([]);
  });

  it("looks again when the reviewed value has since changed", () => {
    const subjects = everyone.map((s) =>
      s.clientId === "odd" ? subjectOf(s, "solon", { acks: { seat: { value: "8", by: "", byName: "", at: "" } } }) : subjectOf(s),
    );
    expect(auditEveryone({ fieldKeys: ROW_FIELDS, subjects, evidence: everyone }).findings).toHaveLength(1);
  });

  it("cannot check a client with no height, and says so rather than passing her", () => {
    const noHeight: FitAuditSubject = { clientId: "nh", studioId: "solon", settings: { seat: "9" }, factors: body(null), acks: {} };
    const rollup = auditEveryone({ fieldKeys: ROW_FIELDS, subjects: [noHeight], evidence: studio });
    expect(rollup).toMatchObject({ checked: 0, notChecked: 1, findings: [] });
  });

  it("tallies what could be checked per studio", () => {
    const subjects = everyone.map((s, i) => subjectOf(s, i % 2 === 0 ? "solon" : "westlake"));
    const rollup = auditEveryone({ fieldKeys: ROW_FIELDS, subjects, evidence: everyone });
    expect((rollup.checkedByStudio.solon ?? 0) + (rollup.checkedByStudio.westlake ?? 0)).toBe(rollup.checked);
  });
});

describe("studioHabits — where one studio's usual value differs", () => {
  const at = (studioId: string, list: FitSample[]): KaizenSample[] => list.map((s) => ({ ...s, studioId }));
  const solon = at("solon", compoundRowStudio());
  const westlake = at(
    "westlake",
    compoundRowStudio().map((s) => ({ ...s, settings: { ...s.settings, gap: "2" } })),
  );
  const both = [...solon, ...westlake];
  const fields = Object.fromEntries(ROW_FIELDS.map((k) => [k, fieldReport(k, both, heightBands(both))]));

  it("names a setting one studio mostly sets differently from the others", () => {
    const habits = studioHabits("westlake", both, fields);
    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({ key: "gap", studioValue: "2", elsewhereValue: "0", studioOutOf: 24, elsewhereOutOf: 24 });
  });

  it("says nothing about a setting that follows height — the clients differ, not the studio", () => {
    const tallStudio = at(
      "tall",
      compoundRowStudio().filter((s) => (s.factors.heightIn ?? 0) >= 70),
    );
    const shortStudio = at(
      "short",
      compoundRowStudio().filter((s) => (s.factors.heightIn ?? 0) <= 66),
    );
    const mixed = [...tallStudio, ...shortStudio];
    const f = Object.fromEntries(ROW_FIELDS.map((k) => [k, fieldReport(k, mixed, heightBands(mixed))]));
    expect(f.seat.links.some((l) => l.factor === "height")).toBe(true);
    expect(studioHabits("tall", mixed, f).some((h) => h.key === "seat")).toBe(false);
  });

  it("needs the minimum sample on both sides", () => {
    const tiny = [...solon, ...westlake.slice(0, 3)];
    const f = Object.fromEntries(ROW_FIELDS.map((k) => [k, fieldReport(k, tiny, heightBands(tiny))]));
    expect(studioHabits("westlake", tiny, f)).toEqual([]);
  });
});

describe("buildKaizen — the whole report", () => {
  it("derives the fields from the data when nobody names them", () => {
    expect(deriveFieldKeys(studio)).toEqual(["gap", "chest", "seat", "handles"].sort((a, b) => {
      const n = (k: string) => studio.filter((s) => s.settings[k] !== undefined).length;
      return n(b) - n(a) || (a < b ? -1 : 1);
    }));
    expect(deriveFieldKeys([client(66, { oddity: "1" })])).toEqual([]);
  });

  it("reports one studio without a per-studio section", () => {
    const samples: KaizenSample[] = studio.map((s) => ({ ...s, studioId: "solon" }));
    const { report, findings } = buildKaizen({
      machineId: "m-compound-row",
      samples,
      subjects: samples.map((s) => subjectOf(s)),
      fieldKeys: ROW_FIELDS,
    });
    expect(report).toMatchObject({ machineId: "m-compound-row", onFile: 24, clients: 24, withHeight: 24, studios: 1, byStudio: {} });
    expect(report.fieldKeys).toEqual([...ROW_FIELDS]);
    expect(findings).toEqual([]);
  });

  it("reports every studio when there is more than one, in counts only", () => {
    const odd = client(67, { gap: "0", seat: "9", chest: "3" }, { clientId: "odd-one" });
    const samples: KaizenSample[] = [
      ...compoundRowStudio().map((s) => ({ ...s, studioId: "solon" })),
      ...compoundRowStudio().map((s) => ({ ...s, studioId: "westlake" })),
      { ...odd, studioId: "westlake" },
    ];
    const subjects = samples.map((s) => subjectOf(s, s.studioId ?? null));
    const { report, findings } = buildKaizen({ machineId: "m", samples, subjects, fieldKeys: ROW_FIELDS });
    expect(report.studios).toBe(2);
    expect(report.byStudio.westlake).toMatchObject({ clients: 25, unusual: 1 });
    expect(report.byStudio.solon).toMatchObject({ clients: 24, unusual: 0 });
    expect(report.unusual).toBe(1);
    expect(findings.map((f) => f.clientId)).toEqual(["odd-one"]);
  });

  it("never puts a client id in the half that gets stored", () => {
    const samples: KaizenSample[] = studio.map((s, i) => ({ ...s, clientId: `SECRET-${i}`, studioId: i % 2 ? "a" : "b" }));
    const odd: KaizenSample = { ...client(67, { seat: "9" }, { clientId: "SECRET-odd" }), studioId: "a" };
    const all = [...samples, odd];
    const { report, findings } = buildKaizen({ machineId: "m", samples: all, subjects: all.map((s) => subjectOf(s, s.studioId ?? null)) });
    expect(findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain("SECRET");
  });

  it("skips the check when no subjects are given (evidence only)", () => {
    const { report } = buildKaizen({ machineId: "m", samples: studio });
    expect(report).toMatchObject({ onFile: 0, checked: 0, unusual: 0 });
    expect(Object.keys(report.fields).length).toBeGreaterThan(0);
  });
});
