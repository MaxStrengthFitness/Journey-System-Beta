import { describe, expect, it } from "vitest";
import {
  editStampOf,
  editStampUpdate,
  formatEditStamp,
  machineStatsUpdate,
  machineVoteDelta,
  newSetDoc,
  ownsClientCounters,
  plainFieldOps,
  stampDate,
} from "./session-edits";
import type { HistorySession } from "./model";

const session = (extra: Record<string, unknown> = {}): HistorySession =>
  ({ id: "s1", status: "Completed", ...extra }) as HistorySession;

/** The startTime shape isBackfilledSession looks for. */
const backfilled = (extra: Record<string, unknown> = {}) =>
  session({ startTime: "2026-09-01T12:00:00.000Z", ...extra });

describe("the edit stamp", () => {
  it("writes who, when and one more edit", () => {
    const u = editStampUpdate({ uid: "u1", name: "AJ Jurgens", initials: "AJ" }, plainFieldOps);
    expect(u.editedById).toBe("u1");
    expect(u.editedByName).toBe("AJ Jurgens");
    expect(u.editedByInitials).toBe("AJ");
    expect(u.editCount).toBe(1);
    expect(u.editedAt).toBe("SERVER_TIMESTAMP");
  });

  it("writes nulls rather than undefined — Firestore refuses undefined", () => {
    const u = editStampUpdate({ uid: null, name: null, initials: null }, plainFieldOps);
    expect(u.editedById).toBeNull();
    expect(u.editedByName).toBeNull();
    expect(Object.values(u).some((v) => v === undefined)).toBe(false);
  });

  it("is absent on a session nobody has edited", () => {
    expect(editStampOf(session())).toBeNull();
    expect(editStampOf(session({ editCount: 0 }))).toBeNull();
    expect(editStampOf(null)).toBeNull();
  });

  it("is present as soon as either the date or the count is there", () => {
    expect(editStampOf(session({ editedAt: "2026-09-17T14:00:00.000Z" }))).not.toBeNull();
    // An older edit written before the date field existed still counts.
    expect(editStampOf(session({ editCount: 2 }))).not.toBeNull();
  });

  it("reads a Firestore Timestamp, an ISO string and a Date alike", () => {
    const iso = "2026-09-17T14:00:00.000Z";
    expect(stampDate({ toDate: () => new Date(iso) })?.toISOString()).toBe(iso);
    expect(stampDate({ seconds: Date.parse(iso) / 1000 })?.toISOString()).toBe(iso);
    expect(stampDate(iso)?.toISOString()).toBe(iso);
    expect(stampDate(new Date(iso))?.toISOString()).toBe(iso);
    expect(stampDate("not a date")).toBeNull();
    expect(stampDate(null)).toBeNull();
  });

  it("says who and when, and how many times when it is more than one", () => {
    const stamp = editStampOf(session({ editedAt: "2026-09-17T16:00:00.000Z", editedByName: "AJ", editCount: 1 }));
    expect(formatEditStamp(stamp, "America/New_York")).toBe("Edited by AJ on Sep 17");
    const twice = editStampOf(session({ editedAt: "2026-09-17T16:00:00.000Z", editedByName: "AJ", editCount: 3 }));
    expect(formatEditStamp(twice, "America/New_York")).toBe("Edited by AJ on Sep 17 · 3 edits");
  });

  it("still says who when the date is unreadable, and falls back to initials", () => {
    expect(formatEditStamp({ at: null, byName: null, byInitials: "KM", count: 1 })).toBe("Edited by KM");
    expect(formatEditStamp({ at: null, byName: null, byInitials: null, count: 1 })).toBe("Edited by someone");
    expect(formatEditStamp(null)).toBe("");
  });
});

