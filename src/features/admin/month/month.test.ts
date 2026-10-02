import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry, Trainer } from "../../../types";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { RenewalCycle } from "../../renewals/types";
import type { WatchlistEntry } from "../attention/attention";
import { studioJourneys, type StudioJourneysInput } from "../journey/journey-list";
import { APP_LINES } from "../journey/states";
import { byDay, dayWords, daysInMonth, dobKeyOf, firstDayOf, monthAnniversaries, monthBirthdays, monthLabel, monthMia, monthOf, monthRenewals, monthSentence, shiftMonth } from "./month";

const TODAY = "2026-09-29"; // a Tuesday
const TZ = "America/New_York";

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
  packageLabel: "Committed · 12 months",
  cycleKey: null,
  focusDate: "2027-03-01",
  chargeDate: "2027-03-01",
  chargeDateSource: "mindbody",
  sessionsLeft: 40,
  paymentMode: "monthly",
  autoRenews: false,
  conversationDue: false,
  chargeWarning: false,
  renewalOnBooks: null,
  ...extra,
});

const client = (id: string, first: string, extra: Record<string, unknown> = {}, renewal: Record<string, unknown> | null = null): Client =>
  ({ id, firstName: first, lastName: "Took", isActive: true, homeStudioId: "westlake", ...(renewal ? { renewal: snap(renewal) } : {}), ...extra }) as unknown as Client;

describe("months", () => {
  it("names, shifts and measures a month, reading day keys as calendar days", () => {
    expect(monthOf(TODAY)).toBe("2026-09");
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", -12)).toBe("2025-09");
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(dayWords("2026-10-06")).toBe("Tue, Oct 6");
  });

  it("reads a date of birth from its digits and refuses a day that doesn't exist", () => {
    expect(dobKeyOf("1956-03-14")).toBe("1956-03-14");
    expect(dobKeyOf("1956-03-14T00:00:00Z")).toBe("1956-03-14");
    expect(dobKeyOf("1956-02-30")).toBeNull();
    expect(dobKeyOf("")).toBeNull();
    expect(dobKeyOf(undefined)).toBeNull();
  });
});

describe("a month's renewals", () => {
  const cycles: Record<string, RenewalCycle> = {
    "c-frodo": { clientId: "frodo", clientName: "Frodo", cycleKey: "c-frodo", packageKey: null, lastTouchAt: new Date(), lastTouchByName: "Sam", latestLeaning: "leaning-yes" } as unknown as RenewalCycle,
    "c-lost": { clientId: "lotho", clientName: "Lotho", cycleKey: "c-lost", packageKey: null, lastTouchAt: new Date(), outcome: "lost" } as unknown as RenewalCycle,
  };
  const clients = [
    client("frodo", "Frodo", {}, { cycleKey: "c-frodo", focusDate: "2026-10-12", conversationDue: true, sessionsLeft: 8 }),
    client("sam", "Sam", {}, { cycleKey: "c-sam", focusDate: "2026-10-03", chargeWarning: true }),
    client("merry", "Merry", {}, { cycleKey: "c-merry", focusDate: "2026-10-20" }),
    client("pippin", "Pippin", {}, { cycleKey: "c-pippin", focusDate: "2026-10-25", renewalOnBooks: { cycleKey: "next", packageKey: null, startsOn: "2026-10-26" } }),
    client("lotho", "Lotho", {}, { cycleKey: "c-lost", focusDate: "2026-10-01", situation: "ended" }),
    client("bilbo", "Bilbo", {}, { cycleKey: "c-bilbo", focusDate: "2026-11-02" }),
    client("gollum", "Gollum", {}, { situation: "unknown", focusDate: null }),
    client("gone", "Gone", { isActive: false }, { focusDate: "2026-10-05" }),
    client("nosnap", "Nosnap"),
  ];

  it("lists every package ending in the month, soonest first, with the lane's word and the next step", () => {
    const r = monthRenewals(clients, "2026-10", cycles, DEFAULT_RENEWAL_SETTINGS, TODAY, true);
    expect(r.rows.map((x) => [x.name, x.day, x.badge])).toEqual([
      ["Lotho Took", "2026-10-01", "Lost"],
      ["Sam Took", "2026-10-03", "Before the charge"],
      ["Frodo Took", "2026-10-12", "Talk now"],
      ["Merry Took", "2026-10-20", "Coming up"],
      ["Pippin Took", "2026-10-25", "Renewed"],
    ]);
    const frodo = r.rows.find((x) => x.clientId === "frodo")!;
    expect(frodo.tone).toBe("alert");
    expect(frodo.proof).toContain("Committed · 12 months ends Mon, Oct 12.");
    expect(frodo.proof).toContain("Last talked to by Sam — leaning yes.");
    expect(r.rows.find((x) => x.clientId === "sam")!.proof).toContain("Nobody has talked to them yet.");
    // Merry and Sam: nobody has talked; Frodo has been talked to; Pippin is renewed and Lotho decided.
    expect(r.notTalked).toBe(2);
  });

  it("counts a client whose renewal timing is unknown rather than dropping her, and never says 'nobody has talked' off a failed read", () => {
    const r = monthRenewals(clients, "2026-10", {}, DEFAULT_RENEWAL_SETTINGS, TODAY, false);
    expect(r.unknown).toBe(1);
    expect(r.notTalked).toBeNull();
    expect(r.rows.find((x) => x.clientId === "sam")!.proof).toContain("couldn't be read just now");
    expect(monthRenewals(clients, "2026-11", {}, DEFAULT_RENEWAL_SETTINGS, TODAY, true).rows.map((x) => x.name)).toEqual(["Bilbo Took"]);
  });
});

