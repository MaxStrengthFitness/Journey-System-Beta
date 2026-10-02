/**
 * What the peek says: from the same entry as the Opportunities list, every
 * mark in words, where she is with "can't tell" rather than a guess, and the
 * standing context quietly.
 */
import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../types";
import { loggedSessions } from "../../lib/booking-state";
import { buildDirectoryRows } from "../client-directory/row";
import { NOW, STUDIOS, TODAY, eastern, makeBooking, makeClient, makeContext } from "../client-directory/fixtures";
import { momentsToday, type MomentsTodayInput } from "../hub-opportunities/moments-today";
import type { FordEntry } from "../ford/types";
import { peekContent, peekState } from "./peek-model";

function entryFor(client: Client, schedules: ScheduleEntry[], over: Partial<MomentsTodayInput> = {}) {
  const rows = buildDirectoryRows([client], makeContext({ schedules }));
  return momentsToday({
    day: TODAY,
    today: TODAY,
    now: NOW,
    tz: "America/New_York",
    schedules,
    clientsById: new Map([[client.id as string, client]]),
    rowsById: new Map(rows.map((r) => [r.id, r])),
    studios: STUDIOS,
    logged: loggedSessions([]),
    criticalFor: () => [],
    myIds: ["t-me"],
    myName: "Sam Rivera",
    ...over,
  })[0];
}

describe("the peek", () => {
  const belladonna = makeClient({
    id: "belladonna",
    firstName: "Belladonna",
    lastName: "Took",
    sessionCount: 99,
    clientsNumberOfVisitsAtSite: 2,
    dateOfBirth: "1946-10-01",
    priorityNote: "No overhead pressing until her surgeon clears the left shoulder",
    isLiabilityReleased: false,
    clinicalNotes: "Left shoulder repair, 2025",
  } as Partial<Client> & { id: string });
  const booking = makeBooking({ clientId: "belladonna", start: eastern(TODAY, "16:00"), trainerId: "t-me", trainerName: "Sam Rivera" });

  it("names her whole, with her time, her trainer and her number", () => {
    const peek = peekContent(entryFor(belladonna, [booking]));
    expect(peek.name).toBe("Belladonna Took");
    expect(peek.subtitle).toBe("4:00 – 4:30 PM · with you · her 100th session");
  });

  it("puts Read first on its own, whole, and says every other mark in words in the Key's order", () => {
    const peek = peekContent(entryFor(belladonna, [booking]));
    expect(peek.critical).toBe("No overhead pressing until her surgeon clears the left shoulder");
    expect(peek.lines.map((l) => [l.family, l.text])).toEqual([
      ["watch", "No liability waiver signed in Mindbody."],
      ["celebrate", "Her 100th session."],
      ["celebrate", "Turns 80 on Thursday, Oct 1."],
    ]);
  });

  it("says where she is, and what it can't tell, quietly", () => {
    const peek = peekContent(entryFor(belladonna, [booking]));
    expect(peek.facts.map((f) => f.label)).toEqual(["Last in", "Package"]);
    expect(peek.facts.find((f) => f.label === "Package")).toMatchObject({ text: "No package read yet", muted: true });
    expect(peek.notes).toEqual(["Clinical history on file — her briefing has it."]);
  });

  it("says in full what a narrow card may leave out (hub fixes, Oct 1 2026)", () => {
    const peek = peekContent(entryFor(belladonna, [booking]), null, { extras: ["New to Journey", "InBody Scan"] });
    expect(peek.subtitle).toBe("4:00 – 4:30 PM · with you · New to Journey · InBody Scan");
  });

  it("gives no number when it may not be quoted", () => {
    const migrating = makeClient({ id: "mentha", firstName: "Mentha", lastName: "Brandybuck", clientsNumberOfVisitsAtSite: 250 });
    const peek = peekContent(entryFor(migrating, [makeBooking({ clientId: "mentha", start: eastern(TODAY, "16:00") })]));
    expect(peek.subtitle).toBe("4:00 – 4:30 PM");
  });

  it("says Get to know's sentence last, with its proof (wave 2 hub)", () => {
    const wedding = {
      id: "f-wedding",
      clientId: "belladonna",
      studioId: "westlake",
      pillar: "family",
      body: "Her grandson's wedding in Hobbiton on Saturday",
      subject: "the wedding",
      eventDate: eastern("2026-10-03", "00:00"),
      recurrence: "none",
      occurredAt: eastern("2026-09-15", "10:00"),
      isArchived: false,
    } as unknown as FordEntry;
    const peek = peekContent(entryFor(belladonna, [booking], { fordFor: () => [wedding] }));
    expect(peek.lines[peek.lines.length - 1]).toEqual({
      kind: "ask-about",
      family: "get-to-know",
      text: "Ask about: Her grandson's wedding in Hobbiton on Saturday — Saturday, Oct 3 (Family, noted Sep 15).",
      note: true,
    });
  });

  it("says the nightly marks' All star, with its proof, only for a client they name (wave 2 hub)", () => {
    const named = peekContent(entryFor(belladonna, [booking], { allStarOf: (id) => (id === "belladonna" ? { clientId: id, weeksIn: 25, perWeek: 2 } : null) }));
    expect(named.star).toBe("All star: in 25 of the last 26 weeks, about twice a week.");
    expect(peekContent(entryFor(belladonna, [booking], { allStarOf: () => null })).star).toBeNull();
    expect(peekContent(entryFor(belladonna, [booking])).star).toBeNull();
  });

  it("says, quietly, when her FORD couldn't be checked", () => {
    const peek = peekContent(entryFor(belladonna, [booking], { fordFor: () => null }));
    expect(peek.notes).toEqual([
      "Couldn’t check FORD for something to ask about — her FORD page has it.",
      "Clinical history on file — her briefing has it.",
    ]);
  });
});

describe("peekState: what happened, and the button that follows it (hub fixes, Oct 1 2026)", () => {
  it("logged: says so with its machines, and offers Edit session only with the session in hand", () => {
    expect(peekState("done", { machines: 7, loggedSessionHeld: true })).toEqual({ words: "Logged · 7 machines", primary: { kind: "edit", label: "Edit session" }, note: null });
    expect(peekState("done", { machines: 1, loggedSessionHeld: true }).words).toBe("Logged · 1 machine");
    // No machine count on the session: never a guessed number.
    expect(peekState("done", { machines: null, loggedSessionHeld: true }).words).toBe("Logged");
    expect(peekState("done", { loggedSessionHeld: false }).primary).toBeNull();
  });
  it("in session opens it; left open resumes or starts new, and says where to close it", () => {
    expect(peekState("in-session").primary).toEqual({ kind: "open-session", label: "Open session" });
    const left = peekState("left-open");
    expect(left.words).toBe("Left open");
    expect(left.primary).toEqual({ kind: "open-session", label: "Resume or start new" });
    expect(left.note).toContain("Discard");
  });
  it("not logged offers Log past session; didn't come offers nothing to start", () => {
    expect(peekState("not-logged").primary).toEqual({ kind: "log-past", label: "Log past session" });
    expect(peekState("didnt-come")).toEqual({ words: "Didn't come", primary: null, note: null });
  });
  it("coming up, or nothing to claim, is Start session as before", () => {
    expect(peekState("live")).toEqual({ words: null, primary: { kind: "start", label: "Start session" }, note: null });
    expect(peekState("past").primary?.kind).toBe("start");
    expect(peekState(null).primary?.kind).toBe("start");
  });
});