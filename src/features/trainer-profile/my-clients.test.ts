import { describe, expect, it } from "vitest";
import type { Client } from "../../types";
import {
  MY_CLIENTS_SHOWN,
  WHAT_MY_CLIENTS_COUNTS,
  coachedLately,
  lastSessionSentence,
  myClientRows,
  myClientsCutoverLine,
  noClientsSentence,
  sessionsWithYou,
  sessionsWithYouSentence,
  shortDate,
} from "./my-clients";

const TODAY = "2026-09-30";

function client(id: string, over: Record<string, unknown> = {}): Client {
  return {
    id,
    firstName: id[0].toUpperCase() + id.slice(1),
    lastName: "Smith",
    homeStudioId: "westlake",
    isActive: true,
    height: "",
    ...over,
  } as unknown as Client;
}

const base = { studioId: "westlake", ids: ["t1"], rosterIds: new Set<string>(), cutover: null, today: TODAY };

describe("who is listed", () => {
  it("lists home clients you have trained or coached lately, and nobody else", () => {
    const rows = myClientRows(
      [
        client("ann", { trainerTally: { t1: 4 } }),
        client("bea", { trainerTally: { t2: 9 } }), // someone else's
        client("cal", { trainerTally: { t1: 3 }, homeStudioId: "solon" }), // a visitor from Solon
        client("dee", { trainerTally: { t1: 5 }, isActive: false }), // inactive
        client("eve", { renewal: { coachIds: ["t1"] } }), // coached lately, no tally yet
        client("fay"), // nobody's
      ],
      base,
    );
    expect(rows.map((r) => r.clientId)).toEqual(["eve", "ann"]);
  });

  it("reads an older client's home from studioId when homeStudioId is missing", () => {
    const rows = myClientRows([client("gus", { homeStudioId: "", studioId: "westlake", trainerTally: { t1: 1 } })], base);
    expect(rows).toHaveLength(1);
  });
});

describe("sessions with you", () => {
  it("adds up the tally under every id you have carried, and never an initials-only import", () => {
    const c = client("ann", { trainerTally: { t1: 4, "old.id": 3, uid9: 2, "initials:SK": 7 } });
    // "old.id" is stored as "old_id": a dot can't be in a field path.
    expect(sessionsWithYou({ trainerTally: { t1: 4, old_id: 3, uid9: 2, "initials:SK": 7 } }, ["t1", "old.id", "uid9"])).toBe(9);
    expect(sessionsWithYou(c, ["t1"])).toBe(4);
    expect(sessionsWithYou({ trainerTally: { t1: 4 } }, ["t1", "t1"])).toBe(4);
    expect(sessionsWithYou({}, ["t1"])).toBe(0);
  });

  it("knows coached lately from the nightly snapshot, under any of your ids", () => {
    expect(coachedLately(client("a", { renewal: { coachIds: ["old"] } }), ["t1", "old"])).toBe(true);
    expect(coachedLately(client("a", { renewal: { coachIds: ["t2"] } }), ["t1"])).toBe(false);
    expect(coachedLately(client("a"), ["t1"])).toBe(false);
  });

  it("says the count in Journey's words", () => {
    expect(sessionsWithYouSentence(42)).toBe("42 sessions with you in Journey");
    expect(sessionsWithYouSentence(1)).toBe("1 session with you in Journey");
    expect(sessionsWithYouSentence(0)).toBe("No sessions with you on record in Journey");
  });
});

