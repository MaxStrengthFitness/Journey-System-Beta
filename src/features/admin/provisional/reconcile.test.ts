import { describe, expect, it } from "vitest";
import type { Client } from "../../../types";
import {
  CLIENT_REFERENCE_FIELDS,
  SUGGEST_THRESHOLD,
  checkMerge,
  isMergedAway,
  mergeSteps,
  rankCandidates,
  scoreCandidate,
  survivorPatch,
  tombstonePatch,
} from "./reconcile";

const client = (over: Partial<Client> & { id: string }): Client => ({
  firstName: "Laura",
  lastName: "Adelman",
  homeStudioId: "solon",
  height: "",
  isActive: true,
  remainingSessions: 0,
  ...over,
});

const temp = (over: Partial<Client> = {}) =>
  client({ id: "temp-1", provisional: true, ...over });

const real = (over: Partial<Client> & { id: string }) =>
  client({ mindbodyClientId: "100012", ...over });

describe("the reference list", () => {
  it("covers the journal collections the old migration script missed", () => {
    // scripts/migrate-canonical-client-ids.ts repoints focusRecords and
    // trainerFocuses but not journalEntries or clientFocuses — and the
    // journal round's own docstring says clientFocuses REPLACES that pair.
    // A second hand-maintained list is how that happens, so this one is
    // exported and asserted.
    const names = CLIENT_REFERENCE_FIELDS.map((r) => r.collection);
    expect(names).toContain("journalEntries");
    expect(names).toContain("clientFocuses");
    expect(names).toContain("focusRecords");
    expect(names).toContain("trainerFocuses");
  });

  it("covers everything a session's history hangs off", () => {
    const names = CLIENT_REFERENCE_FIELDS.map((r) => r.collection);
    for (const required of [
      "sessions",
      "exerciseLogs",
      "schedules",
      "routines",
      "progressReports",
      "clinicalIncidents",
    ]) {
      expect(names, `${required} missing`).toContain(required);
    }
  });

  it("lists no collection twice", () => {
    const keys = CLIENT_REFERENCE_FIELDS.map((r) => `${r.collection}.${r.field}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isMergedAway", () => {
  it("recognises the current tombstone", () => {
    expect(isMergedAway({ supersededById: "real-1" })).toBe(true);
  });

  it("recognises the trainer tombstone", () => {
    expect(isMergedAway({ supersededByUid: "uid-1" })).toBe(true);
  });

  it("recognises the OLD migration script's tombstone", () => {
    // Code written against one vocabulary is blind to a tombstone written by
    // the other, and a corpse that looks live is how history gets duplicated.
    expect(isMergedAway({ migratedTo: "canonical-1" })).toBe(true);
  });

  it("leaves a live record alone", () => {
    expect(isMergedAway({})).toBe(false);
    expect(isMergedAway(null)).toBe(false);
  });
});

describe("scoreCandidate", () => {
  it("treats a matching email as the strongest signal", () => {
    const c = scoreCandidate(
      temp({ email: "Laura@Example.com" }),
      real({ id: "r", email: "laura@example.com" }),
    );
    expect(c.reasons.map((r) => r.label)).toContain("Same email");
    expect(c.suggested).toBe(true);
  });

  it("does not suggest on a name match alone", () => {
    // Two clients called Ken Sexton at one studio is unlikely; a merged
    // history is unrecoverable. So a name match asks rather than proposes.
    const c = scoreCandidate(temp(), real({ id: "r" }));
    expect(c.reasons.map((r) => r.label)).toEqual(["Same name", "Same studio"]);
    expect(c.score).toBeLessThan(SUGGEST_THRESHOLD);
    expect(c.suggested).toBe(false);
  });

  it("adds up name, studio and date of birth into a suggestion", () => {
    const c = scoreCandidate(
      temp({ dateOfBirth: "1954-03-02" }),
      real({ id: "r", dateOfBirth: "1954-03-02" }),
    );
    expect(c.score).toBeGreaterThanOrEqual(SUGGEST_THRESHOLD);
  });

  it("ignores phone formatting", () => {
    const c = scoreCandidate(
      temp({ phone: "(440) 555-0100" }),
      real({ id: "r", phone: "4405550100" }),
    );
    expect(c.reasons.map((r) => r.label)).toContain("Same phone");
  });

  it("does not match on a phone fragment", () => {
    const c = scoreCandidate(
      temp({ phone: "0100" }),
      real({ id: "r", phone: "0100" }),
    );
    expect(c.reasons.map((r) => r.label)).not.toContain("Same phone");
  });

  it("scores nothing for a different person", () => {
    const c = scoreCandidate(
      temp({ email: "a@b.com" }),
      real({ id: "r", firstName: "Ed", lastName: "Ellis", homeStudioId: "westlake" }),
    );
    expect(c.score).toBe(0);
  });
});

describe("rankCandidates", () => {
  const all = [
    real({ id: "r-exact", email: "laura@example.com" }),
    real({ id: "r-name" }),
    real({ id: "r-other", firstName: "Ed", lastName: "Ellis", homeStudioId: "westlake" }),
  ];

  it("puts the strongest match first and drops non-matches", () => {
    const ranked = rankCandidates(temp({ email: "laura@example.com" }), all);
    expect(ranked.map((c) => c.client.id)).toEqual(["r-exact", "r-name"]);
  });

  it("never offers another temporary profile", () => {
    // Merging one temporary record into another leaves the pair no closer to
    // the source of truth and doubles the eventual work.
    const ranked = rankCandidates(temp(), [
      client({ id: "other-temp", provisional: true }),
    ]);
    expect(ranked).toEqual([]);
  });

  it("never offers a record with no Mindbody id", () => {
    expect(rankCandidates(temp(), [client({ id: "no-mb" })])).toEqual([]);
  });

  it("never offers a record already merged away", () => {
    expect(
      rankCandidates(temp(), [real({ id: "dead", supersededById: "x" })]),
    ).toEqual([]);
  });

  it("never offers the record itself", () => {
    const self = temp({ email: "laura@example.com" });
    expect(rankCandidates(self, [self])).toEqual([]);
  });
});

describe("checkMerge", () => {
  it("passes a genuine merge", () => {
    expect(checkMerge(temp(), real({ id: "r" }))).toBeNull();
  });

  it("refuses a record merging into itself", () => {
    const t = temp();
    expect(checkMerge(t, { ...t, mindbodyClientId: "1" })).toMatchObject({
      code: "same-record",
    });
  });

  it("refuses to merge away a real Mindbody record", () => {
    expect(
      checkMerge(real({ id: "r1" }), real({ id: "r2" })),
    ).toMatchObject({ code: "not-provisional" });
  });

  it("refuses a temporary profile that was already merged", () => {
    // Two managers reconciling the same person at once, or one double-tap.
    expect(
      checkMerge(temp({ supersededById: "r0" }), real({ id: "r" })),
    ).toMatchObject({ code: "already-merged" });
  });

  it("refuses to merge into a record that is itself a tombstone", () => {
    expect(
      checkMerge(temp(), real({ id: "r", migratedTo: "canonical" })),
    ).toMatchObject({ code: "survivor-merged" });
  });

  it("refuses a survivor with no Mindbody id", () => {
    expect(
      checkMerge(temp(), client({ id: "r" })),
    ).toMatchObject({ code: "survivor-not-real" });
  });
});

describe("mergeSteps", () => {
  it("repoints everything before it tombstones anything", () => {
    // Order is load-bearing: an interruption must leave a temporary profile
    // that is still visibly temporary and still reconcilable. Tombstoning
    // first would strand whatever had not moved, with nothing saying so.
    const keys = mergeSteps().map((s) => s.key);
    expect(keys[keys.length - 1]).toBe("tombstone");
    expect(keys.indexOf("survivor")).toBeLessThan(keys.indexOf("tombstone"));
    for (const ref of CLIENT_REFERENCE_FIELDS) {
      expect(keys.indexOf(`${ref.collection}.${ref.field}`)).toBeLessThan(
        keys.indexOf("tombstone"),
      );
    }
  });

  it("includes the composite-id re-key and the roster fix-up", () => {
    const keys = mergeSteps().map((s) => s.key);
    expect(keys).toContain("clientMachineSettings");
    expect(keys).toContain("kaizenRoster");
  });
});

describe("patches", () => {
  const NOW = new Date("2026-09-08T14:00:00Z");

  it("records on the survivor where its history came from", () => {
    expect(survivorPatch("temp-1", NOW)).toEqual({
      mergedFromId: "temp-1",
      mergedAt: NOW.toISOString(),
    });
  });

  it("tombstones rather than deletes, and stops the record being provisional", () => {
    const patch = tombstonePatch("real-1", NOW);
    expect(patch.supersededById).toBe("real-1");
    expect(patch.provisional).toBe(false);
    expect(patch.isActive).toBe(false);
  });
});
