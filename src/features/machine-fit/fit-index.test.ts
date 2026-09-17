import { describe, expect, it } from "vitest";
import { client } from "./fixtures";
import {
  buildCompanyBlock,
  cellKey,
  easternDayOf,
  liveAcks,
  parseCellKey,
  samplesFromCompanyBlock,
  samplesFromFitDoc,
  settingsOfSignature,
  signatureOf,
  subjectsFromFitDoc,
  toFitRow,
  verifiedSettings,
  type FitClientRecord,
  type MachineFitDoc,
} from "./fit-index";

const SEP_17_NOON = Date.UTC(2026, 8, 17, 16, 0, 0); // noon Eastern

describe("toFitRow", () => {
  it("normalises the legacy label keys and the catalog slugs to the same row", () => {
    const legacy = toFitRow({ "Back Pad": "6", Seat: "Seat 4", Gap: " 0 " }, null, SEP_17_NOON);
    const catalog = toFitRow({ "back-pad": "6", seat: "4", gap: "0" }, null, SEP_17_NOON);
    expect(legacy).toEqual({ s: { "back-pad": "6", seat: "4", gap: "0" }, t: SEP_17_NOON });
    expect(legacy).toEqual(catalog);
  });

  it("keeps only the sources that matter — typed is the default and is not stored", () => {
    const row = toFitRow(
      { Seat: "4", Gap: "0", Chest: "3" },
      { Seat: "suggested", Gap: "typed", Chest: "legacy", Pillow: "suggested" },
      SEP_17_NOON,
    );
    expect(row?.src).toEqual({ seat: "suggested", chest: "legacy" });
  });

  it("is null when nothing usable is set, so the caller removes the row", () => {
    expect(toFitRow({}, null, SEP_17_NOON)).toBeNull();
    expect(toFitRow({ Seat: "", Gap: "-" }, null, SEP_17_NOON)).toBeNull();
    expect(toFitRow(null, null, SEP_17_NOON)).toBeNull();
  });
});

describe("reviews on a row", () => {
  it("copies a review only while it still applies to the value on file", () => {
    const s = { seat: "9", gap: "0", chest: "3" };
    expect(liveAcks(s, { seat: { value: "9" }, gap: { value: "2" }, pillow: { value: "1" } })).toEqual({ seat: "9" });
  });

  it("reads a combination's key and value the way the audit writes them", () => {
    const s = { seat: "9", chest: "3" };
    expect(liveAcks(s, { "chest+seat": { value: "3+9" } })).toEqual({ "chest+seat": "3+9" });
    expect(liveAcks(s, { "chest+seat": { value: "3+8" } })).toEqual({});
  });

  it("ignores anything that is not a review", () => {
    expect(liveAcks({ seat: "9" }, null)).toEqual({});
    expect(liveAcks({ seat: "9" }, { seat: undefined, gap: { value: 9 } })).toEqual({});
  });

  it("rides along on the row, and is left off when there is none", () => {
    const row = toFitRow({ Seat: "9", Gap: "0" }, null, SEP_17_NOON, { seat: { value: "9" } });
    expect(row).toEqual({ s: { seat: "9", gap: "0" }, a: { seat: "9" }, t: SEP_17_NOON });
    expect(toFitRow({ Seat: "9" }, null, SEP_17_NOON, { seat: { value: "4" } })).toEqual({ s: { seat: "9" }, t: SEP_17_NOON });
  });
});

describe("what counts as evidence", () => {
  const row = { s: { seat: "4", gap: "0" }, src: { seat: "suggested" as const }, t: SEP_17_NOON };

  it("reads the save time as the studio's Eastern day", () => {
    expect(easternDayOf(SEP_17_NOON)).toBe("2026-09-17");
    // 01:30 UTC on the 18th is still the evening of the 17th in the studio.
    expect(easternDayOf(Date.UTC(2026, 8, 18, 1, 30))).toBe("2026-09-17");
  });

  it("leaves an accepted suggestion out until the machine has been performed since", () => {
    expect(verifiedSettings(row, null)).toEqual({ gap: "0" });
    expect(verifiedSettings(row, "2026-09-10")).toEqual({ gap: "0" });
    expect(verifiedSettings(row, "2026-09-17")).toEqual({ seat: "4", gap: "0" });
    expect(verifiedSettings(row, "2026-09-24")).toEqual({ seat: "4", gap: "0" });
  });

  it("counts typed and FileMaker values from the day they are saved", () => {
    const typed = { s: { seat: "4" }, t: SEP_17_NOON };
    const legacy = { s: { seat: "4" }, src: { seat: "legacy" as const }, t: SEP_17_NOON };
    expect(verifiedSettings(typed, null)).toEqual({ seat: "4" });
    expect(verifiedSettings(legacy, null)).toEqual({ seat: "4" });
  });
});

