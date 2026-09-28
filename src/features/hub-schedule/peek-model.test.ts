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
import { momentsToday } from "../hub-opportunities/moments-today";
import { peekContent } from "./peek-model";

function entryFor(client: Client, schedules: ScheduleEntry[]) {
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

  it("gives no number when it may not be quoted", () => {
    const migrating = makeClient({ id: "mentha", firstName: "Mentha", lastName: "Brandybuck", clientsNumberOfVisitsAtSite: 250 });
    const peek = peekContent(entryFor(migrating, [makeBooking({ clientId: "mentha", start: eastern(TODAY, "16:00") })]));
    expect(peek.subtitle).toBe("4:00 – 4:30 PM");
  });
});
