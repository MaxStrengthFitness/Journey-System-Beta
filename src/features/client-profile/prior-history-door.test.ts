import { describe, expect, it } from "vitest";
import type { Trainer } from "../../types";
import { recordImportedSessions, type PriorHistory } from "../../lib/prior-history";
import {
  canEditPriorHistory,
  draftFromPrior,
  priorHistoryDoorText,
  readPriorHistoryDraft,
  recordedByLine,
  ruleStudioIdOf,
  statementChangesRecord,
  type PriorHistoryDraft,
} from "./prior-history-door";

const trainer = (over: Partial<Trainer>): Trainer =>
  ({
    id: "t-1",
    role: "LifeTransformer",
    primaryHomeStudioId: "solon",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    ownedStudioIds: [],
    ...over,
  }) as Trainer;

const solonClient = { homeStudioId: "solon" };

describe("canEditPriorHistory — the clients/{id} update rule, mirrored", () => {
  it("lets a trainer at the client's home studio edit", () => {
    expect(canEditPriorHistory(trainer({}), solonClient)).toBe(true);
    expect(canEditPriorHistory(trainer({ primaryHomeStudioId: "westlake", accessibleStudioIds: ["solon"] }), solonClient)).toBe(true);
    expect(canEditPriorHistory(trainer({ primaryHomeStudioId: "westlake", activeGuestStudioIds: ["solon"] }), solonClient)).toBe(true);
  });

  it("lets the studio's leaders, the grant and administrators edit", () => {
    expect(canEditPriorHistory(trainer({ role: "StudioLeader", primaryHomeStudioId: "westlake", ownedStudioIds: ["solon"] }), solonClient)).toBe(true);
    expect(canEditPriorHistory(trainer({ primaryHomeStudioId: "westlake", managedStudioIds: ["solon"] }), solonClient)).toBe(true);
    for (const role of ["Admin", "Founder", "Overseer"] as const) {
      expect(canEditPriorHistory(trainer({ role, primaryHomeStudioId: "" }), solonClient)).toBe(true);
    }
  });

  it("reads only, for anyone the rule refuses", () => {
    // A cross-train trainer can open the profile but not write the client.
    expect(canEditPriorHistory(trainer({ primaryHomeStudioId: "westlake" }), solonClient)).toBe(false);
    // The clients update rule has no franchise-role clause: only the studios
    // on their own lists.
    expect(canEditPriorHistory(trainer({ role: "FranchiseOwner", primaryHomeStudioId: "westlake" }), solonClient)).toBe(false);
    expect(canEditPriorHistory(trainer({ role: "Owner", primaryHomeStudioId: "westlake" }), solonClient)).toBe(false);
    expect(canEditPriorHistory(null, solonClient)).toBe(false);
    expect(canEditPriorHistory(undefined, solonClient)).toBe(false);
  });

  it("gives everyone the run of Demo Mode", () => {
    expect(canEditPriorHistory(trainer({ primaryHomeStudioId: "westlake" }), { homeStudioId: "demo-studio" })).toBe(true);
  });

  it("reads the home studio the way the rule does", () => {
    expect(ruleStudioIdOf({ homeStudioId: "solon", studioId: "westlake" })).toBe("solon");
    // An older client with only `studioId`.
    expect(ruleStudioIdOf({ studioId: "solon" })).toBe("solon");
    expect(canEditPriorHistory(trainer({}), { studioId: "solon" })).toBe(true);
    // A home that is there but empty is what the rule sees — and refuses.
    expect(ruleStudioIdOf({ homeStudioId: "", studioId: "solon" })).toBeNull();
    expect(ruleStudioIdOf({ homeStudioId: null, studioId: "solon" })).toBeNull();
    expect(canEditPriorHistory(trainer({}), { homeStudioId: "", studioId: "solon" })).toBe(false);
    expect(ruleStudioIdOf(null)).toBeNull();
  });
});

const record: PriorHistory = { sessions: 412, through: "2026-09-12", source: "filemaker" };

