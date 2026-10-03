import { describe, expect, it } from "vitest";
import { notesByPerson, oneToOneDraft, oneToOneReady, recordFor } from "./leader-notes";

describe("a leader's notes about someone on the team (Oct 3 2026)", () => {
  it("writes the Journal's own Team member note — private, nothing shared, nothing filed elsewhere", () => {
    const d = oneToOneDraft("  Ana Torres ", { what: " Late twice this week. ", next: "Ask about the school run on Friday." });
    expect(d).toMatchObject({
      title: "1:1 with Ana Torres",
      noteType: "team",
      kind: "note",
      share: false,
      teamShare: null,
      clientIds: [],
      fields: { who: "Ana Torres", what: "Late twice this week.", next: "Ask about the school run on Friday." },
    });
  });

  it("waits for words in one of the two lines", () => {
    expect(oneToOneReady({ what: "  ", next: "" })).toBe(false);
    expect(oneToOneReady({ what: "", next: "Check in Friday" })).toBe(true);
  });

  it("counts a leader's Team member notes by the person they are about, newest first, ignoring every other note", () => {
    const records = notesByPerson([
      { noteType: "team", fields: { who: "Ana Torres" }, updatedAt: new Date(2026, 8, 20) },
      { noteType: "team", fields: { who: "ana torres " }, updatedAt: new Date(2026, 8, 30) },
      { noteType: "team", fields: { who: "Lee Leader" }, updatedAt: { toDate: () => new Date(2026, 9, 1) } },
      { noteType: "client", fields: { who: "Ana Torres" }, updatedAt: new Date(2026, 9, 2) },
      { noteType: "team", fields: { who: "" }, updatedAt: new Date(2026, 9, 2) },
      { noteType: null, fields: null, updatedAt: null },
    ]);
    expect(recordFor(records, "Ana Torres")).toEqual({ count: 2, lastMs: new Date(2026, 8, 30).getTime() });
    expect(recordFor(records, "Lee Leader").count).toBe(1);
    expect(recordFor(records, "Sam Kim")).toEqual({ count: 0, lastMs: null });
  });
});
