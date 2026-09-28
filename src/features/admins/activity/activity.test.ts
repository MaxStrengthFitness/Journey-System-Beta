import { describe, expect, it } from "vitest";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_KINDS,
  activityPayload,
  andList,
  changeLine,
  cleanValues,
  describeValue,
  kindWords,
  newestFirst,
  toActivityEntry,
  WHAT_MAX,
} from "./activity";
import { afterName } from "./ActivityList";

describe("an Activity entry, as written", () => {
  it("is signed with the uid and the name, names its studio or null, and keeps only what changed", () => {
    const payload = activityPayload(
      {
        kind: "assisted-change",
        what: "Changed Minas Tirith's phone.",
        studioId: "minas-tirith",
        before: { Phone: undefined, Address: "Rath Dínen" },
        after: { Phone: "440-555-0101", Address: "The Citadel" },
        byName: "Faramir",
      },
      "uid-faramir",
    );
    expect(payload).toEqual({
      by: { uid: "uid-faramir", name: "Faramir" },
      studioId: "minas-tirith",
      kind: "assisted-change",
      what: "Changed Minas Tirith's phone.",
      // Firestore refuses undefined: the empty before-value is left out, never written.
      before: { Address: "Rath Dínen" },
      after: { Phone: "440-555-0101", Address: "The Citadel" },
    });
    // `at` is the server's time, added by logActivity.
    expect("at" in payload).toBe(false);
  });

  it("is the company's when no studio is named, and says no before or after it wasn't given", () => {
    const payload = activityPayload({ kind: "setting-default", what: "Set Max Strength's default for A quiet floor to 3.", byName: "  " }, "u1");
    expect(payload.studioId).toBeNull();
    expect(payload.by).toEqual({ uid: "u1", name: "An administrator" });
    expect("before" in payload).toBe(false);
    expect("after" in payload).toBe(false);
  });

  it("refuses a kind the record doesn't keep, an empty sentence, or nobody signed in", () => {
    expect(() => activityPayload({ kind: "gossip" as never, what: "x", byName: "E" }, "u")).toThrow();
    expect(() => activityPayload({ kind: "publish", what: "   ", byName: "E" }, "u")).toThrow();
    expect(() => activityPayload({ kind: "publish", what: "Published", byName: "E" }, "")).toThrow();
  });

  it("keeps a long sentence inside the rules' limit", () => {
    const payload = activityPayload({ kind: "publish", what: "a".repeat(900), byName: "Éowyn" }, "u");
    expect(String(payload.what).length).toBe(WHAT_MAX);
  });

  it("makes a before/after map flat and safe to store", () => {
    expect(cleanValues({ "Seat.position": 4, "a/b": true, list: ["Solon", "Westlake"], gone: undefined, empty: null })).toEqual({
      "Seat position": 4,
      "a b": true,
      list: "Solon, Westlake",
      empty: null,
    });
    expect(cleanValues({})).toBeNull();
    expect(cleanValues(null)).toBeNull();
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(cleanValues(many)!)).toHaveLength(20);
  });
});

describe("an Activity entry, as read", () => {
  it("reads a stored document, and turns down one with no sentence", () => {
    const at = { toMillis: () => Date.parse("2026-09-28T13:14:00Z") };
    expect(
      toActivityEntry("a1", { at, by: { uid: "u", name: "Faramir" }, studioId: "osgiliath", kind: "studio-stage", what: "Set Osgiliath's stage to Setting up." }),
    ).toEqual({
      id: "a1",
      at: Date.parse("2026-09-28T13:14:00Z"),
      by: { uid: "u", name: "Faramir" },
      studioId: "osgiliath",
      kind: "studio-stage",
      what: "Set Osgiliath's stage to Setting up.",
      before: null,
      after: null,
    });
    expect(toActivityEntry("a2", { kind: "publish" })).toBeNull();
    expect(toActivityEntry("a3", null)).toBeNull();
    // The server's time not back yet: null, never "the epoch".
    expect(toActivityEntry("a4", { what: "Did it.", at: null })!.at).toBeNull();
  });

  it("says a kind in words, and a newer kind this build doesn't know as a change", () => {
    expect(kindWords("admin-grant")).toBe("Admin grant");
    expect(kindWords("setting-default")).toBe("Studio defaults");
    expect(kindWords("from-the-future")).toBe("A change");
  });

  it("says what changed from what, four at most", () => {
    expect(changeLine({ Phone: null }, { Phone: "440-555-0101" })).toBe("Phone: none → 440-555-0101");
    expect(changeLine(null, { Role: "Head Trainer" })).toBe("Role: Head Trainer");
    expect(changeLine({ Role: "Head Trainer" }, null)).toBe("Role was Head Trainer");
    expect(changeLine(null, null)).toBeNull();
    expect(changeLine({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, { a: 2, b: 3, c: 4, d: 5, e: 6, f: 7 })).toBe("a: 1 → 2; b: 2 → 3; c: 3 → 4; d: 4 → 5; and 2 more");
    expect(describeValue(true)).toBe("yes");
    expect(describeValue("")).toBe("none");
  });

  it("lists newest first, the one still waiting for the server's time at the top", () => {
    const e = (id: string, at: number | null) => ({ id, at, by: { uid: "", name: "" }, studioId: null, kind: "publish", what: "x", before: null, after: null });
    expect(newestFirst([e("old", 1), e("pending", null), e("new", 5)]).map((x) => x.id)).toEqual(["pending", "new", "old"]);
  });

  it("puts the person's name first, lower-casing the verb but never an acronym", () => {
    expect(afterName("Set the default.")).toBe("set the default.");
    expect(afterName("MSF standard changed.")).toBe("MSF standard changed.");
    expect(andList(["Solon"])).toBe("Solon");
    expect(andList(["Solon", "Westlake", "Willoughby"])).toBe("Solon, Westlake and Willoughby");
  });
});

describe("the record's filters", () => {
  it("cover every kind, and each is one query's worth of kinds", () => {
    const all = ACTIVITY_FILTERS.find((f) => f.id === "all")!;
    expect([...all.kinds].sort()).toEqual([...ACTIVITY_KINDS].sort());
    const covered = new Set(ACTIVITY_FILTERS.filter((f) => f.id !== "all").flatMap((f) => f.kinds));
    expect([...covered].sort()).toEqual([...ACTIVITY_KINDS].sort());
    // Firestore's `in` takes 30 values at most.
    for (const f of ACTIVITY_FILTERS) expect(f.kinds.length).toBeLessThanOrEqual(30);
  });

  it("names the same seven kinds as firestore.rules", async () => {
    const { readFileSync } = await import("node:fs");
    const rules = readFileSync("firestore.rules", "utf8");
    const block = rules.slice(rules.indexOf("match /activity/{entryId}"));
    for (const k of ACTIVITY_KINDS) expect(block).toContain(`'${k}'`);
  });
});