describe("priorHistoryDoorText", () => {
  it("quotes the record to everyone who can see the profile", () => {
    expect(priorHistoryDoorText(record, true)).toBe("412 before Journey · FileMaker");
    expect(priorHistoryDoorText(record, false)).toBe("412 before Journey · FileMaker");
  });

  it("offers to add one only to someone who can write it", () => {
    expect(priorHistoryDoorText(null, true)).toBe("Add sessions before Journey");
    expect(priorHistoryDoorText(null, false)).toBeNull();
    expect(priorHistoryDoorText(undefined, false)).toBeNull();
  });

  it("still has a door when nothing is left only as a number", () => {
    expect(priorHistoryDoorText({ ...record, sessions: 0 }, false)).toBe("None before Journey");
    expect(priorHistoryDoorText(recordImportedSessions(record, 412), true)).toBe("412 before Journey · all imported");
  });
});

describe("the editor's form", () => {
  const today = "2026-09-24";
  const draft = (over: Partial<PriorHistoryDraft> = {}): PriorHistoryDraft => ({
    sessions: "412",
    source: "filemaker",
    through: "2026-09-12",
    note: "",
    ...over,
  });

  it("opens seeded from the record, so an edit is a correction", () => {
    expect(draftFromPrior({ ...record, note: "From the export" }, today)).toEqual({
      sessions: "412",
      source: "filemaker",
      through: "2026-09-12",
      note: "From the export",
    });
  });

  it("opens blank, counted up to today, for a client with no record", () => {
    expect(draftFromPrior(null, today)).toEqual({ sessions: "", source: "filemaker", through: today, note: "" });
  });

  it("reads a whole number as a statement", () => {
    const r = readPriorHistoryDraft(draft({ sessions: " 412 ", note: "  paper cards  " }), today);
    expect(r).toEqual({
      ok: true,
      statement: { sessions: 412, through: "2026-09-12", source: "filemaker", note: "paper cards" },
    });
    // Zero is a statement: the client started here.
    expect(readPriorHistoryDraft(draft({ sessions: "0" }), today).ok).toBe(true);
  });

  it("says why anything else is not one, and says nothing before anything is typed", () => {
    expect(readPriorHistoryDraft(draft({ sessions: "" }), today)).toEqual({ ok: false, problem: null });
    expect(readPriorHistoryDraft(draft({ sessions: "   " }), today)).toEqual({ ok: false, problem: null });
    for (const typed of ["4.5", "-3", "1e3", "abc"]) {
      expect(readPriorHistoryDraft(draft({ sessions: typed }), today)).toEqual({
        ok: false,
        problem: "Enter a whole number of sessions.",
      });
    }
  });

  it("counts up to today when the date is cleared", () => {
    const r = readPriorHistoryDraft(draft({ through: "" }), today);
    expect(r.ok && r.statement.through).toBe(today);
  });

  it("offers Save only when the record would change", () => {
    const read = (over: Partial<PriorHistoryDraft>) => {
      const r = readPriorHistoryDraft(draft(over), today);
      if (!r.ok) throw new Error("expected a statement");
      return r.statement;
    };
    expect(statementChangesRecord(read({}), null)).toBe(true);
    expect(statementChangesRecord(read({}), record)).toBe(false);
    expect(statementChangesRecord(read({ note: "   " }), { ...record, note: null })).toBe(false);
    expect(statementChangesRecord(read({ sessions: "413" }), record)).toBe(true);
    expect(statementChangesRecord(read({ source: "paper" }), record)).toBe(true);
    expect(statementChangesRecord(read({ through: "2026-09-13" }), record)).toBe(true);
    expect(statementChangesRecord(read({ note: "From the export" }), record)).toBe(true);
  });
});

describe("recordedByLine", () => {
  it("names who said so, and when", () => {
    const at = { toDate: () => new Date("2026-09-12T16:00:00Z") };
    expect(recordedByLine({ ...record, recordedByName: "Sam Lee", recordedAt: at })).toBe("Recorded by Sam Lee · Sep 12, 2026");
  });

  it("names them alone while the server's timestamp is pending", () => {
    expect(recordedByLine({ ...record, recordedByName: "Sam Lee", recordedAt: null })).toBe("Recorded by Sam Lee");
  });

  it("says nothing it does not know", () => {
    expect(recordedByLine(record)).toBeNull();
    expect(recordedByLine({ ...record, recordedByName: "  " })).toBeNull();
    expect(recordedByLine(null)).toBeNull();
  });
});
