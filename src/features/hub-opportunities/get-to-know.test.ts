/**
 * Get to know — the ✎ "Ask about" mark, from FORD (hub cherry round): a
 * detail whose day comes round within the week, or one noted in the last
 * two weeks; at most one per client; asked about the booking's day; never
 * an archived detail, the team's In one line, a legacy row or one that
 * stopped being true. Run with TZ=America/New_York (it passes in any zone).
 */
import { describe, expect, it } from "vitest";
import type { FordEntry } from "../ford/types";
import { ASK_DATED_DAYS, ASK_NEW_DAYS, askAboutByClient, askAboutFor, askDatedWindow, nextAnnualDay } from "./get-to-know";

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

  it("is asked about the day on screen: Thursday sees Saturday's recital; the Monday after, it has passed", () => {
    expect(askAboutFor([recital], "2026-10-01")?.reason).toBe("dated");
    expect(askAboutFor([recital], "2026-10-05")).toBeNull();
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
