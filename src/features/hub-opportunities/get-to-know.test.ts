/**
 * Get to know — the ✎ "Ask about" mark, from FORD (hub cherry round): a
 * detail whose day comes round within the week, or one noted in the last
 * two weeks; at most one per client; asked about the booking's day; never
 * an archived detail, the team's In one line, a legacy row or one that
 * stopped being true. Run with TZ=America/New_York (it passes in any zone).
 */
import { describe, expect, it } from "vitest";
import type { FordEntry } from "../ford/types";
import { addDays } from "../client-history/model";
import { studioDayKeyOf } from "../../lib/studio-time";
import {
  ASK_ABOUT_LABEL,
  ASK_DATED_DAYS,
  ASK_NEW_DAYS,
  HUB_STRIP_DAYS,
  askAboutByClient,
  askAboutFor,
  askDatedWindow,
  askReadWindow,
  fordByClient,
  nextAnnualDay,
} from "./get-to-know";

const MONDAY = "2026-09-28";
/** A studio day at the studio's midnight, the way the FORD dialog stores a date. */
const eastern = (day: string, hm = "00:00") => new Date(`${day}T${hm}:00-04:00`);

let seq = 0;
const detail = (over: Partial<FordEntry> & Pick<FordEntry, "clientId" | "body">): FordEntry =>
  ({
    id: `f${++seq}`,
    studioId: "westlake",
    pillar: "family",
    subject: null,
    isPinned: false,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: eastern("2026-08-01", "10:00"),
    createdAt: eastern("2026-08-01", "10:00"),
    updatedAt: eastern("2026-08-01", "10:00"),
    authorId: "uid-ioreth",
    authorName: "Ioreth",
    authorInitials: "IO",
    origin: "in_session",
    sessionId: null,
    isArchived: false,
    ...over,
  }) as FordEntry;

const recital = detail({ clientId: "hamfast", body: "His granddaughter's piano recital on Saturday.", subject: "the recital", eventDate: eastern("2026-10-03"), occurredAt: eastern("2026-09-10", "09:00") });
const retired = detail({ clientId: "melilot", body: "She just retired from the Buckland library", pillar: "occupation", occurredAt: eastern("2026-09-18", "10:30") });