describe("a month's birthdays", () => {
  it("lists who turns what, on which day, and marks a decade", () => {
    const b = monthBirthdays(
      [
        client("rosie", "Rosie", { dateOfBirth: "1956-10-14" }),
        client("sam", "Sam", { dateOfBirth: "1961-10-02" }),
        client("nodob", "Nodob"),
        client("gone", "Gone", { dateOfBirth: "1950-10-01", isActive: false }),
        client("march", "March", { dateOfBirth: "1970-03-03" }),
      ],
      "2026-10",
    );
    expect(b.rows.map((r) => [r.name, r.day, r.badge, r.sentence])).toEqual([
      ["Sam Took", "2026-10-02", "Birthday", "Turns 65 on Fri, Oct 2."],
      ["Rosie Took", "2026-10-14", "Turns 70", "Turns 70 on Wed, Oct 14."],
    ]);
    expect(b.rows[1].tone).toBe("warn");
    expect(b.noDate).toBe(1);
  });

  it("puts a Feb 29 birthday on Feb 28 in a year without one", () => {
    const b = monthBirthdays([client("leap", "Leap", { dateOfBirth: "1960-02-29" })], "2026-02");
    expect(b.rows[0].day).toBe("2026-02-28");
    expect(monthBirthdays([client("leap", "Leap", { dateOfBirth: "1960-02-29" })], "2028-02").rows[0].day).toBe("2028-02-29");
  });
});

describe("a month's anniversaries", () => {
  it("counts whole years from the day a person set, and holds a Mindbody date back until it is confirmed (Oct 2 2026)", () => {
    const a = monthAnniversaries(
      [
        client("frodo", "Frodo", { firstStudioDay: "2019-10-06", firstAppointmentDate: "2020-01-15T15:00:00Z" }),
        client("sam", "Sam", { firstAppointmentDate: "2024-10-20T15:00:00Z" }),
        client("bilbo", "Bilbo", { createdAt: "2025-10-01T15:00:00Z" }),
        client("merry", "Merry", { firstStudioDay: "2026-10-03" }),
        client("pippin", "Pippin", { firstStudioDay: "2018-03-03" }),
      ],
      "2026-10",
      null,
      TZ,
    );
    // Sam's day is Mindbody's first appointment, not yet confirmed: counted, not celebrated.
    expect(a.rows.map((r) => [r.name, r.day, r.badge, r.tone])).toEqual([["Frodo Took", "2026-10-06", "7 years", "info"]]);
    expect(a.rows[0].proof).toBe("First day Sun, Oct 6, 2019 — set on their profile.");
    expect(a.guessed).toBe(1);
    // Bilbo's only date is Journey's own: no anniversary can be said, and he is counted.
    expect(a.noDate).toBe(1);
  });

  it("reads a stated first day as a calendar day, never through the zone", () => {
    expect(firstDayOf(client("f", "F", { firstStudioDay: "2019-10-06" }), null, TZ)).toEqual({ day: "2019-10-06", source: "stated", confirmed: true });
    expect(firstDayOf(client("f", "F", { firstAppointmentDate: "2019-10-06" }), null, TZ)?.day).toBe("2019-10-06");
  });
});

