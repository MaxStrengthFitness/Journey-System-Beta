import { describe, expect, it } from "vitest";
import { IMRAHIL, IORETH, TODAY } from "./fixtures";
import {
  ASK_TILES,
  askDirty,
  askGoesTo,
  askProblems,
  askTitle,
  blankAsk,
  flagNote,
  ringsABell,
  toAskRequest,
} from "./ask";

const ctx = { studioId: "s1", author: IORETH, todayKey: TODAY, canLead: false };
const hamfast = { id: "c-hamfast", name: "Hamfast Gamgee" };

describe("the six tiles", () => {
  it("are the blueprint's, in its order", () => {
    expect(ASK_TILES.map((t) => t.label)).toEqual(["Cover me", "A hand on the floor", "Hand this off", "A question", "Something's broken", "Other"]);
  });
});

describe("Cover me", () => {
  it("says the session's time in the title's words, and keeps it: the ask comes down when the session starts", () => {
    const d = blankAsk({ tile: "cover", client: hamfast, time: "16:00", estMinutes: 30, text: "Starts on the Leg Press; his knee is sore today." });
    const r = toAskRequest(d, ctx);
    const at = Date.parse(`${TODAY}T16:00:00-04:00`);
    expect(r).toMatchObject({
      kind: "cover",
      title: "Cover Hamfast Gamgee at 4:00 PM",
      detail: "Starts on the Leg Press; his knee is sore today.",
      clientId: "c-hamfast",
      sessionDate: TODAY,
      dueOn: TODAY,
      estMinutes: 30,
      priority: "urgent",
      coverAt: at,
      expiresAtMs: at,
    });
    expect(Object.keys(r)).not.toContain("time");
    expect(Object.keys(r)).not.toContain("expiry");
  });

  it("names another day, keeps its time, and stands until then", () => {
    const r = toAskRequest(blankAsk({ tile: "cover", client: hamfast, date: "2026-10-01", time: "09:30" }), ctx);
    expect(r.title).toBe("Cover Hamfast Gamgee on Thursday at 9:30 AM");
    expect(r).toMatchObject({ sessionDate: "2026-10-01", coverAt: Date.parse("2026-10-01T09:30:00-04:00") });
  });

  it("with no time, keeps none, and a cover for today ends with the studio's day as before", () => {
    const r = toAskRequest(blankAsk({ tile: "cover", client: hamfast }), ctx);
    expect(r).toMatchObject({ sessionDate: TODAY, expiry: "today" });
    expect(r).not.toHaveProperty("coverAt");
    expect(toAskRequest(blankAsk({ tile: "cover", client: hamfast, date: "2026-10-01" }), ctx)).toMatchObject({ expiry: "none" });
  });

  it("needs the client or a few words", () => {
    expect(askProblems(blankAsk({ tile: "cover" })).map((p) => p.field)).toEqual(["client"]);
    expect(askProblems(blankAsk({ tile: "cover", text: "my 4:00" }))).toEqual([]);
    expect(askTitle(blankAsk({ tile: "cover", text: "my 4:00" }), TODAY)).toBe("Cover: my 4:00");
  });
});

describe("A hand on the floor", () => {
  it("says when and where, and is gone at the end of the day", () => {
    expect(toAskRequest(blankAsk({ tile: "hand", machineId: "lp", machineName: "Leg Press", text: "A second person for a transfer." }), ctx)).toMatchObject({
      kind: "help",
      title: "A hand now at the Leg Press",
      detail: "A second person for a transfer.",
      machineId: "lp",
      expiry: "today",
    });
    expect(askTitle(blankAsk({ tile: "hand", when: "at", time: "17:00" }), TODAY)).toBe("A hand at 5:00 PM on the floor");
    expect(askProblems(blankAsk({ tile: "hand" }))).toEqual([]);
  });
});

describe("Hand this off (AJ, q5)", () => {
  it("is an offer on the board from a trainer, even with a name picked", () => {
    const d = blankAsk({ tile: "handoff", text: "Hugo Bracegirdle's progress report\nThe InBody numbers are in.", person: { id: IMRAHIL.id, name: IMRAHIL.name } });
    const r = toAskRequest(d, ctx);
    expect(r).toMatchObject({ kind: "todo", title: "Hugo Bracegirdle's progress report", detail: "The InBody numbers are in." });
    expect(r.forId).toBeUndefined();
    expect(askGoesTo(d, { studioName: "Westlake", canLead: false })).toBe("The Board at Westlake, under Help a teammate, as an offer anyone can take.");
    expect(ringsABell(d, false)).toBe(false);
  });

  it("arrives already the person's from a leader, with their bell rung once", () => {
    const d = blankAsk({ tile: "handoff", text: "Plan tomorrow", person: { id: IMRAHIL.id, name: IMRAHIL.name } });
    expect(toAskRequest(d, { ...ctx, canLead: true })).toMatchObject({ kind: "handoff", forId: IMRAHIL.id, forName: IMRAHIL.name });
    expect(askGoesTo(d, { studioName: "Westlake", canLead: true })).toContain("Imrahil's list, under Handed to you");
    expect(ringsABell(d, true)).toBe(true);
  });
});

describe("A question", () => {
  it("goes to the team, and about a client says it opens her thread", () => {
    const d = blankAsk({ tile: "question", text: "Nancy isn't feeling her seated dip\nCan anyone help?", client: { id: "c-nancy", name: "Nancy Took" } });
    expect(toAskRequest(d, ctx)).toMatchObject({ kind: "question", title: "Nancy isn't feeling her seated dip", detail: "Can anyone help?", clientId: "c-nancy", priority: "low" });
    expect(askGoesTo(d, { studioName: "Westlake", canLead: false })).toBe(
      "Everyone at Westlake, under Help a teammate. It opens a thread on Nancy's record: her next briefing reads it out while it's open, and the answer stays there.",
    );
  });

  it("needs the question", () => {
    expect(askProblems(blankAsk({ tile: "question" })).map((p) => p.message)).toEqual(["Ask your question first."]);
  });
});

describe("Something's broken", () => {
  it("needs the machine and what's wrong, and says in words whether it can be used", () => {
    expect(askProblems(blankAsk({ tile: "broken" })).map((p) => p.field)).toEqual(["machine", "text"]);
    expect(flagNote(blankAsk({ tile: "broken", text: "The seat catch slips on notch 4." }))).toBe("The seat catch slips on notch 4.");
    expect(flagNote(blankAsk({ tile: "broken", text: "The seat catch slips on notch 4.", usable: false }))).toBe(
      "Don't use it until it's fixed. The seat catch slips on notch 4.",
    );
    expect(askGoesTo(blankAsk({ tile: "broken", machineName: "Leg Press" }), { studioName: "Westlake", canLead: false, leaderName: "Glorfindel Elf" })).toBe(
      "The Floor Map, flagged on the Leg Press, and Glorfindel's bell.",
    );
  });
});

describe("the leave warning", () => {
  it("protects typing and picks, never a bare tile", () => {
    expect(askDirty(blankAsk({ tile: "question" }))).toBe(false);
    expect(askDirty(blankAsk({ tile: "question", text: "Who has the spare pin?" }))).toBe(true);
    expect(askDirty(blankAsk({ tile: "cover", client: hamfast }))).toBe(true);
  });
});
