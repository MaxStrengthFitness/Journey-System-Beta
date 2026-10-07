import { describe, expect, it } from "vitest";
import type { Client, ClinicalIncident, WorkoutSession } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "../../renewals/types";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { RenewalLaneContext } from "../renewals/lanes";
import { hoursThisWeek, notesToReview, painQuestion, renewalsQuestion } from "./questions";

const TODAY = "2026-09-21"; // a Monday

const snapshot = (extra: Partial<RenewalSnapshot>): RenewalSnapshot =>
  ({
    version: 1,
    cycleKey: "cyc",
    renewalOnBooks: null,
    clientContractId: null,
    packageKey: "committed",
    packageLabel: "Committed · 12 months",
    paymentMode: "monthly",
    billingStart: "2026-01-05",
    chargeDate: "2027-01-05",
    chargeDateSource: "mindbody",
    autoRenews: true,
    sessionsLeft: 40,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 6,
    paymentsLeft: 4,
    pacePerWeek: 2,
    runOutDate: null,
    bankedAtCharge: null,
    situation: "on-track",
    conversationDue: false,
    chargeWarning: false,
    focusDate: "2027-01-05",
    flags: [],
    proof: { weeksAttended: 8, weeksObserved: 8, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    awayUntil: null,
    awayReason: null,
    lastVisitDate: "2026-09-18",
    nextBookingDate: "2026-09-23",
    coachIds: [],
    primaryTrainerId: null,
    dataGaps: [],
    ...extra,
  }) as RenewalSnapshot;

const client = (id: string, name: string, renewal: Partial<RenewalSnapshot> | null, extra: Partial<Client> = {}): Client =>
  ({ id, firstName: name, lastName: "T", isActive: true, homeStudioId: "solon", renewal: renewal ? snapshot(renewal) : undefined, ...extra }) as Client;

const settings: RenewalSettings = DEFAULT_RENEWAL_SETTINGS;
/** The pipeline's own rule (admin/renewals/lanes.ts): Solon's clients, no marks, the app's Inactive line. */
const ctx = (over: Partial<RenewalLaneContext> = {}): RenewalLaneContext => ({
  studioId: "solon",
  settings,
  today: TODAY,
  inactiveMarks: new Map(),
  inactiveDays: 90,
  ...over,
});

describe("renewalsQuestion — counted, not listed", () => {
  it("counts the lanes, names who to talk to first, and who nobody has talked to", () => {
    const clients = [
      client("a", "Ann", { conversationDue: true, sessionsLeft: 8, focusDate: "2026-10-30" }),
      client("b", "Bea", { chargeWarning: true, sessionsLeft: 30, chargeDate: "2026-10-10", focusDate: "2026-10-10" }),
      client("c", "Cal", { focusDate: "2026-11-20", chargeDate: "2026-11-20" }),
      // Away, with a package ending inside the window the pipeline's Away lane keeps (lanes.ts).
      client("d", "Dee", { situation: "away", awayUntil: "2026-10-01", focusDate: "2026-12-01" }),
      client("e", "Eve", { conversationDue: true, sessionsLeft: 5, focusDate: "2026-10-05" }),
      client("f", "Fay", { conversationDue: true }, { isActive: false }),
    ];
    const cycles: Record<string, RenewalCycle> = {};
    const q = renewalsQuestion(clients, cycles, ctx());
    expect(q.counts["talk-now"]).toBe(2);
    expect(q.counts["before-charge"]).toBe(1);
    expect(q.counts["coming-up"]).toBe(1);
    expect(q.counts.away).toBe(1);
    expect(q.notTalked).toBe(3);
    // Talk now first, soonest first; the charge warning after.
    expect(q.rows.map((r) => r.name)).toEqual(["Eve T", "Ann T", "Bea T"]);
    expect(q.rows[0].sentence).toBe("Start the conversation");
    expect(q.rows[0].proof).toBe("Nobody has talked to them yet.");
    expect(q.rows[0].tone).toBe("alert");
    expect(q.rows[2].tone).toBe("warn");
  });

  it("reads the conversation off the cycle and leaves a decided renewal out", () => {
    const clients = [client("a", "Ann", { conversationDue: true, cycleKey: "cyc-a" }), client("b", "Bea", { conversationDue: true, cycleKey: "cyc-b" })];
    const cycles = {
      "cyc-a": { clientId: "a", clientName: "Ann", cycleKey: "cyc-a", packageKey: null, chargeDate: null, lastTouchAt: 1, lastTouchBy: "u1", lastTouchByName: "Lee", latestLeaning: "leaning-no", latestConcerns: [], latestInterestedIn: null, needsLeader: false } as RenewalCycle,
      "cyc-b": { clientId: "b", clientName: "Bea", cycleKey: "cyc-b", packageKey: null, chargeDate: null, lastTouchAt: 1, lastTouchBy: "u1", lastTouchByName: "Lee", latestLeaning: null, latestConcerns: [], latestInterestedIn: null, needsLeader: false, outcome: "renewed" } as RenewalCycle,
    };
    const q = renewalsQuestion(clients, cycles, ctx());
    expect(q.rows.map((r) => r.name)).toEqual(["Ann T"]);
    expect(q.rows[0].proof).toBe("Last talked to by Lee — leaning no.");
    expect(q.notTalked).toBe(0);
  });

  it("never says nobody has talked to them when the conversations couldn't be read", () => {
    const q = renewalsQuestion([client("a", "Ann", { conversationDue: true, sessionsLeft: 8 })], {}, ctx(), false);
    expect(q.notTalked).toBeNull();
    expect(q.rows[0].proof).toBe("Whether anyone has talked to them couldn't be read just now.");
  });

  it("counts by the pipeline's rule: the studio's own clients, however slow, and no Inactive client in a to-do lane (Oct 6 2026)", () => {
    const clients = [
      // 8 left at a quarter a week: runs out next May, past the old window. Counted.
      client("a", "Ann", { conversationDue: true, sessionsLeft: 8, pacePerWeek: 0.25, focusDate: "2027-05-10" }),
      // A visitor booked here: their own studio's renewal.
      client("b", "Bea", { conversationDue: true, sessionsLeft: 4, focusDate: "2026-10-12" }, { homeStudioId: "westlake" }),
      // Marked Inactive by a leader, nothing booked, no visit since.
      client("c", "Cal", { conversationDue: true, sessionsLeft: 5, focusDate: "2026-10-12", lastVisitDate: "2026-09-01", nextBookingDate: null }),
      // Past the Inactive line, nothing booked.
      client("d", "Dee", { conversationDue: true, sessionsLeft: 6, focusDate: "2026-10-20", lastVisitDate: "2026-06-01", nextBookingDate: null }),
      // Lapsed and Inactive: the lost list is untouched.
      client("e", "Eve", { situation: "lapsed", focusDate: "2026-07-01", lastVisitDate: "2026-06-20", nextBookingDate: null }),
    ];
    const q = renewalsQuestion(clients, {}, ctx({ inactiveMarks: new Map([["c", { day: "2026-09-10" }]]) }));
    expect(q.counts["talk-now"]).toBe(1);
    expect(q.rows.map((r) => r.name)).toEqual(["Ann T"]);
    expect(q.counts.lapsed).toBe(1);
    // A failed read of the marks hides nobody: Cal is back.
    expect(renewalsQuestion(clients, {}, ctx()).counts["talk-now"]).toBe(2);
  });
});

describe("painQuestion — pain on the Dial, incidents, critical notes", () => {
  const clients = [client("a", "Ann", null), client("b", "Bea", null), client("c", "Cal", null)];
  const session = (clientId: string, date: string, regions: Array<{ region: string; dial: number }>): WorkoutSession =>
    ({ clientId, date, status: "Completed", hostedAtStudioId: "solon", preSessionCheckIn: { bodyStates: regions.map((r) => ({ region: r.region, state: "stiff", dial: r.dial })) } }) as unknown as WorkoutSession;

  it("names the client, the region and the day for pain in the last week, and drops older or milder readings", () => {
    const q = painQuestion({
      sessions: [
        session("a", "2026-09-18", [{ region: "Lower back", dial: -2 }, { region: "Knee", dial: -1 }]),
        session("a", "2026-09-19", [{ region: "Lower back", dial: -2 }]),
        session("b", "2026-09-01", [{ region: "Shoulder", dial: -2 }]),
      ],
      incidents: [],
      entries: [],
      clients,
      today: TODAY,
    });
    expect(q.painReports).toBe(1);
    expect(q.rows).toHaveLength(1);
    expect(q.rows[0]).toMatchObject({ name: "Ann T", tone: "warn" });
    expect(q.rows[0].sentence).toBe("Pain on the Dial in the last 7 days: Lower back (2026-09-18), Lower back (2026-09-19).");
  });

  it("puts an open incident and a live critical note first, with the pain as proof, and leaves resolved ones out", () => {
    const incidents = [
      { id: "inc-b", clientId: "b", studioId: "solon", region: "Shoulder", severity: "stop_session", description: "sharp pain on the press", reportedByTrainerId: "t", createdAt: "2026-09-17T14:00:00Z" },
      { id: "inc-c", clientId: "c", studioId: "solon", region: "Knee", severity: "mild", description: "", reportedByTrainerId: "t", createdAt: "2026-09-10T14:00:00Z", resolvedAt: "2026-09-12T14:00:00Z" },
    ] as unknown as ClinicalIncident[];
    const entries = [
      { id: "n-a", clientId: "a", studioId: "solon", importance: "critical", body: "Post-op: no overhead work until cleared.", occurredAt: "2026-08-20T12:00:00Z", effectiveUntil: "2026-10-15", resolvedAt: null, isArchived: false },
      // A range that ended: no longer matters.
      { id: "n-c", clientId: "c", studioId: "solon", importance: "critical", body: "Old restriction.", occurredAt: "2026-07-01T12:00:00Z", effectiveUntil: "2026-08-01", resolvedAt: null, isArchived: false },
    ] as unknown as JournalEntry[];
    const q = painQuestion({
      sessions: [session("a", "2026-09-19", [{ region: "Shoulder", dial: -2 }])],
      incidents,
      entries,
      clients,
      today: TODAY,
    });
    expect(q.openIncidents).toBe(1);
    expect(q.criticalNotes).toBe(1);
    expect(q.rows.map((r) => r.name)).toEqual(["Ann T", "Bea T"]);
    expect(q.rows[0].sentence).toContain("Critical note (2026-08-20): Post-op");
    expect(q.rows[0].proof).toContain("Pain on the Dial");
    expect(q.rows[0].ackKeys).toEqual(["note:n-a", "pain:a:2026-09-19"]);
    expect(q.rows[1].sentence).toBe("Incident on 2026-09-17: Shoulder, session stopped — sharp pain on the press.");
    expect(q.rows[1].tone).toBe("alert");
    expect(q.rows[1].ackKeys).toEqual(["incident:inc-b"]);
  });

  it("an ALWAYS critical note keeps mattering until resolved — and comes up for review after 60 days", () => {
    const entries = [
      { id: "n-old", clientId: "c", studioId: "solon", importance: "critical", body: "Old note.", occurredAt: "2026-07-01T12:00:00Z", effectiveUntil: null, resolvedAt: null, isArchived: false, authorName: "Sam" },
      { id: "n-new", clientId: "a", studioId: "solon", importance: "critical", body: "Fresh.", occurredAt: "2026-09-10T12:00:00Z", effectiveUntil: null, resolvedAt: null, isArchived: false },
      { id: "n-done", clientId: "b", studioId: "solon", importance: "critical", body: "Resolved.", occurredAt: "2026-07-01T12:00:00Z", effectiveUntil: null, resolvedAt: "2026-08-01", isArchived: false },
    ] as unknown as JournalEntry[];
    const q = painQuestion({ sessions: [], incidents: [], entries, clients, today: TODAY });
    expect(q.criticalNotes).toBe(2);
    expect(q.rows.map((r) => r.name)).toEqual(["Ann T", "Cal T"]);
    const review = notesToReview(entries, clients, TODAY);
    expect(review.map((r) => r.entryId)).toEqual(["n-old"]);
    expect(review[0]).toMatchObject({ name: "Cal T", authorName: "Sam", days: 82 });
  });
});

describe("hoursThisWeek", () => {
  it("counts completed sessions since Monday at the slot length", () => {
    const s = (date: string, status = "Completed", trainerId = "t1") => ({ date, status, trainerId, hostedAtStudioId: "solon" }) as unknown as WorkoutSession;
    const r = hoursThisWeek([s("2026-09-21"), s("2026-09-21", "Completed", "t2"), s("2026-09-20"), s("2026-09-21", "In-Progress")], "2026-09-23", 30);
    expect(r).toEqual({ minutes: 60, sessions: 2, trainers: 2, since: "2026-09-21" });
  });
});
