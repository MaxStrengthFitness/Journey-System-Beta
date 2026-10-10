import { describe, expect, it } from "vitest";
import {
  ENCODED_ABSENT,
  decodeData,
  decodeValue,
  encodeData,
  encodeValue,
  encodedValueAt,
  isEncodedAbsent,
  parseBackupLines,
  planRestore,
  stableJson,
  type BackupLine,
  type ValueKit,
} from "./test-reset-codec";

class Ts {
  constructor(readonly seconds: number, readonly nanoseconds: number) {}
}
class Geo {
  constructor(readonly latitude: number, readonly longitude: number) {}
}
class Ref {
  constructor(readonly path: string) {}
}
class Vector {
  constructor(readonly values: number[]) {}
}

const kit: ValueKit = {
  timestampParts: (v) => (v instanceof Ts ? { seconds: v.seconds, nanoseconds: v.nanoseconds } : null),
  makeTimestamp: (s, n) => new Ts(s, n),
  geoPointParts: (v) => (v instanceof Geo ? { latitude: v.latitude, longitude: v.longitude } : null),
  makeGeoPoint: (a, b) => new Geo(a, b),
  refPath: (v) => (v instanceof Ref ? v.path : null),
  makeRef: (p) => new Ref(p),
  bytesOf: (v) => (v instanceof Uint8Array ? v : null),
  makeBytes: (b) => new Uint8Array(b),
};

describe("the backup's values", () => {
  it("brings every Firestore type back as itself, through JSON", () => {
    const data = {
      at: new Ts(1_760_000_000, 123_000_000),
      where: new Geo(41.4, -81.7),
      client: new Ref("clients/abc"),
      raw: new Uint8Array([0, 1, 250]),
      odd: NaN,
      big: Infinity,
      list: [1, "two", null, new Ts(1, 2), { deep: [new Ref("x/y")] }],
      // A map that happens to have the tag's key is kept as a map.
      tagged: { __t: "ts", s: 1 },
      plain: { a: 1, b: { c: true } },
      nothing: null,
    };
    const json = JSON.parse(JSON.stringify(encodeData(data, kit, "d")));
    const back = decodeData(json, kit) as typeof data;
    expect(back.at).toBeInstanceOf(Ts);
    expect(back.at).toEqual(data.at);
    expect(back.where).toEqual(data.where);
    expect(back.client).toBeInstanceOf(Ref);
    expect((back.client as Ref).path).toBe("clients/abc");
    expect([...(back.raw as Uint8Array)]).toEqual([0, 1, 250]);
    expect(back.odd).toBeNaN();
    expect(back.big).toBe(Infinity);
    expect(back.list[3]).toBeInstanceOf(Ts);
    expect(((back.list[4] as { deep: Ref[] }).deep[0] as Ref).path).toBe("x/y");
    expect(back.tagged).toEqual({ __t: "ts", s: 1 });
    expect(back.plain).toEqual(data.plain);
    expect(back.nothing).toBeNull();
  });

  it("refuses a value it can't write, so nothing is deleted without its backup", () => {
    expect(() => encodeValue({ v: new Vector([1]) }, kit, "doc")).toThrow(/doc\.v is a Vector/);
  });

  it("marks an absent field apart from null", () => {
    expect(isEncodedAbsent(ENCODED_ABSENT)).toBe(true);
    expect(isEncodedAbsent(null)).toBe(false);
    expect(isEncodedAbsent({ __t: "absent", x: 1 })).toBe(false);
    expect(() => decodeValue(ENCODED_ABSENT, kit)).toThrow();
  });

  it("compares two encodings whatever their key order", () => {
    expect(stableJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(stableJson({ a: [{ c: 2, d: 1 }], b: 1 }));
  });
});

describe("the backup file", () => {
  it("reads its own lines back and refuses a stranger", () => {
    const lines: BackupLine[] = [
      { kind: "doc", path: "sessions/s1", group: "core", part: "sessions", data: { a: 1 } },
      { kind: "fields", path: "clients/c1", changes: [{ field: ["sessionCount"], group: "core", part: "client-counters", before: 3, after: ENCODED_ABSENT }] },
    ];
    const text = lines.map((l) => JSON.stringify(l)).join("\r\n") + "\n";
    expect(parseBackupLines(text)).toEqual(lines);
    expect(() => parseBackupLines('{"kind":"other"}')).toThrow(/Line 1/);
    expect(() => parseBackupLines("not json")).toThrow(/Line 1/);
  });
});

describe("the way back", () => {
  const lines: BackupLine[] = [
    { kind: "doc", path: "sessions/s1", group: "core", part: "sessions", data: { a: 1 } },
    { kind: "doc", path: "sessions/s2", group: "core", part: "sessions", data: { a: 2 } },
    {
      kind: "fields",
      path: "clients/c1",
      changes: [
        { field: ["sessionCount"], group: "core", part: "client-counters", before: 3, after: ENCODED_ABSENT },
        { field: ["lastSessionDate"], group: "core", part: "client-last-session", before: "2026-10-01", after: ENCODED_ABSENT },
        { field: ["fordSummary"], group: "core", part: "ford-summary", before: ENCODED_ABSENT, after: { counts: { family: 0 } } },
      ],
    },
    { kind: "fields", path: "noteDismissals/u", changes: [{ field: ["threads", "j"], group: "core", part: "dismissals-deleted", before: 5, after: ENCODED_ABSENT }] },
    { kind: "fields", path: "clients/gone", changes: [{ field: ["renewal"], group: "core", part: "job-renewal", before: {}, after: ENCODED_ABSENT }] },
  ];

  it("creates what is missing, puts back what the reset left as it was, and leaves anything that moved since", () => {
    const now: Record<string, Record<string, unknown>> = {
      // A trainer's new session wrote lastSessionDate since: left alone. The summary is still the reset's.
      "clients/c1": { lastSessionDate: "2026-11-02", fordSummary: { counts: { family: 0 } } },
      "noteDismissals/u": { threads: {} },
    };
    const plan = planRestore(lines, new Set(["sessions/s2"]), (p) => now[p] ?? null);
    expect(plan.create.map((l) => l.path)).toEqual(["sessions/s1"]);
    expect(plan.docsExistingNow.map((l) => l.path)).toEqual(["sessions/s2"]);
    expect(plan.fields).toEqual([
      {
        path: "clients/c1",
        restores: [
          { field: ["sessionCount"], value: 3 },
          // The summary wasn't there before: putting it back deletes it.
          { field: ["fordSummary"], value: ENCODED_ABSENT },
        ],
      },
      { path: "noteDismissals/u", restores: [{ field: ["threads", "j"], value: 5 }] },
    ]);
    expect(plan.fieldsChangedSince).toEqual([{ path: "clients/c1", field: ["lastSessionDate"] }]);
    expect(plan.fieldDocsGone).toEqual(["clients/gone"]);
  });

  it("reads a field path through a map the codec wrapped", () => {
    expect(encodedValueAt({ m: { __t: "map", v: { __t: 1, k: 2 } } }, ["m", "k"])).toBe(2);
    expect(encodedValueAt({ m: 1 }, ["m", "k"])).toEqual(ENCODED_ABSENT);
  });
});
