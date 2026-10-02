import { describe, expect, it } from "vitest";
import type { FordEntry } from "../ford/types";
import { annualDaysIn, fordCalendarEvents } from "./ford-events";

const detail = (id: string, over: Partial<FordEntry> = {}): FordEntry =>
  ({ id, clientId: "ruth", studioId: "solon", pillar: "family", body: "Granddaughter's recital", subject: null, isPinned: false, eventDate: null, recurrence: null, ...over }) as unknown as FordEntry;

const clients = [
  { id: "ruth", firstName: "Ruth", lastName: "Avery", dateOfBirth: "1946-10-01", homeStudioId: "solon" },
  { id: "leap", firstName: "Lee", lastName: "Pell", dateOfBirth: "1960-02-29", homeStudioId: "solon" },
  { id: "away", firstName: "Visiting", lastName: "Client", dateOfBirth: "1970-10-02", homeStudioId: "westlake" },
];

const titles = (events: ReturnType<typeof fordCalendarEvents>) => events.map((e) => `${e.date.getMonth() + 1}/${e.date.getDate()} ${e.title}`);

describe("the calendar's Events are clients' FORD dates", () => {
  it("puts a birthday on every year, with her name, and only this studio's clients", () => {
    const events = fordCalendarEvents({ details: [], clients, studioId: "solon", from: "2026-09-27", to: "2026-11-07" });
    expect(titles(events)).toEqual(["10/1 Ruth Avery’s birthday"]);
    const across = fordCalendarEvents({ details: [], clients, studioId: "solon", from: "2026-12-27", to: "2028-03-05" });
    expect(across.filter((e) => e.clientId === "ruth")).toHaveLength(1);
    // Feb 29 falls on Mar 1 in a year without one.
    expect(annualDaysIn("1960-02-29", "2027-02-01", "2027-03-31")).toEqual(["2027-03-01"]);
    expect(annualDaysIn("1960-02-29", "2028-02-01", "2028-03-31")).toEqual(["2028-02-29"]);
  });

  it("puts a one-off FORD date on its day, an annual one every year, and a window across its days", () => {
    const events = fordCalendarEvents({
      details: [
        detail("recital", { eventDate: "2026-10-10" }),
        detail("anniv", { eventDate: "1990-10-20", recurrence: "annual", subject: "Anniversary", body: "Married 1990" }),
        detail("trip", { body: "In Florida", effectiveFrom: "2026-10-03", effectiveUntil: "2026-10-08" }),
        detail("later", { eventDate: "2026-12-10" }),
      ],
      clients,
      studioId: "solon",
      from: "2026-09-27",
      to: "2026-11-07",
    });
    expect(titles(events)).toEqual([
      "10/1 Ruth Avery’s birthday",
      "10/3 Ruth Avery · In Florida",
      "10/10 Ruth Avery · Granddaughter's recital",
      "10/20 Ruth Avery · Anniversary: Married 1990",
    ]);
    expect(events[1].endDate?.getDate()).toBe(8);
  });

  it("never shows an archived, legacy, resolved or empty detail, nor the In one line", () => {
    const events = fordCalendarEvents({
      details: [
        detail("a", { eventDate: "2026-10-10", isArchived: true } as Partial<FordEntry>),
        detail("b", { eventDate: "2026-10-10", isLegacy: true } as Partial<FordEntry>),
        detail("c", { eventDate: "2026-10-10", resolvedAt: "2026-10-01" }),
        detail("d", { eventDate: "2026-10-10", body: "  " }),
        detail("one-line", { eventDate: "2026-10-10", kind: "one-line" }),
      ],
      clients: [],
      from: "2026-09-27",
      to: "2026-11-07",
    });
    expect(events).toEqual([]);
  });

  it("an unread FORD still shows the birthdays", () => {
    expect(fordCalendarEvents({ details: null, clients, studioId: "solon", from: "2026-09-27", to: "2026-11-07" })).toHaveLength(1);
  });
});
