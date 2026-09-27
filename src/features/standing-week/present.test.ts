import { describe, expect, it } from "vitest";
import { awayLabel, clockChoices, daysOf, defaultHours, formOf, myWeekSentence, outsideHours, rangeLabel, teamWeekSentence, tidyForm, weekChanges, weekOfForm, worksAt } from "./present";
import type { StandingWeek, StandingWeekDoc } from "./week";

/** What a standing week says on screen (voice-review round, Sep 27 2026). */

const TZ = "America/New_York";
const judyMon = { id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
const bobMon = { id: "r2", weekday: 1, start: "09:00", clientId: "c-bob", clientName: "Bob Jones" };
const week = (over: Partial<StandingWeek> = {}): StandingWeek => ({
  hours: [{ weekday: 1, from: "07:00", to: "13:00" }],
  regulars: [judyMon, bobMon],
  ...over,
});
const doc = (over: Partial<StandingWeekDoc> = {}): StandingWeekDoc => ({
  id: "uid-sam",
  studioId: "solon",
  trainerUid: "uid-sam",
  trainerId: "t-sam",
  trainerName: "Sam Lee",
  proposed: week(),
  proposedAt: new Date("2026-09-29T14:00:00Z"),
  proposedBy: { id: "uid-sam", name: "Sam Lee" },
  final: week(),
  finalAt: new Date("2026-09-28T14:00:00Z"),
  finalBy: { id: "uid-pat", name: "Pat Doe" },
  ...over,
});

describe("the editor's clock", () => {
  it("offers every quarter hour from 5:00 AM to 9:45 PM", () => {
    const all = clockChoices();
    expect(all[0]).toBe("05:00");
    expect(all[all.length - 1]).toBe("21:45");
    expect(all).toHaveLength(68);
  });

  it("offers an end only after the start, and keeps a time already in the week", () => {
    expect(clockChoices({ after: "21:00" })).toEqual(["21:15", "21:30", "21:45"]);
    expect(clockChoices({ keep: "08:10" })).toContain("08:10");
    expect(clockChoices({ keep: "08:10" }).indexOf("08:10")).toBe(clockChoices({ keep: "08:10" }).indexOf("08:00") + 1);
  });

  it("says a range the way the studio does", () => {
    expect(rangeLabel({ from: "07:00", to: "13:00" })).toBe("7:00 AM – 1:00 PM");
  });
});

describe("a week laid out", () => {
  it("runs Monday to Sunday, each day with its hours and regulars", () => {
    const days = daysOf(week());
    expect(days.map((d) => d.name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(days[0].regulars.map((r) => r.clientName)).toEqual(["Judy Smith", "Bob Jones"]);
    expect(days[1].hours).toEqual([]);
  });

  it("notices a regular outside the day's hours, and says nothing for a day with none", () => {
    expect(outsideHours(week(), judyMon)).toBe(false);
    expect(outsideHours(week(), { ...judyMon, start: "13:00" })).toBe(true);
    expect(outsideHours(week(), { ...judyMon, weekday: 2 })).toBe(false);
  });
});

describe("the editor's form", () => {
  it("holds the note as a string, and gives it back to the week only when there is one", () => {
    expect(formOf(null)).toEqual({ hours: [], regulars: [], note: "" });
    expect(formOf(week({ note: "Mornings" })).note).toBe("Mornings");
    expect(weekOfForm({ ...formOf(week()), note: "  " })).not.toHaveProperty("note");
  });

  it("keeps the week's own order after an edit", () => {
    const f = tidyForm({ hours: [], regulars: [bobMon, judyMon], note: "x " });
    expect(f.regulars.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(f.note).toBe("x ");
  });

  it("starts new hours from the day before, or after the day's first range", () => {
    const w = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }] };
    expect(defaultHours({ hours: [] }, 1)).toEqual({ weekday: 1, from: "07:00", to: "13:00" });
    expect(defaultHours(w, 3)).toEqual({ weekday: 3, from: "07:00", to: "13:00" });
    expect(defaultHours(w, 1)).toEqual({ weekday: 1, from: "14:00", to: "18:00" });
    expect(defaultHours({ hours: [{ weekday: 1, from: "07:00", to: "21:30" }] }, 1)).toEqual({ weekday: 1, from: "21:30", to: "21:45" });
  });
});

describe("who works at the studio", () => {
  it("is home, also works at, or a guest there — and everyone at the Demo studio", () => {
    const t = { primaryHomeStudioId: "solon", accessibleStudioIds: ["westlake"], activeGuestStudioIds: ["willoughby"] };
    expect(worksAt(t, "solon")).toBe(true);
    expect(worksAt(t, "westlake")).toBe(true);
    expect(worksAt(t, "willoughby")).toBe(true);
    expect(worksAt(t, "strongsville")).toBe(false);
    expect(worksAt(t, "demo-studio")).toBe(true);
    expect(worksAt(null, "solon")).toBe(false);
  });
});

describe("where a week stands, in a sentence", () => {
  it("speaks to the trainer about their own week", () => {
    expect(myWeekSentence(null, TZ)).toBe("Not proposed yet.");
    expect(myWeekSentence(doc({ final: null, finalAt: null, finalBy: null }), TZ)).toBe("Proposed on Sep 29. Waiting for a studio leader to agree it.");
    expect(myWeekSentence(doc(), TZ)).toBe("Agreed by Pat Doe on Sep 28.");
    expect(myWeekSentence(doc({ proposed: week({ regulars: [judyMon] }) }), TZ)).toBe(
      "Agreed by Pat Doe on Sep 28. You proposed a change on Sep 29; it's waiting for a studio leader.",
    );
  });

  it("speaks to a leader about a person", () => {
    expect(teamWeekSentence(null, "Sam Lee", TZ)).toBe("Sam hasn't proposed a standing week here.");
    expect(teamWeekSentence(doc({ final: null }), "Sam Lee", TZ)).toBe("Sam proposed a week on Sep 29. Not agreed yet.");
    expect(teamWeekSentence(doc({ proposed: week({ regulars: [judyMon] }) }), "Sam Lee", TZ)).toBe(
      "Agreed by Pat Doe on Sep 28. Sam proposed a change on Sep 29.",
    );
  });

  it("leaves out a date it doesn't have rather than guessing one", () => {
    expect(myWeekSentence(doc({ final: null, proposedAt: null }), TZ)).toBe("Proposed. Waiting for a studio leader to agree it.");
  });
});

describe("what a proposal changes", () => {
  it("says nothing of a first proposal, or of a week that didn't change", () => {
    expect(weekChanges(null, week())).toEqual([]);
    expect(weekChanges(week(), week({ regulars: [{ ...bobMon, id: "x" }, { ...judyMon, id: "y" }] }))).toEqual([]);
  });

  it("names each change, Monday first: hours, then regulars, then the note", () => {
    const from = week();
    const to: StandingWeek = {
      hours: [
        { weekday: 1, from: "06:00", to: "12:00" },
        { weekday: 5, from: "07:00", to: "11:00" },
      ],
      regulars: [
        { ...judyMon, start: "09:30", weekday: 2 },
        { id: "r9", weekday: 5, start: "08:00", clientId: "c-ann", clientName: "Ann Park" },
      ],
      note: "Back from vacation Nov 3",
    };
    expect(weekChanges(from, to)).toEqual([
      "Monday's hours: 6:00 AM – 12:00 PM, was 7:00 AM – 1:00 PM.",
      "Works Friday, 7:00 AM – 11:00 AM.",
      "Drops Bob Jones, Monday at 9:00 AM.",
      "Moves Judy Smith from Monday at 8:00 AM to Tuesday at 9:30 AM.",
      "Adds Ann Park, Friday at 8:00 AM.",
      'Note: "Back from vacation Nov 3"',
    ]);
    expect(weekChanges(to, { ...from, note: undefined })).toContain("No longer works Friday (was 7:00 AM – 11:00 AM).");
    expect(weekChanges(to, { ...to, note: "" })).toEqual(["Takes the note off."]);
  });
});

describe("days away, labelled", () => {
  it("names the first and last day, or the one day", () => {
    expect(awayLabel({ from: "2026-10-05", to: "2026-10-09" }, "America/New_York")).toBe("Mon, Oct 5 – Fri, Oct 9");
    expect(awayLabel({ from: "2026-10-05", to: "2026-10-05" }, "America/New_York")).toBe("Mon, Oct 5");
  });
});
