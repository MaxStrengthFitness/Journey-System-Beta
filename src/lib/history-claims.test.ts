import { describe, expect, it } from "vitest";
import {
  NO_WINDOW,
  WHOLE_STORY,
  allTimeLabel,
  canClaimGap,
  dayAfter,
  firstTimeTag,
  historyStartWords,
  isEstablishedClient,
  machineUsageWords,
  newMachinesPhrase,
  noMachineHistoryBody,
  noMachineHistoryLine,
  noReportSentence,
  ownedWindow,
  reportSessionWords,
  sessionCountLabel,
  sessionNumberTag,
  setupPromptLine,
} from "./history-claims";
import { earliestKnownDate } from "./client-since";
import type { HistoryCoverage, PriorHistory } from "./prior-history";

/*
 * The direction of failure is the thing under test, as in client-coverage.
 * Every claim about the CLIENT - first time, a session number, a break -
 * appears for `complete` and for nothing else, and every function defaults
 * to the cautious wording when a caller has no coverage to give.
 */
const NOT_COMPLETE: HistoryCoverage[] = ["partial", "unknown"];

const prior = (over: Partial<PriorHistory> = {}): PriorHistory => ({
  sessions: 412,
  importedCount: 0,
  through: "2026-09-12",
  source: "filemaker",
  ...over,
});

describe("a machine with nothing on it", () => {
  it("is her first time only when Journey holds her whole story", () => {
    expect(noMachineHistoryLine("complete")).toBe("First time on this machine");
    for (const c of NOT_COMPLETE) expect(noMachineHistoryLine(c)).toBe("Nothing recorded on this machine");
    expect(noMachineHistoryLine()).toBe("Nothing recorded on this machine");
  });

  it("says where it looked on the machine sheet, and keeps the set-up instruction", () => {
    expect(noMachineHistoryBody("Judy", "complete")).toBe(
      "Judy has no history here yet. Set up from the guide below, then save the settings so the next trainer has them.",
    );
    const partial = noMachineHistoryBody("Judy", "partial", false);
    expect(partial).toContain("Journey has no sets for Judy on this machine");
    expect(partial).toContain("(none on file for this machine yet)");
    expect(partial).not.toMatch(/first time|no history here/i);
  });

  it("does not promise a first set in the set-up prompt", () => {
    expect(setupPromptLine("complete")).toContain("before the first set");
    for (const c of NOT_COMPLETE) expect(setupPromptLine(c)).not.toMatch(/first/i);
  });

  it("tags 'First time' after the session only when it is", () => {
    expect(firstTimeTag("complete")).toBe("First time");
    for (const c of NOT_COMPLETE) expect(firstTimeTag(c)).toBeNull();
    expect(firstTimeTag()).toBeNull();
  });

  it("counts new machines in the headline only when they are new to her", () => {
    expect(newMachinesPhrase(1, "complete")).toBe("1 new machine");
    expect(newMachinesPhrase(3, "complete")).toBe("3 new machines");
    expect(newMachinesPhrase(0, "complete")).toBeNull();
    for (const c of NOT_COMPLETE) expect(newMachinesPhrase(2, c)).toBeNull();
  });

  it("labels the machine's History card as Journey's, short of complete", () => {
    expect(machineUsageWords("complete")).toEqual({
      never: "Never performed by this client.",
      first: "First performed",
      times: "Times performed",
      since: "since first set",
    });
    for (const c of NOT_COMPLETE) {
      const w = machineUsageWords(c);
      expect(w.never).toBe("Nothing recorded on this machine in Journey.");
      expect(w.first).toBe("First in Journey");
      expect(w.times).toBe("Times in Journey");
      expect(w.since).toBe("since first set in Journey");
    }
  });
});

describe("session numbers and counts", () => {
  it("quotes a number only through the gate", () => {
    expect(sessionNumberTag(413, true)).toBe("#413");
    expect(sessionNumberTag(3, false)).toBeNull();
  });

  it("never quotes a number it does not have", () => {
    expect(sessionNumberTag(0, true)).toBeNull();
    expect(sessionNumberTag(null, true)).toBeNull();
    expect(sessionNumberTag(undefined, true)).toBeNull();
    expect(sessionNumberTag(Number.NaN, true)).toBeNull();
    expect(sessionNumberTag(-4, true)).toBeNull();
  });

  it("calls a Journey-only count what it is", () => {
    expect(sessionCountLabel(true)).toBe("Completed sessions");
    expect(sessionCountLabel(false)).toBe("Sessions in Journey");
  });
});

describe("the start of the record, and 'all'", () => {
  it("is the start of her history only when it is", () => {
    expect(historyStartWords("complete").label).toBe("Start of history");
    for (const c of NOT_COMPLETE) {
      expect(historyStartWords(c).label).toBe("Start of Journey");
      expect(historyStartWords(c).spoken).toContain("not recorded here");
    }
  });

  it("is 'All time' only when Journey holds all of it", () => {
    expect(allTimeLabel("complete")).toBe("All time");
    for (const c of NOT_COMPLETE) expect(allTimeLabel(c)).toBe("All in Journey");
  });

  it("names the progress report's window instead of her first session", () => {
    expect(reportSessionWords("complete")).toMatchObject({ total: "Total Sessions", first: "First Session", before: null });
    const w = reportSessionWords("partial", prior());
    expect(w.total).toBe("Sessions");
    expect(w.first).toBe("Since");
    expect(w.useFirst).toBe("Use First in Journey");
    expect(w.before).toBe("412 before Journey");
  });

  it("counts only what is not already a row in Journey", () => {
    expect(reportSessionWords("partial", prior({ importedCount: 12 })).before).toBe("400 before Journey");
    expect(reportSessionWords("complete", prior({ importedCount: 412 })).before).toBeNull();
    expect(reportSessionWords("unknown").before).toBeNull();
  });

  it("does not say a report is missing when it may be in FileMaker", () => {
    expect(noReportSentence("complete")).toContain("no progress report on file");
    for (const c of NOT_COMPLETE) expect(noReportSentence(c)).toBe("No progress report in Journey yet. Please perform an evaluation.");
  });
});

