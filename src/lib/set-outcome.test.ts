import { describe, expect, it } from "vitest";
import {
  PICKABLE_SKIP_REASONS,
  SET_OUTCOMES,
  SKIP_REASONS,
  hasEffort,
  importedOutcome,
  isPerformedLog,
  isRecordedOnly,
  outcomeAtFinish,
  outcomeOf,
  performedOnly,
  skipReasonOf,
  unreachedMachineIds,
} from "./set-outcome";

describe("set outcome — the four states", () => {
  it("names exactly four outcomes, and only performed counts", () => {
    expect(SET_OUTCOMES).toEqual(["performed", "practice", "skipped", "not_reached"]);
    expect(isPerformedLog({ outcome: "performed" })).toBe(true);
    expect(isPerformedLog({ outcome: "practice", reps: "12", weight: 100 } as any)).toBe(false);
    expect(isPerformedLog({ outcome: "skipped" })).toBe(false);
    expect(isPerformedLog({ outcome: "not_reached" })).toBe(false);
  });

  it("an explicit outcome always wins over the data on the log", () => {
    // A practice set carries real numbers and is still not performed.
    expect(outcomeOf({ outcome: "practice", reps: "10" })).toBe("practice");
    // A skipped log with stray numbers is still skipped.
    expect(outcomeOf({ outcome: "skipped", reps: "3" })).toBe("skipped");
  });
});

describe("set outcome — backward compatibility for logs without the field", () => {
  it("a count makes a legacy log performed", () => {
    expect(outcomeOf({ reps: "8" })).toBe("performed");
    expect(outcomeOf({ reps: 8 })).toBe("performed");
    expect(outcomeOf({ isTSC: true, seconds: "90" })).toBe("performed");
    expect(outcomeOf({ isStaticHold: true, seconds: 45 })).toBe("performed");
  });

  it("no count means skipped, reason unknown — the blank cell finally has a name", () => {
    expect(outcomeOf({})).toBe("skipped");
    expect(outcomeOf({ reps: "0" })).toBe("skipped");
    expect(outcomeOf({ reps: "" })).toBe("skipped");
    expect(skipReasonOf({ reps: "" })).toBe("unknown");
    // A hold with reps but no seconds is a mismatch, not an effort.
    expect(outcomeOf({ isTSC: true, reps: "10" })).toBe("skipped");
  });

  it("a missing log is not reached", () => {
    expect(outcomeOf(null)).toBe("not_reached");
    expect(outcomeOf(undefined)).toBe("not_reached");
  });

  it("hasEffort follows the hold/reps rule", () => {
    expect(hasEffort({ reps: "6" })).toBe(true);
    expect(hasEffort({ isTSC: true, seconds: "60" })).toBe(true);
    expect(hasEffort({ isTSC: true, reps: "6" })).toBe(false);
    expect(hasEffort({ reps: "abc" })).toBe(false);
    expect(hasEffort(null)).toBe(false);
  });
});

describe("skip reasons", () => {
  it("returns null unless the log was skipped, and maps unknown strings to unknown", () => {
    expect(skipReasonOf({ outcome: "performed" })).toBeNull();
    expect(skipReasonOf({ outcome: "practice" })).toBeNull();
    expect(skipReasonOf({ outcome: "skipped", skipReason: "pain_injury" })).toBe("pain_injury");
    expect(skipReasonOf({ outcome: "skipped", skipReason: "made-up" })).toBe("unknown");
    expect(skipReasonOf({ outcome: "skipped" })).toBe("unknown");
  });

  it("the floor picker never offers 'unknown'", () => {
    expect(SKIP_REASONS).toContain("unknown");
    expect(PICKABLE_SKIP_REASONS).not.toContain("unknown");
    expect(PICKABLE_SKIP_REASONS).toEqual([
      "pain_injury",
      "machine_occupied",
      "out_of_service",
      "client_declined",
      "trainers_call",
      "other",
    ]);
  });
});

describe("performedOnly / isRecordedOnly", () => {
  it("keeps only performed logs, in order", () => {
    const logs = [
      { id: "a", reps: "10" },
      { id: "b", outcome: "practice" as const, reps: "10" },
      { id: "c", outcome: "skipped" as const },
      { id: "d", reps: "8" },
      { id: "e", outcome: "not_reached" as const },
    ];
    expect(performedOnly(logs).map((l) => l.id)).toEqual(["a", "d"]);
    expect(performedOnly(null)).toEqual([]);
  });

  it("recorded-only means practice or skipped", () => {
    expect(isRecordedOnly({ outcome: "practice" })).toBe(true);
    expect(isRecordedOnly({ outcome: "skipped" })).toBe(true);
    expect(isRecordedOnly({ outcome: "performed" })).toBe(false);
    expect(isRecordedOnly({ outcome: "not_reached" })).toBe(false);
  });
});

describe("outcomeAtFinish — nothing leaves a session ambiguous", () => {
  it("keeps an explicit outcome and its reason", () => {
    expect(outcomeAtFinish({ outcome: "practice", reps: "12" })).toEqual({ outcome: "practice" });
    expect(outcomeAtFinish({ outcome: "skipped", skipReason: "machine_occupied" })).toEqual({
      outcome: "skipped",
      skipReason: "machine_occupied",
    });
    expect(outcomeAtFinish({ outcome: "skipped" })).toEqual({ outcome: "skipped", skipReason: "unknown" });
  });

  it("an effort is performed; a count-less set is skipped unless the trainer said practice", () => {
    expect(outcomeAtFinish({ reps: "9" })).toEqual({ outcome: "performed" });
    expect(outcomeAtFinish({ weight: "100" } as any)).toEqual({ outcome: "skipped", skipReason: "unknown" });
    expect(outcomeAtFinish({ weight: "100" } as any, "practice")).toEqual({ outcome: "practice" });
    expect(outcomeAtFinish({ weight: "100" } as any, "skipped")).toEqual({ outcome: "skipped", skipReason: "unknown" });
    // The trainer's answer never overrides a real effort.
    expect(outcomeAtFinish({ reps: "9" }, "practice")).toEqual({ outcome: "performed" });
  });
});

describe("unreachedMachineIds — derived, never prompted", () => {
  it("lists planned machines with no log of any kind, once each, in sequence order", () => {
    const planned = ["m-lp", "m-cp", "m-cp", "m-tr", "m-lat"];
    const logs = [{ machineId: "m-lp" }, { machineId: "m-tr", side: "Left" }];
    expect(unreachedMachineIds(planned, logs)).toEqual(["m-cp", "m-lat"]);
  });

  it("a machine with a skipped or practice log was reached", () => {
    expect(unreachedMachineIds(["a", "b"], [{ machineId: "a", outcome: "skipped" } as any])).toEqual(["b"]);
  });

  it("ignores blanks", () => {
    expect(unreachedMachineIds(["", "a"], [])).toEqual(["a"]);
  });
});

describe("importedOutcome — the FileMaker rule", () => {
  it("counts rows with reps, and files the rest as skipped: unknown", () => {
    expect(importedOutcome({ reps: "10" })).toEqual({ outcome: "performed" });
    expect(importedOutcome({ reps: "0" })).toEqual({ outcome: "skipped", skipReason: "unknown" });
    expect(importedOutcome({ reps: "X" })).toEqual({ outcome: "skipped", skipReason: "unknown" });
    expect(importedOutcome({})).toEqual({ outcome: "skipped", skipReason: "unknown" });
  });
});