describe("samplesFromFitDoc", () => {
  const doc: MachineFitDoc = {
    machineId: "m-compound-row",
    studioId: "solon",
    rows: {
      judy: { s: { seat: "4", gap: "0" }, t: SEP_17_NOON },
      sam: { s: { seat: "3" }, src: { seat: "suggested" }, t: SEP_17_NOON },
      pat: { s: { seat: "5" }, src: { seat: "suggested" }, t: SEP_17_NOON },
      gone: { s: { seat: "2" }, t: SEP_17_NOON },
    },
  };
  const clients = new Map<string, FitClientRecord>([
    ["judy", { id: "judy", height: "5'4\"", gender: "Female", weight: "148" }],
    ["sam", { id: "sam", height: "5'11\"", gender: "Male" }],
    [
      "pat",
      {
        id: "pat",
        height: "5'6\"",
        gender: "Female",
        machineStats: { "m-compound-row": { lastPerformedDate: "2026-09-19" } },
      },
    ],
  ]);

  it("joins each row to the body on the client record — the index itself stores none", () => {
    const samples = samplesFromFitDoc(doc, clients, new Date(2026, 8, 20));
    expect(samples.map((s) => s.clientId)).toEqual(["judy", "pat"]);
    expect(samples[0]).toMatchObject({ n: 1, settings: { seat: "4", gap: "0" } });
    expect(samples[0].factors).toMatchObject({ heightIn: 64, gender: "f", weightLb: 148 });
    // Pat accepted a suggestion and has trained on it since: it counts now.
    expect(samples[1].settings).toEqual({ seat: "5" });
  });

  it("leaves out an unperformed suggestion and a client it cannot see", () => {
    const ids = samplesFromFitDoc(doc, clients).map((s) => s.clientId);
    expect(ids).not.toContain("sam"); // only ever accepted, never trained
    expect(ids).not.toContain("gone"); // no client record in hand
  });

  it("survives a missing or malformed document", () => {
    expect(samplesFromFitDoc(null, clients)).toEqual([]);
    expect(samplesFromFitDoc({ machineId: "m", rows: { x: null as never } }, clients)).toEqual([]);
  });

  it("reads SUBJECTS as what is on file — an accepted value included, because it deserves the second look", () => {
    const withReview: MachineFitDoc = {
      ...doc,
      rows: { ...doc.rows, judy: { ...doc.rows.judy, a: { seat: "4" } }, stub: { a: { seat: "1" } } as never },
    };
    const subjects = subjectsFromFitDoc(withReview, clients, new Date(2026, 8, 20));
    expect(subjects.map((s) => s.clientId)).toEqual(["judy", "sam", "pat"]);
    expect(subjects[0]).toMatchObject({ studioId: "solon", settings: { seat: "4", gap: "0" } });
    expect(subjects[0].acks.seat.value).toBe("4");
    expect(subjects[0].factors).toMatchObject({ heightIn: 64, gender: "f" });
    // Sam's seat was only ever accepted: not evidence, but very much on file.
    expect(subjects[1].settings).toEqual({ seat: "3" });
    expect(subjectsFromFitDoc(null, clients)).toEqual([]);
  });
});

describe("the company block", () => {
  it("writes settings as an ordered signature and reads it back", () => {
    const settings = { seat: "4", gap: "0", "back-pad": "6_5" };
    expect(signatureOf(settings)).toBe("back-pad=6_5;gap=0;seat=4");
    expect(settingsOfSignature(signatureOf(settings))).toEqual(settings);
    expect(settingsOfSignature("")).toEqual({});
  });

  it("keys a cell by height and gender", () => {
    expect(cellKey(67, "f")).toBe("67|f");
    expect(cellKey(70, null)).toBe("70|x");
    expect(parseCellKey("67|f")).toEqual({ heightIn: 67, gender: "f" });
    expect(parseCellKey("70|x")).toEqual({ heightIn: 70, gender: null });
    expect(parseCellKey("tall|f")).toBeNull();
  });

  it("pools studios into anonymous counts — no ids survive", () => {
    const solon = [client(67, { seat: "4" }), client(67, { seat: "4" }), client(66, { seat: "5" })];
    const westlake = [client(67, { seat: "4" }), client(72, { seat: "2" }, { gender: "m" })];
    const noHeight = [{ clientId: "z", n: 1, settings: { seat: "4" }, factors: { heightIn: null } }];
    const block = buildCompanyBlock(
      new Map([
        ["solon", solon],
        ["westlake", westlake],
        ["empty", noHeight],
      ]),
      "2026-09-13T07:00:00.000Z",
    );
    expect(block.clients).toBe(5);
    expect(block.studios).toBe(2);
    expect(block.cells["67|f"]).toEqual({ "seat=4": 3 });
    expect(JSON.stringify(block)).not.toMatch(/"c\d+"|clientId/);

    const samples = samplesFromCompanyBlock(block);
    expect(samples.every((s) => s.clientId === undefined)).toBe(true);
    const at67 = samples.find((s) => s.factors.heightIn === 67);
    expect(at67).toMatchObject({ n: 3, settings: { seat: "4" }, factors: { gender: "f" } });
  });

  it("reads an empty or missing block as no samples", () => {
    expect(samplesFromCompanyBlock(null)).toEqual([]);
    expect(samplesFromCompanyBlock({ clients: 0, studios: 0, cells: {}, builtAt: "" })).toEqual([]);
  });
});