describe("isEstablishedClient - 'has she been here three months?'", () => {
  const now = new Date(2026, 8, 24, 12); // 24 Sep 2026, local noon

  it("is true on one old date, whichever source gave it", () => {
    expect(isEstablishedClient({ earliest: new Date(2014, 2, 1), prior: null }, now)).toBe(true);
    expect(isEstablishedClient({ earliest: new Date(2026, 5, 20), prior: null }, now)).toBe(true);
  });

  it("is false inside three months", () => {
    expect(isEstablishedClient({ earliest: new Date(2026, 7, 1), prior: null }, now)).toBe(false);
  });

  it("is true when somebody recorded sessions from before Journey", () => {
    expect(isEstablishedClient({ earliest: new Date(2026, 8, 1), prior: prior() }, now)).toBe(true);
    expect(isEstablishedClient({ earliest: null, prior: prior() }, now)).toBe(true);
  });

  it("says nothing when nothing is known", () => {
    expect(isEstablishedClient({ earliest: null, prior: null }, now)).toBe(false);
    expect(isEstablishedClient({ earliest: new Date("nope"), prior: null }, now)).toBe(false);
    expect(isEstablishedClient({ earliest: null, prior: prior({ sessions: 0 }) }, now)).toBe(false);
  });
});

describe("earliestKnownDate", () => {
  const ts = (iso: string) => ({ toDate: () => new Date(iso) });

  it("takes the oldest date on the record, not the highest-ranked", () => {
    // Her first Journey session is last month; Mindbody met her in 2014.
    const d = earliestKnownDate({
      firstSessionDate: ts("2026-08-20T15:00:00"),
      firstAppointmentDate: ts("2014-03-01T15:00:00"),
      createdAt: ts("2026-08-01T12:00:00"),
    });
    expect(d?.getFullYear()).toBe(2014);
  });

  it("counts a contract and Journey's own createdAt", () => {
    expect(
      earliestKnownDate({
        mindbodyContracts: { a: { startDate: ts("2019-05-01T12:00:00") } },
        createdAt: ts("2026-08-01T12:00:00"),
      })?.getFullYear(),
    ).toBe(2019);
    expect(earliestKnownDate({ createdAt: ts("2025-01-01T12:00:00") })?.getFullYear()).toBe(2025);
  });

  it("ignores placeholder epochs and is null on nothing", () => {
    expect(earliestKnownDate({ firstAppointmentDate: ts("1970-01-01T00:00:00Z") })).toBeNull();
    expect(earliestKnownDate({})).toBeNull();
    expect(earliestKnownDate(null)).toBeNull();
  });
});

describe("breaks - the part of the timeline Journey owns", () => {
  it("owns every day of a complete client's story", () => {
    const w = ownedWindow({ coverage: "complete", cutover: "2026-09-01" });
    expect(w).toEqual(WHOLE_STORY);
    expect(canClaimGap("2025-01-01", w)).toBe(true);
  });

  it("owns nothing when neither a cutover nor a prior record says when", () => {
    // Beta: FileMaker is still live, so a gap in Journey is not a gap in her visits.
    for (const c of NOT_COMPLETE) {
      const w = ownedWindow({ coverage: c });
      expect(w).toEqual(NO_WINDOW);
      expect(canClaimGap("2026-09-20", w)).toBe(false);
    }
  });

  it("owns the days from her studio's cutover", () => {
    const w = ownedWindow({ coverage: "partial", cutover: "2026-10-01" });
    expect(w.from).toBe("2026-10-01");
    expect(canClaimGap("2026-10-01", w)).toBe(true);
    expect(canClaimGap("2026-11-15", w)).toBe(true);
    expect(canClaimGap("2026-09-30", w)).toBe(false);
  });

  it("owns the days after her prior record runs through", () => {
    const w = ownedWindow({ coverage: "partial", prior: prior({ through: "2026-09-12" }) });
    expect(w.from).toBe("2026-09-13");
    expect(canClaimGap("2026-09-12", w)).toBe(false);
    expect(canClaimGap("2026-09-13", w)).toBe(true);
  });

  it("takes the LATER of the two, because both must hold", () => {
    expect(ownedWindow({ coverage: "partial", cutover: "2026-10-01", prior: prior({ through: "2026-09-12" }) }).from).toBe(
      "2026-10-01",
    );
    expect(ownedWindow({ coverage: "partial", cutover: "2026-09-01", prior: prior({ through: "2026-09-12" }) }).from).toBe(
      "2026-09-13",
    );
  });

  it("ignores a cutover that is not a studio day", () => {
    expect(ownedWindow({ coverage: "unknown", cutover: "Sept 1" })).toEqual(NO_WINDOW);
  });
});

describe("dayAfter", () => {
  it("rolls months, years and leap days in calendar arithmetic", () => {
    expect(dayAfter("2026-09-12")).toBe("2026-09-13");
    expect(dayAfter("2026-09-30")).toBe("2026-10-01");
    expect(dayAfter("2026-12-31")).toBe("2027-01-01");
    expect(dayAfter("2028-02-28")).toBe("2028-02-29");
  });

  it("is null for anything that is not a day key", () => {
    expect(dayAfter("")).toBeNull();
    expect(dayAfter("2026-9-1")).toBeNull();
  });
});
