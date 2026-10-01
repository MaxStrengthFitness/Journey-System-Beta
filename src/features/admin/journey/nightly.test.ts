/**
 * THE NIGHT'S STATES — the pure core the nightly job's Journey step calls
 * (wave 2, Sep 28 2026). TZ=America/New_York.
 */
import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../../types";
import type { RenewalSnapshot } from "../../renewals/types";
import { addDays } from "../../client-history/model";
import {
  journeyOfDoc,
  nightStillHolds,
  nightStudio,
  parseStateDoc,
  parseSummary,
  sameStateDoc,
  stateDocOf,
  summaryIsFresh,
  type ClientStateDoc,
  type NightStudioInput,
} from "./nightly";
import { APP_LINES, journeyOf, type ClientJourney } from "./states";
import { rhythmFromVisits } from "./rhythm";

const TODAY = "2026-09-28"; // a Monday
const NOW = new Date("2026-09-28T06:30:00Z"); // 2:30 AM Eastern: the job's hour
const TZ = "America/New_York";
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

const snap = (extra: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({
    version: 1,
    situation: "on-track",
    pacePerWeek: 2,
    proof: { weeksObserved: 12, weeksAttended: 12, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    flags: [],
    lastVisitDate: null,
    nextBookingDate: null,
    awayUntil: null,
    awayReason: null,
    primaryTrainerId: "t-ber",
    ...extra,
  }) as unknown as RenewalSnapshot;

const client = (id: string, first: string, extra: Record<string, unknown> = {}): Client =>
  ({ id, firstName: first, lastName: "Rohan", isActive: true, homeStudioId: "edoras", ...extra }) as unknown as Client;

const booking = (id: string, clientId: string, day: string, studioId = "edoras", hm = "10:00") =>
  ({ id, clientId, clientName: clientId, trainerId: "t-ber", studioId, startTime: eastern(day, hm), endTime: new Date(eastern(day, hm).getTime() + 30 * 60_000), status: "Scheduled" }) as unknown as ScheduleEntry;

/** Twice a week, Mondays and Thursdays, for `weeks` weeks before today. */
const twiceAWeek = (weeks: number, upTo = TODAY) => {
  const out: string[] = [];
  for (let w = 1; w <= weeks; w++) {
    const monday = addDays(upTo, -7 * w);
    out.push(monday, addDays(monday, 3));
  }
  return out.filter((d) => d < upTo).sort();
};

const input = (over: Partial<NightStudioInput> = {}): NightStudioInput => ({
  studioId: "edoras",
  today: TODAY,
  now: NOW,
  tz: TZ,
  studios: [{ id: "edoras", name: "Edoras", journeyCutoverDate: "2026-06-01" }],
  clients: [],
  snapshots: new Map(),
  bookingsByClient: new Map(),
  visitDaysByClient: new Map(),
  loggedDaysByClient: new Map(),
  loggedFrom: addDays(TODAY, -184),
  packageIndex: null,
  breakDays: 14,
  lines: APP_LINES,
  previous: new Map(),
  ...over,
});

describe("one studio's night", () => {
  // Éowyn: twice a week for twelve weeks, last in Thursday, nothing booked, twelve days out? No: steady.
  const eowyn = client("eowyn", "Éowyn");
  // Théodred: twice a week, but out since Thursday the 17th with nothing booked: drifting at twice his usual gap.
  const theodred = client("theodred", "Théodred");
  // Hama: last in the 10th, booked on Wednesday at another studio: Back, and the booking isn't here.
  const hama = client("hama", "Háma");
  // Gamling: inactive, and Grimbold, whose home is another studio: neither is this studio's.
  const gamling = client("gamling", "Gamling", { isActive: false });
  const grimbold = client("grimbold", "Grimbold", { homeStudioId: "helms-deep" });

  const visits = new Map<string, string[]>([
    ["eowyn", twiceAWeek(12)],
    ["theodred", twiceAWeek(12, "2026-09-21")],
    ["hama", twiceAWeek(12, "2026-09-11")],
  ]);
  const snapshots = new Map<string, RenewalSnapshot>([
    ["eowyn", snap({ lastVisitDate: "2026-09-24" })],
    ["theodred", snap({ lastVisitDate: "2026-09-17" })],
    ["hama", snap({ lastVisitDate: "2026-09-10", nextBookingDate: "2026-09-30" })],
  ]);
  const bookings = new Map<string, ScheduleEntry[]>([
    ["eowyn", [booking("b-eo", "eowyn", "2026-09-29")]],
    ["hama", [booking("b-ha", "hama", "2026-09-30", "helms-deep")]],
  ]);

  it("gives every active home client a state from the one rule, with her rhythm measured from her visits", () => {
    const night = nightStudio(input({ clients: [eowyn, theodred, hama, gamling, grimbold], snapshots, bookingsByClient: bookings, visitDaysByClient: visits }));
    expect([...night.states.keys()].sort()).toEqual(["eowyn", "hama", "theodred"]);
    const e = night.states.get("eowyn")!;
    expect(e).toMatchObject({ state: "steady", judged: true, lastVisit: "2026-09-24", nextBooked: "2026-09-29", nextBookedHere: true, was: null, since: TODAY });
    // Gaps of 3 and 4 days: the median of the last six.
    expect(e.usualGapDays).toBe(3.5);
    expect(e.rhythmGaps).toEqual([4, 3, 4, 3, 4, 3]);
    const t = night.states.get("theodred")!;
    expect(t.state).toBe("drifting");
    expect(t.crossed).toBe("twice-usual");
    // Last visit Thu Sep 17 plus the drift line (7 days): the day he crossed it.
    expect(t.since).toBe("2026-09-24");
    expect(t.reasons[0]).toBe("She usually trains every 3–4 days. It has been 11 days, and nothing is booked.");
    const h = night.states.get("hama")!;
    expect(h.state).toBe("back");
    expect(h.nextBookedHere).toBe(false);
    expect(night.summary).toMatchObject({ v: 1, asOf: TODAY, clients: 3, breakDays: 14, lines: APP_LINES });
    expect(night.summary.counts).toMatchObject({ steady: 1, drifting: 1, back: 1, lapsed: 0 });
  });

  it("carries since and was from last night, and moves them when the state moves", () => {
    const previous = new Map<string, ClientStateDoc>([
      ["eowyn", { ...stateDocOf(journeyOf({ active: true, snapshot: snap(), lastVisit: "2026-09-21", next: { state: "booked", day: "2026-09-24" }, quotableTotal: null, today: "2026-09-21", breakDays: 14, nightlyStale: false, lines: APP_LINES, rhythm: rhythmFromVisits(visits.get("eowyn")!, "2026-09-21") }), null, "2026-09-10", true), since: "2026-09-10" }],
      ["hama", { ...stateDocOf(journeyOf({ active: true, snapshot: snap(), lastVisit: "2026-09-10", next: { state: "none", day: null }, quotableTotal: null, today: "2026-09-27", breakDays: 14, nightlyStale: false, lines: APP_LINES }), null, "2026-09-24", false) }],
    ]);
    expect(previous.get("hama")!.state).toBe("at-risk");
    const night = nightStudio(input({ clients: [eowyn, hama], snapshots, bookingsByClient: bookings, visitDaysByClient: visits, previous }));
    // Steady last night too: since and was hold.
    expect(night.states.get("eowyn")).toMatchObject({ state: "steady", since: "2026-09-10", was: null });
    // At risk last night, booked again tonight: Back since today, was At risk.
    expect(night.states.get("hama")).toMatchObject({ state: "back", since: TODAY, was: "at-risk" });
  });

  it("holds a client to the studio's own lines", () => {
    const night = nightStudio(input({ clients: [theodred], snapshots, visitDaysByClient: visits, breakDays: 21, lines: { ...APP_LINES, driftMultiple: 5 } }));
    // Five times 3.5 days is 18, and the studio's At-risk line is 21: eleven days out is inside both.
    expect(night.states.get("theodred")!.state).toBe("steady");
    expect(night.summary.lines.driftMultiple).toBe(5);
  });

  it("names All stars by the Hub's rule, and only when Journey holds the whole window", () => {
    const logged = twiceAWeek(26);
    const whole = client("eomer", "Éomer", { historyIsComplete: true });
    const filemaker = client("elfhelm", "Elfhelm", { priorHistory: { sessions: 400, importedCount: 0, source: "filemaker", from: null, through: "2026-05-31" } });
    const unknown = client("erkenbrand", "Erkenbrand");
    const night = nightStudio(
      input({
        clients: [whole, filemaker, unknown],
        snapshots: new Map([["eomer", snap({ lastVisitDate: "2026-09-24" })], ["elfhelm", snap({ lastVisitDate: "2026-09-24" })], ["erkenbrand", snap({ lastVisitDate: "2026-09-24" })]]),
        loggedDaysByClient: new Map([["eomer", logged], ["elfhelm", logged], ["erkenbrand", logged]]),
      }),
    );
    // Éomer: every one of the 26 weeks, twice a week. Elfhelm's record before June is FileMaker's; Erkenbrand's is unknown.
    expect(night.allStars).toEqual([{ clientId: "eomer", weeksWithVisit: 26, perWeek: 2 }]);
  });

  it("writes Inactive, by herself past the line or a leader's mark, with which it is (Oct 1 2026)", () => {
    // Erkenbrand: last in June 20, nothing booked: past the 90-day line. Elfhelm: marked by a leader.
    const gone = client("erkenbrand", "Erkenbrand");
    const marked = client("elfhelm", "Elfhelm");
    const night = nightStudio(
      input({
        clients: [gone, marked, eowyn],
        snapshots: new Map([
          ["erkenbrand", snap({ lastVisitDate: "2026-06-20" })],
          ["elfhelm", snap({ lastVisitDate: "2026-09-10" })],
          ["eowyn", snap({ lastVisitDate: "2026-09-24" })],
        ]),
        bookingsByClient: bookings,
        visitDaysByClient: visits,
        marks: new Map([["elfhelm", { clientId: "elfhelm", reason: "moved", note: null, day: "2026-09-15", markedBy: { id: "uid-l", name: "Leader" }, markedAt: null }]]),
      }),
    );
    expect(night.states.get("erkenbrand")).toMatchObject({ state: "inactive", inactiveKind: "automatic", crossed: "inactive-line", since: "2026-09-18" });
    expect(night.states.get("elfhelm")).toMatchObject({ state: "inactive", inactiveKind: "manual", crossed: "marked", since: "2026-09-15" });
    expect(night.states.get("eowyn")!.inactiveKind).toBeNull();
    expect(night.summary.counts.inactive).toBe(2);
    // Read back: the kind survives, and a document from before the round reads as the line's own.
    expect(parseStateDoc(JSON.parse(JSON.stringify(night.states.get("elfhelm"))))!.inactiveKind).toBe("manual");
    expect(parseStateDoc({ state: "inactive", since: TODAY, reasons: ["a", "b"] })!.inactiveKind).toBe("automatic");
    expect(parseStateDoc({ state: "steady", since: TODAY, reasons: ["a", "b"], inactiveKind: "manual" })!.inactiveKind).toBeNull();
  });

  it("works out no All stars at all when the logged sessions couldn't be read", () => {
    const night = nightStudio(input({ clients: [eowyn], snapshots, loggedDaysByClient: null }));
    expect(night.allStars).toBeNull();
    expect(night.states.size).toBe(1);
  });
});

describe("the stored state", () => {
  const drifting: ClientJourney = journeyOf({
    active: true,
    snapshot: snap(),
    lastVisit: "2026-09-14",
    next: { state: "none", day: null },
    quotableTotal: null,
    today: TODAY,
    breakDays: 14,
    nightlyStale: false,
    lines: APP_LINES,
    rhythm: rhythmFromVisits(twiceAWeek(12, "2026-09-15"), TODAY),
  });

  it("reads back as the same journey the night worked out", () => {
    const d = stateDocOf(drifting, null, TODAY, false);
    const back = journeyOfDoc(parseStateDoc(JSON.parse(JSON.stringify(d)))!, TODAY, APP_LINES);
    expect(back).toEqual({ ...drifting, rhythm: { ...drifting.rhythm!, pacePerWeek: null } });
  });

  it("is written again only when something in it changed", () => {
    const a = stateDocOf(drifting, null, TODAY, false);
    expect(sameStateDoc(a, { ...a })).toBe(true);
    expect(sameStateDoc(a, { ...a, reasons: [a.reasons[0], "other proof"] })).toBe(false);
    expect(sameStateDoc(a, { ...a, nextBooked: "2026-10-01" })).toBe(false);
    expect(sameStateDoc(a, null)).toBe(false);
  });

  it("refuses a document it can't stand behind", () => {
    expect(parseStateDoc({ state: "floating", since: TODAY, reasons: ["a", "b"] })).toBeNull();
    expect(parseStateDoc({ state: "steady", since: "yesterday", reasons: ["a", "b"] })).toBeNull();
    expect(parseStateDoc({ state: "steady", since: TODAY, reasons: ["only one"] })).toBeNull();
  });

  it("trusts the summary only on its own day, with the studio's lines as they are now", () => {
    const s = parseSummary({ v: 1, asOf: TODAY, counts: { steady: 3 }, clients: 3, lines: APP_LINES, breakDays: 14, computedAt: NOW })!;
    expect(s.counts.steady).toBe(3);
    expect(s.counts.drifting).toBe(0);
    expect(summaryIsFresh(s, TODAY, APP_LINES, 14)).toBe(true);
    expect(summaryIsFresh(s, "2026-09-29", APP_LINES, 14)).toBe(false);
    expect(summaryIsFresh(s, TODAY, { ...APP_LINES, lapsedDays: 60 }, 14)).toBe(false);
    expect(summaryIsFresh(s, TODAY, APP_LINES, 21)).toBe(false);
    expect(summaryIsFresh(null, TODAY, APP_LINES, 14)).toBe(false);
    expect(parseSummary({ v: 2, asOf: TODAY })).toBeNull();
  });
});

describe("does the night still hold?", () => {
  const d = (over: Partial<ClientStateDoc> = {}): ClientStateDoc => ({ ...stateDocOf(journeyOf({ active: true, snapshot: snap(), lastVisit: "2026-09-24", next: { state: "booked", day: "2026-09-29" }, quotableTotal: null, today: TODAY, breakDays: 14, nightlyStale: false, lines: APP_LINES }), null, TODAY, true), ...over });
  const live = (lastVisit: string | null, next: { state: "booked" | "none" | "unknown"; day: string | null; source?: "held" | "nightly" | null }) => ({ lastVisit, next, horizonEnd: addDays(TODAY, 6) });

  it("holds while the page sees what the night saw, or less", () => {
    expect(nightStillHolds(d(), live("2026-09-24", { state: "booked", day: "2026-09-29", source: "held" }))).toBe(true);
    expect(nightStillHolds(d(), live(null, { state: "unknown", day: null }))).toBe(true);
    expect(nightStillHolds(d({ nextBooked: "2026-10-20" }), live("2026-09-24", { state: "booked", day: "2026-10-20", source: "nightly" }))).toBe(true);
  });

  it("gives way to a visit or a booking the night didn't have", () => {
    expect(nightStillHolds(d(), live(TODAY, { state: "booked", day: "2026-09-29", source: "held" }))).toBe(false);
    expect(nightStillHolds(d({ nextBooked: null, nextBookedHere: false }), live("2026-09-24", { state: "booked", day: "2026-09-30", source: "held" }))).toBe(false);
    expect(nightStillHolds(d(), live("2026-09-24", { state: "booked", day: "2026-09-28", source: "held" }))).toBe(false);
  });

  it("gives way when her booking here, inside the week the page reads, is gone — never over one it can't see", () => {
    expect(nightStillHolds(d(), live("2026-09-24", { state: "none", day: null }))).toBe(false);
    expect(nightStillHolds(d({ nextBookedHere: false }), live("2026-09-24", { state: "none", day: null }))).toBe(true);
    // The night's earlier booking was at another studio; the page sees the later one here.
    expect(nightStillHolds(d({ nextBookedHere: false }), live("2026-09-24", { state: "booked", day: "2026-10-02", source: "held" }))).toBe(true);
  });
});
