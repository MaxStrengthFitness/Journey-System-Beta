import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry, Trainer } from "../../../types";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { WatchlistEntry } from "../attention/attention";
import { listFor, shiftToday, stateCounts, studioJourneys, thisWeek, type StudioJourneysInput } from "./journey-list";

const TODAY = "2026-09-28"; // a Monday
const NOW = new Date("2026-09-28T13:00:00Z"); // 9 AM Eastern
const TZ = "America/New_York";
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

const snap = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  situation: "on-track",
  pacePerWeek: 2,
  proof: { weeksObserved: 12, weeksAttended: 12, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
  flags: [],
  lastVisitDate: "2026-09-26",
  nextBookingDate: null,
  awayUntil: null,
  awayReason: null,
  primaryTrainerId: "t-ber",
  focusDate: "2027-03-01",
  conversationDue: false,
  chargeWarning: false,
  renewalOnBooks: null,
  ...extra,
});

const client = (id: string, first: string, renewal: Record<string, unknown> | null, extra: Record<string, unknown> = {}): Client =>
  ({ id, firstName: first, lastName: "Took", isActive: true, homeStudioId: "westlake", ...(renewal ? { renewal: snap(renewal) } : {}), ...extra }) as unknown as Client;

const trainers = [
  { id: "t-ber", fullName: "Beregond Guard", primaryHomeStudioId: "westlake" },
  { id: "t-mab", fullName: "Mablung Ranger", primaryHomeStudioId: "westlake" },
] as unknown as Trainer[];

const booking = (id: string, clientId: string, trainerId: string, day: string, hm: string, status = "Scheduled") =>
  ({ id, clientId, clientName: clientId, trainerId, studioId: "westlake", startTime: eastern(day, hm), endTime: new Date(eastern(day, hm).getTime() + 30 * 60_000), status }) as unknown as ScheduleEntry;

const base = (clients: Client[], weekEntries: ScheduleEntry[] = [], watchlist = new Map<string, WatchlistEntry>()): StudioJourneysInput => ({
  clients,
  studioId: "westlake",
  today: TODAY,
  now: NOW,
  tz: TZ,
  studios: [{ id: "westlake", name: "Westlake", journeyCutoverDate: null }],
  weekEntries,
  weekReady: true,
  packageIndex: null,
  trainers,
  settings: DEFAULT_RENEWAL_SETTINGS,
  nightlyStale: false,
  watchlist,
});

describe("the studio's Journey", () => {
  const week = [
    booking("b1", "hamfast", "t-ber", TODAY, "11:00"),
    booking("b2", "rosie", "t-mab", "2026-10-01", "10:00"),
    booking("b3", "other", "t-ber", TODAY, "15:00"),
  ];
  const clients = [
    client("adelard", "Adelard", { lastVisitDate: "2026-09-18" }), // twice-a-week, 10 days, nothing booked: drifting
    client("mungo", "Mungo", { lastVisitDate: "2026-09-08", primaryTrainerId: "t-mab" }), // 20 days: at risk
    client("bungo", "Bungo", { lastVisitDate: "2026-08-10" }), // 49 days: lapsed
    client("rosie", "Rosie", { lastVisitDate: "2026-09-05", nextBookingDate: "2026-10-01" }), // booked again: back
    client("hamfast", "Hamfast", { conversationDue: true, focusDate: "2026-10-12" }), // steady, in the renewal window
    client("holman", "Holman", { pacePerWeek: null }, { sessionCount: 4, clientsNumberOfVisitsAtSite: 4 }), // new, quotable
    client("galdor", "Galdor", null), // no nightly record: unknown
    client("gone", "Gone", { lastVisitDate: "2026-09-26" }, { isActive: false }), // inactive: not on the Journey
    client("visitor", "Visitor", { lastVisitDate: "2026-09-26" }, { homeStudioId: "solon" }), // another studio's
  ];

  it("gives every active client of the studio one state, from what the page already holds", () => {
    const entries = studioJourneys(base(clients, week));
    const state = Object.fromEntries(entries.map((e) => [e.id, e.journey.state]));
    expect(state).toEqual({ adelard: "drifting", mungo: "at-risk", bungo: "lapsed", rosie: "back", hamfast: "steady", holman: "new", galdor: "unknown" });
    const counts = stateCounts(entries, "all");
    expect(counts.drifting).toBe(1);
    expect(counts.steady).toBe(1);
    expect(counts.away).toBe(0);
  });

  it("looks through a lens: the renewal window and the first 24 sessions", () => {
    const entries = studioJourneys(base(clients, week));
    expect(entries.filter((e) => e.inRenewalWindow).map((e) => e.id)).toEqual(["hamfast"]);
    expect(stateCounts(entries, "new").new).toBe(1);
    expect(stateCounts(entries, "new").drifting).toBe(0);
  });

  it("owns each case with her usual trainer, and says when that trainer is in today", () => {
    const entries = studioJourneys(base(clients, week));
    const adelard = entries.find((e) => e.id === "adelard")!;
    expect(adelard.usual).toEqual({ id: "t-ber", name: "Beregond Guard" });
    expect(adelard.usualInToday).toBe("11:00 AM – 3:30 PM");
    expect(adelard.case.nextStep).toContain("Beregond is in today");
    const mungo = entries.find((e) => e.id === "mungo")!;
    expect(mungo.usualInToday).toBeNull();
  });

  it("puts a client a leader already answered last, then the catchable, then the closest to the line", () => {
    const more = [...clients, client("estella", "Estella", { lastVisitDate: "2026-09-20", primaryTrainerId: "t-mab" }), client("halbarad", "Halbarad", { lastVisitDate: "2026-09-19" })];
    const watch = new Map<string, WatchlistEntry>([["halbarad", { clientId: "halbarad", snoozedUntil: "2026-10-05", dismissedAt: null, dismissedBy: null, dismissedByName: null, lastVisitAtDismissal: null, nextBookingAtDismissal: null }]]);
    const list = listFor(studioJourneys(base(more, week, watch)), "drifting", "all");
    // Adelard's trainer is in today; Estella's isn't; Halbarad is snoozed.
    expect(list.map((e) => e.id)).toEqual(["adelard", "estella", "halbarad"]);
  });

  it("calls nobody slipping when the week couldn't be read", () => {
    const entries = studioJourneys({ ...base(clients, week), weekReady: false });
    const adelard = entries.find((e) => e.id === "adelard")!;
    expect(adelard.journey.state).toBe("unknown");
    expect(adelard.journey.unknownWhy).toBe("bookings-unread");
  });

  it("this week: who crossed a line in the last seven days, and who booked again", () => {
    const w = thisWeek(studioJourneys(base(clients, week)), TODAY);
    expect(w.startedSlipping.map((e) => e.id)).toEqual(["adelard", "mungo"]);
    expect(w.back.map((e) => e.id)).toEqual(["rosie"]);
  });

  it("reads a trainer's shift from the day's bookings", () => {
    expect(shiftToday(week, trainers[0], TODAY, TZ)).toBe("11:00 AM – 3:30 PM");
    expect(shiftToday(week, null, TODAY, TZ)).toBeNull();
  });
});
