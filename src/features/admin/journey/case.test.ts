import { describe, expect, it } from "vitest";
import { CASE_ESCALATE_DAYS, caseOf } from "./case";
import type { ClientJourney } from "./states";

const TODAY = "2026-09-28";

const journey = (extra: Partial<ClientJourney>): ClientJourney => ({
  state: "drifting",
  judged: true,
  rhythm: null,
  rhythmWhy: null,
  unknownWhy: null,
  daysSince: 10,
  lastVisit: "2026-09-18",
  nextBooking: null,
  crossed: "twice-usual",
  since: "2026-09-25",
  driftDays: 7,
  why: "",
  proof: "",
  ...extra,
});

const beregond = { id: "t-ber", name: "Beregond Guard" };

describe("the case", () => {
  it("belongs to her usual trainer, names a person for the next step, and comes to the leader after three days", () => {
    const c = caseOf(journey({}), { trainer: beregond, inToday: "7:00 AM – 3:00 PM" }, TODAY);
    expect(c.open).toBe(true);
    expect(c.owner).toEqual({ id: "t-ber", name: "Beregond Guard", usual: true });
    expect(c.nextStep).toContain("Beregond is in today (7:00 AM – 3:00 PM): ask if they know why.");
    expect(c.nextStep).toContain("Beregond phones her (a person, not the app)");
    expect(c.dueDay).toBe("2026-09-28");
    expect(CASE_ESCALATE_DAYS).toBe(3);
    expect(c.leaders).toBe(false);
    expect(c.outcomeWords).toBe("Booked again closes the case by itself. Journey notices the booking from Mindbody.");
  });

  it("past the due day it is the leader's — and says to check with the owner, since no step is recorded", () => {
    const c = caseOf(journey({ since: "2026-09-20" }), { trainer: beregond, inToday: null }, TODAY);
    expect(c.leaders).toBe(true);
    expect(c.nextStep).toContain("Ask Beregond next time they're in.");
    expect(c.nextStep).toContain("so it's the leader's now. Journey can't record a step yet, so check with Beregond first.");
  });

  it("with no usual trainer on record, a leader owns it", () => {
    const c = caseOf(journey({ state: "at-risk", crossed: "studio-line" }), { trainer: null, inToday: null }, TODAY);
    expect(c.owner).toEqual({ id: null, name: "A leader", usual: false });
    expect(c.nextStep).toMatch(/^A leader phones her the next day they're in/);
  });

  it("closes by itself when she books again, and is no case for a steady client", () => {
    const back = caseOf(journey({ state: "back", crossed: null, since: null }), { trainer: beregond, inToday: null }, TODAY);
    expect(back.outcome).toBe("booked-again");
    expect(back.open).toBe(false);
    expect(back.outcomeWords).toContain("the case closed by itself");
    const steady = caseOf(journey({ state: "steady", crossed: null, since: null }), { trainer: beregond, inToday: null }, TODAY);
    expect(steady.open).toBe(false);
    expect(steady.dueDay).toBeNull();
    expect(steady.nextStep).toBe("Nothing to do. She's in her own rhythm.");
  });

  it("says what an unknown waits on", () => {
    expect(caseOf(journey({ state: "unknown", unknownWhy: "too-new" }), { trainer: null, inToday: null }, TODAY).nextStep).toContain("six visits over four weeks");
    expect(caseOf(journey({ state: "unknown", unknownWhy: "bookings-unread" }), { trainer: null, inToday: null }, TODAY).nextStep).toContain("until her bookings are read");
  });
});
