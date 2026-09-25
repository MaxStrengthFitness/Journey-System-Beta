import { describe, expect, it } from "vitest";
import {
  COVERAGE_CAVEAT,
  NEVER_LABEL,
  canQuoteLifetime,
  historyCoverage,
  neverTriedPhrase,
  isPriorHistory,
  priorHistoryLabel,
  priorHistoryOf,
  priorUncounted,
  recordImportedSessions,
  statePriorHistory,
  totalSessions,
  type PriorHistory,
} from "./prior-history";

const base: PriorHistory = {
  sessions: 412,
  through: "2026-09-12",
  source: "filemaker",
};

describe("priorUncounted", () => {
  it("is the whole stated total when nothing has been imported", () => {
    expect(priorUncounted(base)).toBe(412);
    expect(priorUncounted({ ...base, importedCount: 0 })).toBe(412);
  });

  it("takes off what the import has already turned into real rows", () => {
    expect(priorUncounted({ ...base, importedCount: 50 })).toBe(362);
  });

  it("never goes negative when more was imported than was stated", () => {
    expect(priorUncounted({ ...base, importedCount: 500 })).toBe(0);
  });

  it("is zero without a record, and survives rubbish", () => {
    expect(priorUncounted(null)).toBe(0);
    expect(priorUncounted(undefined)).toBe(0);
    expect(priorUncounted({ ...base, sessions: NaN })).toBe(0);
  });
});

describe("totalSessions", () => {
  it("adds what Journey can see to what only exists as a number", () => {
    expect(totalSessions(6, base)).toBe(418);
  });

  it("is the Journey count alone for a genuinely new client", () => {
    expect(totalSessions(3, null)).toBe(3);
  });

  it("does not double-count an imported session", () => {
    // 50 of the 412 were imported: they are now rows, so Journey counts them.
    const imported = recordImportedSessions(base, 50);
    expect(totalSessions(56, imported)).toBe(56 + 362);
    expect(totalSessions(56, imported)).toBe(418); // same client, same answer
  });

  it("stays unknown when the Journey count could not be read", () => {
    expect(totalSessions(null, base)).toBeNull();
    expect(totalSessions(undefined, base)).toBeNull();
  });
});

describe("recordImportedSessions", () => {
  it("never moves the stated total", () => {
    const after = recordImportedSessions(base, 50);
    expect(after.sessions).toBe(412);
    expect(after.importedCount).toBe(50);
  });

  it("accumulates across runs and ignores rubbish", () => {
    let p = recordImportedSessions(base, 30);
    p = recordImportedSessions(p, 20);
    expect(p.importedCount).toBe(50);
    expect(recordImportedSessions(p, -5).importedCount).toBe(50);
    expect(recordImportedSessions(p, NaN).importedCount).toBe(50);
  });
});

describe("statePriorHistory — a person's edit, as the record", () => {
  const by = { id: "t-1", name: "Sam Lee" };

  it("writes what was stated, and who stated it", () => {
    const out = statePriorHistory(
      null,
      { sessions: 412, through: "2026-09-12", source: "filemaker", note: "  From the export  " },
      by,
    );
    expect(out).toEqual({
      sessions: 412,
      importedCount: 0,
      from: null,
      through: "2026-09-12",
      source: "filemaker",
      note: "From the export",
      recordedById: "t-1",
      recordedByName: "Sam Lee",
    });
    // What the screen reads back is a record it will quote.
    expect(isPriorHistory(out)).toBe(true);
  });

  it("keeps the importer's count, so re-stating the total never un-counts an import", () => {
    const existing = { ...recordImportedSessions(base, 50), from: "2014-03-01" };
    const out = statePriorHistory(existing, { sessions: 420, through: "2026-09-20", source: "paper" }, by);
    expect(out.importedCount).toBe(50);
    expect(out.from).toBe("2014-03-01");
    expect(out.sessions).toBe(420);
    expect(priorUncounted(out)).toBe(370);
  });

  it("never names the reconciler's field", () => {
    const out = statePriorHistory(base, { sessions: 12, through: "2026-09-12", source: "other" }, by);
    expect(out).not.toHaveProperty("sessionCount");
  });

  it("leaves nothing undefined for Firestore to refuse", () => {
    const out = statePriorHistory(
      { sessions: 3, through: "2026-01-01", source: "paper" },
      { sessions: 3, through: "2026-01-01", source: "paper", note: "   " },
      {},
    );
    expect(Object.values(out).some((v) => v === undefined)).toBe(false);
    expect(out.note).toBeNull();
    expect(out.recordedById).toBeNull();
    expect(out.recordedByName).toBeNull();
    expect(out.importedCount).toBe(0);
  });

  it("stores a whole, non-negative count whatever reaches it", () => {
    const stated = (n: number) =>
      statePriorHistory(null, { sessions: n, through: "2026-09-12", source: "other" }, by).sessions;
    expect(stated(12.7)).toBe(12);
    expect(stated(-4)).toBe(0);
    expect(stated(NaN)).toBe(0);
  });
});