describe("the MIA list", () => {
  const trainers = [{ id: "t-ber", fullName: "Beregond Guard", primaryHomeStudioId: "westlake" }] as unknown as Trainer[];
  const base = (clients: Client[]): StudioJourneysInput => ({
    clients,
    studioId: "westlake",
    today: "2026-09-28",
    now: new Date("2026-09-28T13:00:00Z"),
    tz: TZ,
    studios: [{ id: "westlake", name: "Westlake", journeyCutoverDate: null }],
    weekEntries: [] as ScheduleEntry[],
    weekReady: true,
    packageIndex: null,
    trainers,
    settings: DEFAULT_RENEWAL_SETTINGS,
    nightlyStale: false,
    lines: APP_LINES,
    watchlist: new Map<string, WatchlistEntry>([["bungo", { clientId: "bungo", snoozedUntil: "2026-10-05", dismissedAt: null } as unknown as WatchlistEntry]]),
  });

  it("is the Journey's own rule: Drifting first, then At risk, then Lapsed, the most recently crossed first, and the unjudged counted", () => {
    const entries = studioJourneys(
      base([
        client("adelard", "Adelard", {}, { lastVisitDate: "2026-09-18" }), // drifting
        client("mungo", "Mungo", {}, { lastVisitDate: "2026-09-08" }), // at risk
        client("bungo", "Bungo", {}, { lastVisitDate: "2026-08-10" }), // lapsed, snoozed
        client("hamfast", "Hamfast", {}, {}), // steady
        client("galdor", "Galdor"), // unknown
      ]),
    );
    const m = monthMia(entries, "2026-09-28");
    expect(m.rows.map((r) => [r.name, r.badge])).toEqual([
      ["Adelard Took", "Drifting"],
      ["Mungo Took", "At risk"],
      ["Bungo Took", "Lapsed"],
    ]);
    expect(m.counts).toEqual({ drifting: 1, "at-risk": 1, lapsed: 1 });
    expect(m.unknown).toBe(1);
    expect(m.rows[2].proof).toContain("snoozed");
    expect(m.rows[0].proof).toContain("usually with Beregond Guard");
    expect(m.wentInactive).toBe(0);
  });

  it("keeps Inactive off the MIA list, and counts who went inactive in the month shown (Oct 1 2026)", () => {
    const entries = studioJourneys(
      base([
        client("lobelia", "Lobelia", {}, { lastVisitDate: "2026-06-20" }), // past the 90-day line on Sep 18
        client("otho", "Otho", {}, { lastVisitDate: "2026-05-01" }), // past it on Jul 30
      ]),
    );
    expect(entries.map((e) => e.journey.state)).toEqual(["inactive", "inactive"]);
    const m = monthMia(entries, "2026-09-28");
    expect(m.rows).toEqual([]);
    expect(m.wentInactive).toBe(1);
    expect(monthMia(entries, "2026-09-28", "2026-07").wentInactive).toBe(1);
  });
});

describe("the month in one sentence, and the days", () => {
  it("says what the month has, in the right tense, and whether the MIA list is ready", () => {
    const empty = { rows: [], unknown: 0, notTalked: 0 };
    const i = { month: "2026-10", today: TODAY, renewals: { rows: [1, 2] as never, unknown: 0, notTalked: 0 }, birthdays: { rows: [1] as never, noDate: 0 }, anniversaries: { ...empty, guessed: 0, noDate: 0 }, mia: null };
    expect(monthSentence(i)).toBe("October will have 2 renewals, 1 birthday and 0 anniversaries. The MIA list is still being worked out.");
    expect(monthSentence({ ...i, month: "2026-09", mia: { rows: [1, 2, 3] as never, counts: { drifting: 1, "at-risk": 1, lapsed: 1 }, unknown: 2, wentInactive: 0 } })).toBe(
      "September has 2 renewals, 1 birthday and 0 anniversaries. 3 clients are MIA today, and 2 can't be judged yet.",
    );
    expect(monthSentence({ ...i, month: "2026-08", mia: { rows: [1] as never, counts: { drifting: 1, "at-risk": 0, lapsed: 0 }, unknown: 0, wentInactive: 0 } })).toContain("August had");
    expect(monthSentence({ ...i, month: "2026-08", mia: { rows: [1] as never, counts: { drifting: 1, "at-risk": 0, lapsed: 0 }, unknown: 0, wentInactive: 0 } })).toContain("1 client is MIA today.");
  });

  it("groups rows by day in day order", () => {
    const row = (key: string, day: string) => ({ key, clientId: key, name: key, day, sentence: "", proof: "", badge: "", tone: "info" as const });
    expect(byDay([row("b", "2026-10-09"), row("a", "2026-10-02"), row("c", "2026-10-09")]).map((g) => [g.day, g.rows.map((r) => r.key)])).toEqual([
      ["2026-10-02", ["a"]],
      ["2026-10-09", ["b", "c"]],
    ]);
  });
});