describe("the order", () => {
  it("puts coached lately first, most sessions with you first, then by name", () => {
    const rows = myClientRows(
      [
        client("zed", { trainerTally: { t1: 50 } }),
        client("amy", { trainerTally: { t1: 2 }, renewal: { coachIds: ["t1"] } }),
        client("bob", { trainerTally: { t1: 9 }, renewal: { coachIds: ["t1"] } }),
        client("abe", { trainerTally: { t1: 9 }, renewal: { coachIds: ["t1"] } }),
        client("kim", { trainerTally: { t1: 12 } }),
      ],
      base,
    );
    expect(rows.map((r) => [r.clientId, r.coachedLately, r.sessions])).toEqual([
      ["abe", true, 9],
      ["bob", true, 9],
      ["amy", true, 2],
      ["zed", false, 50],
      ["kim", false, 12],
    ]);
  });

  it("shows twelve before Show all", () => {
    expect(MY_CLIENTS_SHOWN).toBe(12);
  });

  it("marks the clients on your Kaizen Roster", () => {
    const rows = myClientRows([client("ann", { trainerTally: { t1: 1 } }), client("bea", { trainerTally: { t1: 1 } })], {
      ...base,
      rosterIds: new Set(["bea"]),
    });
    expect(rows.find((r) => r.clientId === "bea")?.onRoster).toBe(true);
    expect(rows.find((r) => r.clientId === "ann")?.onRoster).toBe(false);
  });
});

describe("the last session, through history-claims", () => {
  it("says Last in Journey while her home studio has no cutover and her story isn't known whole", () => {
    expect(lastSessionSentence(client("a", { lastSessionDate: "2026-09-25" }), null, TODAY)).toBe("Last in Journey, with any trainer: Sep 25");
  });

  it("says Last session when Journey holds her whole story", () => {
    expect(lastSessionSentence(client("a", { lastSessionDate: "2026-09-25", historyIsComplete: true }), null, TODAY)).toBe(
      "Last session, with any trainer: Sep 25",
    );
  });

  it("says Last session for a long-standing client once her studio moved onto Journey before it", () => {
    const c = client("a", {
      lastSessionDate: "2026-09-25",
      priorHistory: { sessions: 300, through: "2026-08-31", source: "filemaker" },
    });
    expect(lastSessionSentence(c, "2026-09-01", TODAY)).toBe("Last session, with any trainer: Sep 25");
    // Before the cutover, Journey doesn't own the days after it.
    expect(lastSessionSentence(c, "2026-09-28", TODAY)).toBe("Last in Journey, with any trainer: Sep 25");
  });

  it("names the year when it isn't this one, and quotes nothing it can't read", () => {
    expect(lastSessionSentence(client("a", { lastSessionDate: "2025-12-02" }), null, TODAY)).toBe("Last in Journey, with any trainer: Dec 2, 2025");
    expect(lastSessionSentence(client("a", { lastSessionDate: "2026-09-25T14:00:00" }), null, TODAY)).toBe("Last in Journey, with any trainer: Sep 25");
    expect(lastSessionSentence(client("a", { lastSessionDate: "2026-10-09" }), null, TODAY)).toBeNull(); // after today
    expect(lastSessionSentence(client("a", { lastSessionDate: "soon" }), null, TODAY)).toBeNull();
    expect(lastSessionSentence(client("a"), null, TODAY)).toBeNull();
    expect(shortDate("2026-01-05", TODAY)).toBe("Jan 5");
  });
});

describe("the card's words", () => {
  it("says what it counts, and that the studio is still moving off FileMaker until its cutover comes", () => {
    expect(WHAT_MY_CLIENTS_COUNTS).toContain("Sessions with you on record in Journey.");
    expect(WHAT_MY_CLIENTS_COUNTS).not.toMatch(/all time|since/i);
    const line = "Westlake is still moving off FileMaker, so older sessions may be missing.";
    expect(myClientsCutoverLine("Westlake", null, TODAY)).toBe(line);
    // A cutover set ahead of time: FileMaker is still the live system.
    expect(myClientsCutoverLine("Westlake", "2026-10-01", TODAY)).toBe(line);
    // From the cutover day on, the line goes.
    expect(myClientsCutoverLine("Westlake", "2026-09-30", TODAY)).toBeNull();
    expect(myClientsCutoverLine("Westlake", "2026-09-01", TODAY)).toBeNull();
    expect(myClientsCutoverLine("Westlake", "not a date", TODAY)).toBe(line);
    expect(noClientsSentence("Westlake")).toBe("No clients at Westlake have sessions with you on record in Journey yet.");
  });
});