describe("machine votes", () => {
  const performed = (machineId: string, reps = "8") => ({ machineId, reps, outcome: "performed" as const });
  const skipped = (machineId: string) => ({ machineId, reps: "0", outcome: "skipped" as const });

  it("casts a vote for a machine added to the session", () => {
    expect(machineVoteDelta([performed("chest")], [performed("chest"), performed("row")])).toEqual({ row: 1 });
  });

  it("takes a vote back for a machine removed from it", () => {
    expect(machineVoteDelta([performed("chest"), performed("row")], [performed("chest")])).toEqual({ row: -1 });
  });

  it("returns nothing when only the numbers changed", () => {
    expect(machineVoteDelta([performed("chest", "8")], [performed("chest", "12")])).toEqual({});
  });

  it("takes the vote back when the last performed set on a machine stops counting", () => {
    // Two sets on one machine; the performed one is dropped, the skipped one stays.
    expect(machineVoteDelta([performed("leg"), skipped("leg")], [skipped("leg")])).toEqual({ leg: -1 });
  });

  it("does not double-vote a machine that has two performed sets", () => {
    expect(machineVoteDelta([], [performed("leg"), performed("leg")])).toEqual({ leg: 1 });
  });

  it("ignores a set with no machine id", () => {
    expect(machineVoteDelta([], [{ machineId: "", reps: "8" }])).toEqual({});
  });

  it("reads a legacy log with no outcome field by its count", () => {
    expect(machineVoteDelta([], [{ machineId: "row", reps: "10" }])).toEqual({ row: 1 });
    expect(machineVoteDelta([], [{ machineId: "row", reps: "0" }])).toEqual({});
  });

  it("turns the delta into dot-path increments and skips the zeroes", () => {
    expect(machineStatsUpdate({ row: 1, chest: -1, leg: 0 }, plainFieldOps)).toEqual({
      "machineStats.row.timesPerformed": 1,
      "machineStats.chest.timesPerformed": -1,
    });
  });
});

describe("which sessions own the client's counters", () => {
  it("a completed live session does", () => {
    expect(ownsClientCounters(session())).toBe(true);
  });

  it("an unfinished session does not", () => {
    expect(ownsClientCounters(session({ status: "In-Progress" }))).toBe(false);
  });

  it("a backfill written before Sep 17 2026 does not — it never incremented anything", () => {
    expect(ownsClientCounters(backfilled())).toBe(false);
  });

  it("a backfill written since does, because it said so on the document", () => {
    expect(ownsClientCounters(backfilled({ countsTowardTotals: true }))).toBe(true);
  });

  it("nothing at all owns nothing", () => {
    expect(ownsClientCounters(null)).toBe(false);
  });
});

describe("a set added by hand", () => {
  const seed = { clientId: "c1", sessionId: "s1", machineId: "chest-press" };

  it("with a rep count is a performed set", () => {
    const doc = newSetDoc({ ...seed, weight: "120", reps: "8", repQuality: 3 });
    expect(doc.outcome).toBe("performed");
    expect(doc.weight).toBe("120");
    expect(doc.reps).toBe("8");
    expect(doc.seconds).toBe("0");
    expect(doc.repQuality).toBe(3);
    expect(doc.skipReason).toBeUndefined();
  });

  it("with no count is a skipped machine, not a performed set of zero", () => {
    const doc = newSetDoc({ ...seed, weight: "120", reps: "" });
    expect(doc.outcome).toBe("skipped");
    expect(doc.skipReason).toBe("unknown");
    expect(doc.repQuality).toBeUndefined();
  });

  it("carries no rep quality when the trainer did not remember one", () => {
    expect(newSetDoc({ ...seed, reps: "8", repQuality: null }).repQuality).toBeUndefined();
  });

  it("writes isStaticHold AND isTSC together — the live flow reads either", () => {
    const hold = newSetDoc({ ...seed, seconds: "45", isHold: true });
    expect(hold.isStaticHold).toBe(true);
    expect(hold.isTSC).toBe(true);
    expect(hold.seconds).toBe("45");
    expect(hold.reps).toBe("0");
    expect(hold.outcome).toBe("performed");
  });

  it("never writes undefined into Firestore", () => {
    const doc = newSetDoc(seed) as Record<string, unknown>;
    expect(Object.values(doc).some((v) => v === undefined)).toBe(false);
  });
});
