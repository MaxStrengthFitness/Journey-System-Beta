import { describe, expect, it } from "vitest";
import type { Client } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import { pendingAcks } from "../attention/attention";
import { TEAM_NOTES_WINDOW_DAYS, TEAM_NOTE_KINDS, teamNotesQuestion } from "./team-notes";
import firestoreIndexes from "../../../../firestore.indexes.json";

const TODAY = "2026-10-03";
const at = (day: string, hour = 10) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, hour);
};

let seq = 0;
function entry(over: Partial<JournalEntry>): JournalEntry {
  seq += 1;
  return {
    id: `n${seq}`,
    clientId: "c1",
    studioId: "s1",
    kind: "injury",
    category: null,
    body: "Knee sore after the move.",
    importance: "elevated",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "in_session",
    authorId: "t1",
    authorInitials: "JC",
    authorName: "Jess Coach",
    occurredAt: at("2026-10-02"),
    createdAt: at("2026-10-02"),
    updatedAt: at("2026-10-02"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  };
}

const clients = [{ id: "c1", firstName: "Ruth", lastName: "Ames" } as Client];

describe("from the team's notes — what a leader can't afford to miss (Oct 3 2026)", () => {
  it("lists Health, Incident and Retention whatever their loudness, newest first, and nothing else", () => {
    const q = teamNotesQuestion({
      entries: [
        entry({ id: "h", kind: "injury", category: "Surgery", importance: "standard", createdAt: at("2026-09-30") }),
        entry({ id: "i", kind: "incident", bodyParts: [{ part: "knee", side: "left" }], createdAt: at("2026-10-02") }),
        entry({ id: "r", kind: "retention", body: "Not sure about May.", createdAt: at("2026-10-01") }),
        entry({ id: "c", kind: "coaching" }),
        entry({ id: "p", kind: "preference" }),
        entry({ id: "g", kind: "general" }),
      ],
      clients,
      today: TODAY,
    });
    expect(q.rows.map((r) => r.entryId)).toEqual(["i", "r", "h"]);
    expect(q.rows.map((r) => r.badge)).toEqual(["Incident", "Retention", "Health"]);
    expect(q.rows[0]).toMatchObject({
      name: "Ruth Ames",
      tone: "alert",
      ackKeys: ["note:team:i"],
      sentence: "Incident from Jess, 2026-10-02: Knee sore after the move.",
    });
    expect(q.rows[0].proof).toContain("Left knee.");
    expect(q.rows[0].proof).toContain("next four sessions");
    expect(q.rows[2].sentence).toContain("Health · Surgery from Jess");
    expect(q.rows[2].proof).toContain("Filed at Note");
  });

  it("leaves out a Critical note (already the pain row), a closed or archived one, an update and an import", () => {
    const q = teamNotesQuestion({
      entries: [
        entry({ id: "crit", importance: "critical" }),
        entry({ id: "closed", resolvedAt: at("2026-10-02", 12) }),
        entry({ id: "arch", isArchived: true }),
        entry({ id: "upd", threadId: "root" }),
        entry({ id: "imp", isLegacy: true, origin: "profile" }),
        entry({ id: "ok" }),
      ],
      clients,
      today: TODAY,
    });
    expect(q.rows.map((r) => r.entryId)).toEqual(["ok"]);
  });

  it("looks back two weeks by when it was written, even when it is dated earlier", () => {
    expect(TEAM_NOTES_WINDOW_DAYS).toBe(14);
    const q = teamNotesQuestion({
      entries: [
        entry({ id: "old", createdAt: at("2026-09-18"), occurredAt: at("2026-09-18") }),
        entry({ id: "edge", createdAt: at("2026-09-19"), occurredAt: at("2026-09-19") }),
        // "Surgery was on the 14th", written yesterday: it is news now.
        entry({ id: "backdated", createdAt: at("2026-10-02"), occurredAt: at("2026-08-14") }),
      ],
      clients,
      today: TODAY,
    });
    expect(q.rows.map((r) => r.entryId).sort()).toEqual(["backdated", "edge"]);
  });

  it("Seen is the acknowledgement: it takes the row off the list and nothing else", () => {
    const q = teamNotesQuestion({ entries: [entry({ id: "a" }), entry({ id: "b" })], clients, today: TODAY });
    const { pending, acknowledged } = pendingAcks(q.rows, new Set(["note:team:a"]));
    // The Critical row's own key does not clear a team note, and the other way round.
    expect(pendingAcks(q.rows, new Set(["note:a", "note:b"])).acknowledged).toBe(0);
    expect(pending.map((r) => r.entryId)).toEqual(["b"]);
    expect(acknowledged).toBe(1);
  });

  it("ships with its index: studioId, kind, createdAt", () => {
    expect([...TEAM_NOTE_KINDS]).toEqual(["injury", "incident", "retention"]);
    const has = (firestoreIndexes as { indexes: { collectionGroup: string; fields: { fieldPath: string; order?: string }[] }[] }).indexes.some(
      (i) =>
        i.collectionGroup === "journalEntries" &&
        i.fields.map((f) => `${f.fieldPath}:${f.order}`).join(",") === "studioId:ASCENDING,kind:ASCENDING,createdAt:DESCENDING",
    );
    expect(has).toBe(true);
  });
});
