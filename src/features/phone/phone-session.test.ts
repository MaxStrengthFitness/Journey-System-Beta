import { describe, expect, it } from "vitest";
import type { JourneyRow, JourneySession, JourneySet, LiveSet } from "../journey-grid/types";
import {
  cardLogged,
  countsSeconds,
  lastPerformed,
  lastTimes,
  noPastWords,
  parseCount,
  parseWeight,
  shortDate,
  stepWeight,
  todayWeight,
  toggledQuality,
} from "./phone-session";

const session = (n: number, date: string): JourneySession => ({ id: `s${n}`, sessionNumber: n, date, trainerInitials: "AJ" });
const set = (sessionId: string, over: Partial<JourneySet> = {}): JourneySet => ({
  sessionId,
  outcome: "performed",
  weight: 100,
  reps: 9,
  quality: 2,
  ...over,
});
const row = (sets: JourneySet[], prescribedWeight?: number): JourneyRow => ({
  machine: { id: "m1", name: "Leg Press", group: "Lower Body" },
  sets: Object.fromEntries(sets.map((s) => [s.sessionId, s])),
  prescribedWeight,
});

const history = [
  session(1, "2026-08-20"),
  session(2, "2026-08-24"),
  session(3, "2026-08-27"),
  session(4, "2026-08-31"),
  session(5, "2026-09-03"),
  session(6, "2026-09-07"),
  session(7, "2026-09-10"),
];

describe("shortDate", () => {
  it("reads the day from the string, not a Date", () => {
    expect(shortDate("2026-09-03")).toBe("Sep 3");
    expect(shortDate("2026-12-31")).toBe("Dec 31");
    expect(shortDate("2026-01-01T00:00:00Z")).toBe("Jan 1");
  });
  it("says nothing for something that is not a date", () => {
    expect(shortDate("")).toBe("");
    expect(shortDate("yesterday")).toBe("");
    expect(shortDate("2026-13-01")).toBe("");
  });
});

describe("lastTimes", () => {
  it("is the machine's last five times, oldest first", () => {
    const r = row(history.map((s, i) => set(s.id, { weight: 100 + i * 2 })));
    const cells = lastTimes(r, history);
    expect(cells.map((c) => c.sessionId)).toEqual(["s3", "s4", "s5", "s6", "s7"]);
    expect(cells.map((c) => c.weight)).toEqual([104, 106, 108, 110, 112]);
    expect(cells[4].dateText).toBe("Sep 10");
  });

  it("skips sessions where the machine was not done, so the five are hers", () => {
    const r = row([set("s1"), set("s2"), set("s4"), set("s6")]);
    expect(lastTimes(r, history).map((c) => c.sessionId)).toEqual(["s1", "s2", "s4", "s6"]);
  });

  it("does not count a not-reached set as a time", () => {
    const r = row([set("s5"), set("s6", { outcome: "not_reached", weight: 0, reps: undefined }), set("s7")]);
    expect(lastTimes(r, history).map((c) => c.sessionId)).toEqual(["s5", "s7"]);
  });

  it("keeps a practice set's numbers and a skip's lack of them", () => {
    const r = row([
      set("s6", { outcome: "practice", weight: 60, reps: 12 }),
      set("s7", { outcome: "skipped", weight: 0, reps: undefined, skipReason: "pain_injury" }),
    ]);
    const [practice, skip] = lastTimes(r, history);
    expect(practice).toMatchObject({ outcome: "practice", weight: 60, count: "12" });
    expect(skip).toMatchObject({ outcome: "skipped", weight: null, count: null });
  });

  it("writes a timed hold as seconds", () => {
    const r = row([set("s7", { isTSC: true, reps: undefined, seconds: 45 })]);
    expect(lastTimes(r, history)[0].count).toBe("45s");
  });

  it("is empty for a machine she has never done", () => {
    expect(lastTimes(row([]), history)).toEqual([]);
    expect(lastTimes(row([set("s1")]), [])).toEqual([]);
  });
});