describe("isPriorHistory / priorHistoryOf", () => {
  it("accepts a real record", () => {
    expect(isPriorHistory(base)).toBe(true);
    expect(priorHistoryOf({ priorHistory: base })).toEqual(base);
  });

  it("refuses anything that would put a wrong number on screen", () => {
    expect(isPriorHistory(null)).toBe(false);
    expect(isPriorHistory({ sessions: 5 })).toBe(false); // no through
    expect(isPriorHistory({ ...base, sessions: -1 })).toBe(false);
    expect(isPriorHistory({ ...base, source: "vibes" })).toBe(false);
    expect(priorHistoryOf({ priorHistory: { sessions: 5 } })).toBeNull();
    expect(priorHistoryOf(null)).toBeNull();
  });
});

describe("priorHistoryLabel", () => {
  it("names the count and where it came from", () => {
    expect(priorHistoryLabel(base)).toBe("412 before Journey · FileMaker");
  });

  it("says nothing once every prior session has been imported", () => {
    expect(priorHistoryLabel(recordImportedSessions(base, 412))).toBeNull();
    expect(priorHistoryLabel(null)).toBeNull();
  });
});

describe("historyCoverage", () => {
  it("is partial while any prior session is only a number", () => {
    expect(historyCoverage({ priorHistory: base })).toBe("partial");
    expect(COVERAGE_CAVEAT.partial).toBeTruthy();
  });

  it("is complete once the whole prior history is imported, or declared", () => {
    expect(historyCoverage({ priorHistory: recordImportedSessions(base, 412) })).toBe("complete");
    expect(historyCoverage({ historyIsComplete: true })).toBe("complete");
    expect(COVERAGE_CAVEAT.complete).toBeNull();
  });

  it("is UNKNOWN when nobody has said — the migration's dangerous case", () => {
    // Indistinguishable from a brand-new client, which is exactly why it has
    // its own state rather than defaulting to "complete".
    expect(historyCoverage({})).toBe("unknown");
    expect(historyCoverage(null)).toBe("unknown");
    expect(COVERAGE_CAVEAT.unknown).toBeTruthy();
  });
});

describe("historyCoverage against the studio's cutover", () => {
  const CUTOVER = "2027-09-18"; // the day that studio moved onto Journey

  it("is complete for a client whose first session is on or after the cutover", () => {
    expect(historyCoverage({ firstJourneyDay: "2027-09-18" }, CUTOVER)).toBe("complete");
    expect(historyCoverage({ firstJourneyDay: "2027-11-02" }, CUTOVER)).toBe("complete");
  });

  it("is partial for a client who was training before it", () => {
    expect(historyCoverage({ firstJourneyDay: "2027-06-01" }, CUTOVER)).toBe("partial");
  });

  it("stays unknown without a cutover, or without a first session", () => {
    expect(historyCoverage({ firstJourneyDay: "2027-06-01" }, null)).toBe("unknown");
    expect(historyCoverage({}, CUTOVER)).toBe("unknown");
  });

  it("lets an explicit prior record beat the date either way", () => {
    // Recorded history wins: a date cannot overrule someone who wrote it down.
    expect(historyCoverage({ priorHistory: base, firstJourneyDay: "2027-11-02" }, CUTOVER)).toBe("partial");
    expect(historyCoverage({ historyIsComplete: true, firstJourneyDay: "2020-01-01" }, CUTOVER)).toBe("complete");
  });
});

describe("the two things a screen may say about an unused machine", () => {
  it("only claims 'never attempted' when Journey holds the whole story", () => {
    expect(NEVER_LABEL.complete).toBe("Never attempted");
  });

  it("says 'nothing recorded' for partial AND unknown — they look identical", () => {
    // Machine history is not coming across from FileMaker, so a client may
    // have used it four hundred times. Never claim otherwise.
    expect(NEVER_LABEL.partial).toBe("Nothing recorded");
    expect(NEVER_LABEL.unknown).toBe("Nothing recorded");
  });

  it("quotes a lifetime figure only when it is one", () => {
    expect(canQuoteLifetime("complete")).toBe(true);
    expect(canQuoteLifetime("partial")).toBe(false);
    expect(canQuoteLifetime("unknown")).toBe(false);
  });

  it("reads as a sentence after the count, for every coverage", () => {
    expect(neverTriedPhrase(6, "complete")).toBe("studio machines never attempted");
    expect(neverTriedPhrase(1, "complete")).toBe("studio machine never attempted");
    expect(neverTriedPhrase(6, "partial")).toBe("studio machines with nothing recorded");
    expect(neverTriedPhrase(1, "unknown")).toBe("studio machine with nothing recorded");
  });

  it("never says 'never attempted' unless Journey holds the whole story", () => {
    expect(neverTriedPhrase(3, "partial")).not.toMatch(/never attempted/);
    expect(neverTriedPhrase(3, "unknown")).not.toMatch(/never attempted/);
  });
});
