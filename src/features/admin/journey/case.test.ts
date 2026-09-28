import { describe, expect, it } from "vitest";
import { CASE_ESCALATE_DAYS, caseOf, caseWorthy } from "./case";
import { casePatch, draftOf, draftProblem, newCaseDoc, parseCase, type CaseDraft, type StoredCase } from "./case-store";
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

const beregond = { id: "t-ber", name: "Beregond Guard", uid: "uid-ber" };

describe("the case, worked out", () => {
  it("belongs to her usual trainer, names a person for the next step, and comes to the leader after three days", () => {
    const c = caseOf(journey({}), { trainer: beregond, inToday: "7:00 AM – 3:00 PM" }, TODAY);
    expect(c.open).toBe(true);
    expect(c.stored).toBe(false);
    // A worked-out owner carries the sign-in uid, the id a stored case keeps.
    expect(c.owner).toEqual({ id: "uid-ber", name: "Beregond Guard", usual: true });
    expect(c.nextStep).toContain("Beregond is in today (7:00 AM – 3:00 PM): ask if they know why.");
    expect(c.nextStep).toContain("Beregond phones her (a person, not the app)");
    expect(c.dueDay).toBe("2026-09-28");
    expect(CASE_ESCALATE_DAYS).toBe(3);
    expect(c.leaders).toBe(false);
    expect(c.outcomeWords).toBe("Booked again closes the case by itself. Journey notices the booking from Mindbody.");
  });

  it("past the due day it is the leader's — and says to check with the owner, since no case is stored", () => {
    const c = caseOf(journey({ since: "2026-09-20" }), { trainer: beregond, inToday: null }, TODAY);
    expect(c.leaders).toBe(true);
    expect(c.nextStep).toContain("Ask Beregond next time they're in.");
    expect(c.nextStep).toContain("so it's the leader's now. No case is stored for her, so check with Beregond first.");
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
    expect(caseWorthy("drifting") && caseWorthy("at-risk") && caseWorthy("lapsed")).toBe(true);
    expect(caseWorthy("steady") || caseWorthy("back") || caseWorthy("unknown")).toBe(false);
  });

  it("says what an unknown waits on", () => {
    expect(caseOf(journey({ state: "unknown", unknownWhy: "too-new" }), { trainer: null, inToday: null }, TODAY).nextStep).toContain("six visits over four weeks");
    expect(caseOf(journey({ state: "unknown", unknownWhy: "bookings-unread" }), { trainer: null, inToday: null }, TODAY).nextStep).toContain("until her bookings are read");
  });
});

const stored = (over: Partial<StoredCase> = {}): StoredCase => ({
  clientId: "eowyn",
  clientName: "Éowyn Rohan",
  owner: { id: "uid-ber", name: "Beregond Guard" },
  nextStep: "Phone her after Thursday's shift.",
  dueOn: "2026-10-01",
  outcome: "open",
  reason: null,
  openedAt: new Date("2026-09-26T14:00:00Z"),
  updatedAt: new Date("2026-09-26T14:00:00Z"),
  updatedBy: "uid-lead",
  ...over,
});