describe("noPastWords: what a card with no past times says (machine menu, Oct 2026)", () => {
  it("says first time only with every session read and the whole story in Journey", () => {
    expect(noPastWords({ knownElsewhere: false, everythingRead: true, coverage: "complete" })).toBe("First time on this machine.");
    expect(noPastWords({ knownElsewhere: false, everythingRead: true, coverage: "partial" })).toBe("Nothing recorded on this machine.");
  });

  it("says nothing is in the sessions loaded here while older ones are unread", () => {
    expect(noPastWords({ knownElsewhere: false, everythingRead: false, coverage: "complete" })).toBe(
      "Nothing recorded on this machine in the sessions loaded here.",
    );
  });

  it("never calls a machine a running total knows new, and quotes no count", () => {
    const words = noPastWords({ knownElsewhere: true, everythingRead: true, coverage: "complete" });
    expect(words).toBe("Done here in Journey before · not in the sessions loaded here.");
    expect(words).not.toMatch(/[0-9]/);
  });
});

describe("lastPerformed and countsSeconds", () => {
  it("finds the newest performed set, past a practice", () => {
    const r = row([set("s5", { reps: 8 }), set("s6", { outcome: "practice", reps: 12 })]);
    expect(lastPerformed(r, history)?.reps).toBe(8);
    expect(lastPerformed(row([]), history)).toBeNull();
  });

  it("opens a machine last done as a hold in seconds, until today says otherwise", () => {
    const last = set("s7", { isTSC: true, seconds: 40, reps: undefined });
    expect(countsSeconds(undefined, last)).toBe(true);
    const typedReps: LiveSet = { weight: 100, reps: 9, seconds: null, isTSC: false, quality: 2 };
    expect(countsSeconds(typedReps, last)).toBe(false);
    expect(countsSeconds(undefined, set("s7"))).toBe(false);
  });
});

describe("todayWeight and stepWeight", () => {
  it("is today's entry, else the pre-fill, else nothing", () => {
    const v: LiveSet = { weight: 124, reps: null, seconds: null, isTSC: false, quality: null };
    expect(todayWeight(v, row([], 120))).toBe(124);
    expect(todayWeight(undefined, row([], 120))).toBe(120);
    expect(todayWeight(undefined, row([]))).toBeNull();
  });

  it("steps by the machine's increment and never goes below zero", () => {
    expect(stepWeight(120, 2, 1)).toBe(122);
    expect(stepWeight(1, 2, -1)).toBe(0);
    expect(stepWeight(null, 2, 1)).toBe(2);
    expect(stepWeight(0.1, 0.2, 1)).toBe(0.3);
  });
});

describe("cardLogged", () => {
  it("counts a count, a practice or a skip", () => {
    const base: LiveSet = { weight: 100, reps: null, seconds: null, isTSC: false, quality: null };
    expect(cardLogged(undefined)).toBe(false);
    expect(cardLogged(base)).toBe(false);
    expect(cardLogged({ ...base, reps: 9 })).toBe(true);
    expect(cardLogged({ ...base, isTSC: true, reps: 9 })).toBe(false);
    expect(cardLogged({ ...base, isTSC: true, seconds: 30 })).toBe(true);
    expect(cardLogged({ ...base, outcome: "skipped" })).toBe(true);
    expect(cardLogged({ ...base, outcome: "practice" })).toBe(true);
  });
});

describe("parsing what was typed", () => {
  it("takes digits only for a count, and empty is no set", () => {
    expect(parseCount("9")).toBe(9);
    expect(parseCount(" 12 ")).toBe(12);
    expect(parseCount("1234")).toBe(123);
    expect(parseCount("")).toBeNull();
    expect(parseCount("x")).toBeNull();
  });
  it("takes a weight with a decimal", () => {
    expect(parseWeight("122")).toBe(122);
    expect(parseWeight("12.5 lb")).toBe(12.5);
    expect(parseWeight("")).toBeNull();
  });
});

describe("toggledQuality", () => {
  it("turns a mark on, and the same tap back to an ordinary set", () => {
    expect(toggledQuality(2, 1)).toBe(1);
    expect(toggledQuality(1, 1)).toBe(2);
    expect(toggledQuality(1, 3)).toBe(3);
    expect(toggledQuality(null, 3)).toBe(3);
  });
});