describe("what comes up, on the booking's day", () => {
  it("a detail whose day comes round this week: the chip and the sentence, in the trainer's words", () => {
    expect(askAboutFor([recital], MONDAY)).toEqual({
      entryId: recital.id,
      clientId: "hamfast",
      reason: "dated",
      loudness: "standard",
      onDay: "2026-10-03",
      chip: "Ask: the recital · Sat",
      sentence: "Ask about: His granddaughter's piano recital on Saturday — Saturday, Oct 3 (Family, noted Sep 10).",
    });
  });

  it("a detail noted in the last two weeks, with no day: new", () => {
    const ask = askAboutFor([retired], MONDAY);
    // No subject: the first words the trainer wrote, marked as a start.
    expect(ask).toMatchObject({ reason: "new", onDay: null, chip: "Ask: She just retired…" });
    expect(ask?.sentence).toBe("Ask about: She just retired from the Buckland library (Occupation, noted Sep 18).");
  });

  it("the window is a week of days and two weeks of news", () => {
    expect([ASK_DATED_DAYS, ASK_NEW_DAYS]).toEqual([7, 14]);
    expect(askDatedWindow(MONDAY)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    const nextWeek = detail({ clientId: "c", body: "Moving house", eventDate: eastern("2026-10-05") });
    const staleNews = detail({ clientId: "c", body: "New grandson", occurredAt: eastern("2026-09-10", "12:00") });
    expect(askAboutFor([nextWeek, staleNews], MONDAY)).toBeNull();
  });

  it("an anniversary stored years ago comes round again; the day itself counts as today", () => {
    const anniversary = detail({ clientId: "c", body: "Wedding anniversary", subject: "the anniversary", eventDate: eastern("2019-10-01"), recurrence: "annual" });
    expect(askAboutFor([anniversary], MONDAY)).toMatchObject({ reason: "dated", onDay: "2026-10-01", chip: "Ask: the anniversary · Thu" });
    expect(askAboutFor([anniversary], "2026-10-01")?.chip).toBe("Ask: the anniversary · today");
  });

  it("is asked about the day on screen: Thursday sees Saturday's recital; the Monday after, how it went; a week on, nothing", () => {
    expect(askAboutFor([recital], "2026-10-01")?.reason).toBe("dated");
    expect(askAboutFor([recital], "2026-10-05")?.reason).toBe("after");
    expect(askAboutFor([recital], "2026-10-10")?.reason).toBe("after");
    expect(askAboutFor([recital], "2026-10-11")).toBeNull();
  });
});

describe("what never comes up", () => {
  it("an archived detail, the team's In one line, a legacy row, a detail no longer true, a closed window", () => {
    const never = [
      detail({ clientId: "c", body: "Archived trip", eventDate: eastern("2026-09-30"), isArchived: true }),
      detail({ id: "one-line", clientId: "c", body: "Retired hygienist, pickleball regular", pillar: null, occurredAt: eastern("2026-09-27", "09:00") } as Partial<FordEntry> & Pick<FordEntry, "clientId" | "body">),
      detail({ clientId: "c", body: "Old event", eventDate: eastern("2026-09-30"), isLegacy: true }),
      detail({ clientId: "c", body: "Hospice stay", occurredAt: eastern("2026-09-25", "09:00"), resolvedAt: eastern("2026-09-27", "09:00") }),
      detail({ clientId: "c", body: "In Bree for the month", occurredAt: eastern("2026-09-20", "09:00"), effectiveUntil: eastern("2026-09-26") }),
      detail({ clientId: "c", body: "   " }),
    ];
    expect(askAboutFor(never, MONDAY)).toBeNull();
  });
});

describe("one per client", () => {
  it("the soonest dated detail beats a new one; with none dated, the newest new one", () => {
    const later = detail({ clientId: "hamfast", body: "Fishing trip", subject: "the trip", eventDate: eastern("2026-10-04") });
    const news = detail({ clientId: "hamfast", body: "New knee brace", subject: "the brace", occurredAt: eastern("2026-09-27", "09:00") });
    expect(askAboutFor([news, later, recital], MONDAY)?.entryId).toBe(recital.id);
    const older = detail({ clientId: "melilot", body: "Started watercolours", subject: "watercolours", pillar: "recreation", occurredAt: eastern("2026-09-16", "09:00") });
    expect(askAboutFor([older, retired], MONDAY)?.entryId).toBe(retired.id);
  });

  it("one studio read sorts into each booked client's one, and says nothing about anyone else", () => {
    const rosie = detail({ clientId: "rosie", body: "The new puppy, a corgi called Pickle", subject: "the puppy", occurredAt: eastern("2026-09-20", "11:00") });
    const byClient = askAboutByClient([recital, retired, rosie], new Set(["hamfast", "rosie"]), MONDAY);
    expect([...byClient.keys()].sort()).toEqual(["hamfast", "rosie"]);
    expect(byClient.get("rosie")?.chip).toBe("Ask: the puppy");
  });
});

describe("an annual day, from its digits", () => {
  it("rolls forward to the next time it comes round, and a leap day falls on March 1", () => {
    expect(nextAnnualDay("2019-10-01", MONDAY)).toBe("2026-10-01");
    expect(nextAnnualDay("2019-09-01", MONDAY)).toBe("2027-09-01");
    expect(nextAnnualDay("2024-02-29", "2027-02-01")).toBe("2027-03-01");
    expect(nextAnnualDay("not a day", MONDAY)).toBeNull();
  });
});

describe("AJ's two answers: both count, at Note loudness (the Atlas answers, Oct 2 2026)", () => {
  it("a dated detail that has just happened: ask how it went", () => {
    // The recital was Saturday; noted weeks ago, so it isn't news either.
    const lastSaturday = detail({ clientId: "c", body: "Granddaughter's recital", subject: "the recital", eventDate: eastern("2026-09-26"), occurredAt: eastern("2026-09-01", "09:00") });
    expect(askAboutFor([lastSaturday], MONDAY)).toMatchObject({
      reason: "after",
      loudness: "standard",
      onDay: "2026-09-26",
      chip: "Ask how it went: the recital",
      sentence: "Ask how it went: Granddaughter's recital \u2014 Saturday, Sep 26 (Family).",
    });
    // An anniversary last week counts too; one eight days back does not.
    const anniversary = detail({ clientId: "c", body: "Anniversary dinner", eventDate: eastern("2015-09-23"), recurrence: "annual" });
    expect(askAboutFor([anniversary], MONDAY)?.reason).toBe("after");
    expect(askAboutFor([anniversary], "2026-10-01")).toBeNull();
  });

  it("a Follow up next time question counts, in the trainer's words", () => {
    const followUp = detail({
      clientId: "c",
      body: "New walking boots",
      occurredAt: eastern("2026-08-02", "09:00"),
      followUp: "How did the boots do on the long walk?",
      followUpAt: eastern("2026-09-27", "09:00"),
      followUpBy: "Jess Moreno",
    });
    expect(askAboutFor([followUp], MONDAY)).toMatchObject({
      reason: "follow-up",
      loudness: "standard",
      chip: "Follow up: New walking boots",
      sentence: "Follow up: How did the boots do on the long walk? (New walking boots; Family, from Jess Moreno)",
    });
    // An asked question (null) is nothing.
    expect(askAboutFor([{ ...followUp, followUp: null }], MONDAY)).toBeNull();
  });

  it("one per client: a day coming up first, then a follow-up, then one that just happened", () => {
    const coming = detail({ clientId: "c", body: "Trip to Rome", eventDate: eastern("2026-10-02") });
    const asked = detail({ clientId: "c", body: "Knee brace", followUp: "Did the brace help?", followUpAt: eastern("2026-09-20", "09:00") });
    const past = detail({ clientId: "c", body: "Son's game", eventDate: eastern("2026-09-26") });
    expect(askAboutFor([past, asked, coming], MONDAY)?.entryId).toBe(coming.id);
    expect(askAboutFor([past, asked], MONDAY)?.entryId).toBe(asked.id);
  });
});

describe("the Hub's one FORD read (wave 2 hub)", () => {
  it("says only 'Something to ask about' on the grid: the detail's words are the list's and the peek's", () => {
    expect(ASK_ABOUT_LABEL).toBe("Something to ask about");
  });

  it("sorts one studio read's details by client", () => {
    const rosie = detail({ clientId: "rosie", body: "The new puppy" });
    const byClient = fordByClient([recital, retired, rosie, { ...rosie, id: "stray", clientId: "" }]);
    expect([...byClient.keys()].sort()).toEqual(["hamfast", "melilot", "rosie"]);
    expect(byClient.get("rosie")?.map((e) => e.id)).toEqual([rosie.id]);
  });

  it("covers every day on the strip at once: a week of days for each, two weeks of news, a day of slack", () => {
    expect(HUB_STRIP_DAYS).toBe(7);
    expect(askReadWindow(MONDAY)).toEqual({ datedFrom: "2026-09-20", datedUntil: "2026-10-12", notedFrom: "2026-09-14", followUpFrom: "2026-07-30" });
  });

  it("holds everything the rule could pick on any strip day — the read never hides an answer", () => {
    const { datedFrom, datedUntil, notedFrom } = askReadWindow(MONDAY);
    // Details on every day around the strip: dated one-offs and news.
    const around: FordEntry[] = [];
    for (let i = -20; i <= 20; i++) {
      const day = addDays(MONDAY, i);
      around.push(detail({ clientId: `dated-${i}`, body: `Dated ${i}`, eventDate: eastern(day), occurredAt: eastern("2026-01-05", "09:00") }));
      around.push(detail({ clientId: `noted-${i}`, body: `Noted ${i}`, occurredAt: eastern(day, "10:00") }));
    }
    const inRead = (e: FordEntry) => {
      const dated = studioDayKeyOf(e.eventDate ?? null);
      const noted = studioDayKeyOf(e.occurredAt ?? null);
      return (dated !== null && dated >= datedFrom && dated < datedUntil) || (noted !== null && noted >= notedFrom);
    };
    for (let s = 0; s < HUB_STRIP_DAYS; s++) {
      const day = addDays(MONDAY, s);
      for (const e of around) {
        if (askAboutFor([e], day)) expect(inRead(e), `${e.body} on ${day}`).toBe(true);
      }
    }
  });
});