describe("the case, stored (wave 2)", () => {
  it("reads what the team wrote: the owner, the step, the day", () => {
    const c = caseOf(journey({}), { trainer: beregond, inToday: null }, TODAY, { stored: stored(), updatedOn: "2026-09-26" });
    expect(c.stored).toBe(true);
    expect(c.open).toBe(true);
    expect(c.owner).toEqual({ id: "uid-ber", name: "Beregond Guard", usual: true });
    expect(c.nextStep).toBe("Phone her after Thursday's shift.");
    expect(c.dueDay).toBe("2026-10-01");
    expect(c.leaders).toBe(false);
  });

  it("names an owner who isn't her usual trainer as such, and an empty step reads the rules' own", () => {
    const c = caseOf(journey({ state: "at-risk", crossed: "studio-line" }), { trainer: beregond, inToday: null }, TODAY, {
      stored: stored({ owner: { id: "uid-mab", name: "Mablung Ranger" }, nextStep: "  " }),
      updatedOn: "2026-09-27",
    });
    expect(c.owner.usual).toBe(false);
    expect(c.nextStep).toMatch(/^A leader phones her/);
  });

  it("comes to the leader after three days with no step, counted from its last change", () => {
    const quiet = caseOf(journey({}), { trainer: beregond, inToday: null }, TODAY, { stored: stored(), updatedOn: "2026-09-24" });
    expect(quiet.leaders).toBe(true);
    expect(quiet.leadersWhy).toBe("No step recorded since Thursday, Sep 24, so it's the leader's now. Check with Beregond first.");
    const onTheLine = caseOf(journey({}), { trainer: beregond, inToday: null }, TODAY, { stored: stored(), updatedOn: "2026-09-25" });
    expect(onTheLine.leaders).toBe(false);
  });

  it("works out Booked again from her bookings, and offers to close — never writes it", () => {
    const c = caseOf(journey({ state: "back", nextBooking: "2026-09-30" }), { trainer: beregond, inToday: null }, TODAY, { stored: stored(), updatedOn: "2026-09-24" });
    expect(c.outcome).toBe("booked-again");
    expect(c.bookedAgainOnRead).toBe(true);
    expect(c.open).toBe(false);
    expect(c.leaders).toBe(false);
    expect(c.outcomeWords).toContain("Journey sees her next booking on Wednesday, Sep 30");
  });

  it("says a closed case's outcome and reason", () => {
    const lost = caseOf(journey({ state: "lapsed" }), { trainer: beregond, inToday: null }, TODAY, { stored: stored({ outcome: "lost", reason: "Moved to Minas Tirith" }), updatedOn: "2026-09-20" });
    expect(lost.open).toBe(false);
    expect(lost.leaders).toBe(false);
    expect(lost.outcome).toBe("lost");
    expect(lost.outcomeWords).toBe("Lost. Moved to Minas Tirith.");
    const paused = caseOf(journey({}), { trainer: beregond, inToday: null }, TODAY, { stored: stored({ outcome: "paused" }), updatedOn: "2026-09-20" });
    expect(paused.outcomeWords).toBe("Paused. No reason written.");
  });
});

describe("the case's document", () => {
  it("reads a stored case defensively, and refuses one with no owner or outcome", () => {
    const c = parseCase("eowyn", { clientId: "eowyn", clientName: "Éowyn Rohan", owner: { id: "uid-ber", name: "Beregond Guard" }, nextStep: "Call", dueOn: "2026-10-01", outcome: "paused", reason: "Knee", openedAt: new Date(), updatedAt: new Date(), updatedBy: "uid-lead" });
    expect(c).toMatchObject({ outcome: "paused", reason: "Knee", dueOn: "2026-10-01" });
    expect(parseCase("x", { owner: { name: "Nobody" }, outcome: "open" })).toBeNull();
    expect(parseCase("x", { owner: { id: "u" }, outcome: "maybe" })).toBeNull();
    expect(parseCase("x", { owner: { id: "u" }, outcome: "open", dueOn: "someday" })?.dueOn).toBeNull();
  });

  it("sends only what changed, and removes a reason cleared", () => {
    const before: CaseDraft = draftOf(stored({ reason: "Knee surgery" }));
    expect(casePatch(before, { ...before })).toEqual({});
    expect(casePatch(before, { ...before, nextStep: "Ask Beregond" })).toEqual({ nextStep: "Ask Beregond" });
    expect(casePatch(before, { ...before, outcome: "paused", reason: "" })).toEqual({ outcome: "paused", reason: "clear" });
    expect(casePatch(before, { ...before, owner: { id: "uid-mab", name: "Mablung Ranger" }, dueOn: null })).toEqual({ owner: { id: "uid-mab", name: "Mablung Ranger" }, dueOn: null });
  });

  it("writes a new case whole, with no undefined, and checks the draft first", () => {
    const draft: CaseDraft = { owner: { id: "uid-ber", name: "Beregond Guard" }, nextStep: " Phone her ", dueOn: "2026-10-01", outcome: "open", reason: "" };
    const docData = newCaseDoc("eowyn", "Éowyn Rohan", draft, "uid-lead", "NOW");
    expect(docData).toEqual({ clientId: "eowyn", clientName: "Éowyn Rohan", owner: { id: "uid-ber", name: "Beregond Guard" }, nextStep: "Phone her", dueOn: "2026-10-01", outcome: "open", openedAt: "NOW", updatedAt: "NOW", updatedBy: "uid-lead" });
    expect(Object.values(docData).includes(undefined)).toBe(false);
    expect(draftProblem({ ...draft, owner: null })).toBe("Choose who owns it.");
    expect(draftProblem({ ...draft, nextStep: "x".repeat(501) })).toContain("500 characters");
    expect(draftProblem({ ...draft, dueOn: "01/10/2026" })).toContain("due day");
    expect(draftProblem(draft)).toBeNull();
  });
});
