import { describe, it, expect } from "vitest";
import {
  ENGINE_VERSION,
  buildRenewalSnapshot,
  computePace,
  mindbodyDayKey,
  pickContracts,
  primaryTrainerOf,
  sameSnapshot,
  type AttendanceRow,
  type RenewalEngineInput,
} from "./engine";
import { addDays } from "../client-history/model";
import { buildPackageNameIndex, DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { Client, MindbodyContract, MindbodyService } from "../../types";
import type { RenewalSettings } from "./types";

const TODAY = "2026-09-11";
const SYNCED = "synced";

/** Plain "YYYY-MM-DD" stands in for a Timestamp: mindbodyDayKey reads both. */
function contract(over: Partial<MindbodyContract> & { id: number }): MindbodyContract {
  const { id, ...rest } = over;
  return { clientContractId: id, status: "Active", contractName: "Committed 12 Month EFT", ...rest };
}

function service(id: number, name: string, remaining: number, over: Partial<MindbodyService> = {}): MindbodyService {
  return { serviceId: id, name, count: 8, remaining, activeDate: "2026-08-14", ...over };
}

function client(over: Partial<Client> = {}): Client {
  return {
    id: "c1",
    firstName: "Mary",
    lastName: "Smith",
    homeStudioId: "solon",
    height: "",
    isActive: true,
    remainingSessions: 0,
    mindbodyCommercialSyncedAt: SYNCED,
    mindbodyServicesSyncedAt: SYNCED,
    ...over,
  } as Client;
}

/** Visits spread evenly at `perWeek`, from `from` up to and including today. */
function visitsAt(perWeek: number, from: string, to = TODAY, trainerId = "t1"): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  const step = 7 / perWeek;
  for (let i = 0; ; i++) {
    const day = addDays(from, Math.floor(i * step));
    if (day > to) break;
    out.push({ day, kind: "visit", trainerId });
  }
  return out;
}

function booked(...days: string[]): AttendanceRow[] {
  return days.map((day) => ({ day, kind: "booked" as const }));
}

function input(over: Partial<RenewalEngineInput> & { client: Client }): RenewalEngineInput {
  return {
    settings: DEFAULT_RENEWAL_SETTINGS,
    today: TODAY,
    attendance: [],
    attendanceSince: "2026-06-01",
    ...over,
  };
}

// A Committed package whose billing ends 8 weeks from today.
const CHARGE = addDays(TODAY, 56); // 2026-11-06
const START = addDays(CHARGE, -(12 * 28 - 1));

describe("mindbodyDayKey", () => {
  it("reads a Mindbody date on the UTC calendar, never shifting the day", () => {
    expect(mindbodyDayKey(new Date("2026-11-14T00:00:00Z"))).toBe("2026-11-14");
    expect(mindbodyDayKey({ toDate: () => new Date("2026-11-14T00:00:00Z") })).toBe("2026-11-14");
    expect(mindbodyDayKey("2026-11-14")).toBe("2026-11-14");
    expect(mindbodyDayKey(null)).toBeNull();
  });
});

describe("the two clocks", () => {
  const monthly = (over: Partial<Client>, attendance: AttendanceRow[]) =>
    buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: {
            "9001": contract({
              id: 9001,
              startDate: START,
              endDate: CHARGE,
              upcomingAutopayEvents: [
                { scheduleDate: addDays(TODAY, 14), chargeAmount: 480 },
                { scheduleDate: addDays(TODAY, 42), chargeAmount: 480 },
              ],
            }),
          },
          ...over,
        }),
        attendance: [...attendance, ...booked(addDays(TODAY, 2))],
      }),
    );

  it("sees the collision: 1.5 visits a week banks sessions at the charge", () => {
    const snap = monthly(
      { mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 8), b: service(2, "96 Sessions - 2X Week", 12) } },
      visitsAt(1.5, "2026-06-01"),
    );
    expect(snap.packageKey).toBe("committed");
    expect(snap.paymentMode).toBe("monthly");
    expect(snap.chargeDate).toBe(CHARGE);
    expect(snap.chargeDateSource).toBe("mindbody");
    expect(snap.sessionsOnHand).toBe(20);
    expect(snap.paymentsLeft).toBe(2);
    // 20 on hand + 2 payments x 8.
    expect(snap.sessionsLeft).toBe(36);
    expect(snap.sessionsLeftSource).toBe("mindbody");
    expect(snap.pacePerWeek).toBe(1.5);
    // 8 weeks at 1.5 uses 12 of the 36.
    expect(snap.bankedAtCharge).toBe(24);
    expect(snap.situation).toBe("will-bank");
    // 56 days out: outside the default 30-day warning window.
    expect(snap.chargeWarning).toBe(false);
    expect(snap.focusDate).toBe(CHARGE);
  });

  it("warns inside the studio's window", () => {
    const settings: RenewalSettings = { ...DEFAULT_RENEWAL_SETTINGS, chargeWarnDays: 60 };
    const snap = buildRenewalSnapshot(
      input({
        settings,
        client: client({
          mindbodyContracts: { "9001": contract({ id: 9001, startDate: START, endDate: CHARGE, upcomingAutopayEvents: [] }) },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 20) },
        }),
        attendance: visitsAt(1, "2026-06-01"),
      }),
    );
    expect(snap.situation).toBe("will-bank");
    expect(snap.chargeWarning).toBe(true);
  });

  it("warns before the charge only when there may be one: Mindbody's auto-renew flag", () => {
    // Auto-renew is on at some studios and not at others (AJ, Sep 24 2026).
    const settings: RenewalSettings = { ...DEFAULT_RENEWAL_SETTINGS, chargeWarnDays: 60 };
    const withFlag = (isAutoRenewing: boolean | undefined) =>
      buildRenewalSnapshot(
        input({
          settings,
          client: client({
            mindbodyContracts: {
              "9001": contract({
                id: 9001,
                startDate: START,
                endDate: CHARGE,
                upcomingAutopayEvents: [],
                ...(isAutoRenewing === undefined ? {} : { isAutoRenewing }),
              }),
            },
            mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 20) },
          }),
          attendance: visitsAt(1, "2026-06-01"),
        }),
      );

    const renews = withFlag(true);
    expect(renews.autoRenews).toBe(true);
    expect(renews.chargeWarning).toBe(true);

    // Billing just ends: the sessions still bank, but nothing is charged on
    // top of them, so there is no "before the charge".
    const ends = withFlag(false);
    expect(ends.autoRenews).toBe(false);
    expect(ends.situation).toBe("will-bank");
    expect(ends.bankedAtCharge).toBe(renews.bankedAtCharge);
    expect(ends.chargeWarning).toBe(false);
    expect(ends.conversationDue).toBe(renews.conversationDue);

    // Mindbody hasn't said, the package is matched and the studio never
    // answered: the standard is ON (AJ, Sep 25 2026), so it warns — and says
    // the answer is the standard, not the studio's.
    const unknown = withFlag(undefined);
    expect(unknown.autoRenews).toBe(true);
    expect(unknown.autoRenewsFrom).toBe("default");
    expect(unknown.autoRenewsInherited).toEqual({ renews: true, from: "default" });
    expect(unknown.chargeWarning).toBe(true);
    expect(renews.autoRenewsFrom).toBe("mindbody");
    expect(ends.autoRenewsFrom).toBe("mindbody");
  });

  it("is on track at exactly twice a week", () => {
    const snap = monthly({ mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 0) } }, visitsAt(2, "2026-06-01"));
    expect(snap.sessionsLeft).toBe(16);
    expect(snap.bankedAtCharge).toBe(0);
    expect(snap.situation).toBe("on-track");
  });

  it("sees sessions running out well before billing ends at three a week", () => {
    const snap = monthly({ mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 0) } }, visitsAt(3, "2026-06-01"));
    expect(snap.pacePerWeek).toBe(3);
    expect(snap.runOutDate! < addDays(CHARGE, -14)).toBe(true);
    expect(snap.situation).toBe("will-run-out");
    expect(snap.focusDate).toBe(snap.runOutDate);
  });

  it("calls the conversation due at the studio's threshold", () => {
    const snap = monthly(
      {
        mindbodyContracts: {
          "9001": contract({ id: 9001, startDate: START, endDate: CHARGE, upcomingAutopayEvents: [] }),
        },
        mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 9) },
      },
      visitsAt(2, "2026-06-01"),
    );
    expect(snap.sessionsLeft).toBe(9);
    expect(snap.conversationDue).toBe(true);
  });
});

describe("auto-renew, decided in one place (AJ, Sep 25 2026)", () => {
  // A Committed client banking sessions, the charge inside a 60-day window.
  const build = (
    over: { settings?: Partial<RenewalSettings>; client?: Partial<Client>; contract?: Partial<MindbodyContract> } = {},
  ) =>
    buildRenewalSnapshot(
      input({
        settings: { ...DEFAULT_RENEWAL_SETTINGS, chargeWarnDays: 60, ...over.settings },
        client: client({
          mindbodyContracts: {
            "9001": contract({ id: 9001, startDate: START, endDate: CHARGE, upcomingAutopayEvents: [], ...over.contract }),
          },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 20) },
          ...over.client,
        }),
        attendance: visitsAt(1, "2026-06-01"),
      }),
    );
  const mark = (renews: boolean, contractId = "9001") => ({
    autoRenewMark: { renews, contractId, setAt: "2026-09-10T15:00:00.000Z", setById: "uid-aj", setByName: "AJ" },
  });

  it("writes version 2", () => {
    expect(ENGINE_VERSION).toBe(2);
    expect(build().version).toBe(2);
  });

  it("at a studio switched OFF: billing just ends — still banks, no warning, the conversation as usual", () => {
    const on = build();
    const off = build({ settings: { packagesRenewAutomatically: false } });
    expect(off.autoRenews).toBe(false);
    expect(off.autoRenewsFrom).toBe("studio");
    expect(off.autoRenewsInherited).toEqual({ renews: false, from: "studio" });
    expect(off.situation).toBe("will-bank");
    expect(off.chargeWarning).toBe(false);
    expect(off.conversationDue).toBe(on.conversationDue);
    expect(on.chargeWarning).toBe(true);
  });

  it("lets a package's own answer win over the studio's", () => {
    const packages = DEFAULT_RENEWAL_SETTINGS.packages.map((p) =>
      p.key === "committed" ? { ...p, renewsAutomatically: true } : p,
    );
    const snap = build({ settings: { packagesRenewAutomatically: false, packages } });
    expect(snap.autoRenews).toBe(true);
    expect(snap.autoRenewsFrom).toBe("package");
    expect(snap.chargeWarning).toBe(true);
  });

  it("lets a trainer's mark on THIS contract win over the studio, and remembers the answer without it", () => {
    const snap = build({ settings: { packagesRenewAutomatically: true }, client: mark(false) });
    expect(snap.autoRenews).toBe(false);
    expect(snap.autoRenewsFrom).toBe("client");
    expect(snap.autoRenewsInherited).toEqual({ renews: true, from: "studio" });
    expect(snap.situation).toBe("will-bank");
    expect(snap.chargeWarning).toBe(false);
  });

  it("ignores a mark made on another contract", () => {
    const snap = build({ settings: { packagesRenewAutomatically: true }, client: mark(false, "1234") });
    expect(snap.autoRenews).toBe(true);
    expect(snap.autoRenewsFrom).toBe("studio");
    expect(snap.chargeWarning).toBe(true);
  });

  it("puts Mindbody's own flag over a trainer's mark: Mindbody owns contracts", () => {
    const snap = build({ contract: { isAutoRenewing: true }, client: mark(false) });
    expect(snap.autoRenews).toBe(true);
    expect(snap.autoRenewsFrom).toBe("mindbody");
    expect(snap.autoRenewsInherited).toEqual({ renews: true, from: "mindbody" });
  });

  it("gives a contract the table doesn't recognise no answer, even at a studio that is ON", () => {
    const snap = build({
      settings: { packagesRenewAutomatically: true },
      client: { mindbodyServices: { a: service(1, "10 Pack", 20, { count: 10 }) } },
    });
    expect(snap.packageKey).toBeNull();
    expect(snap.autoRenews).toBeNull();
    expect(snap.autoRenewsFrom).toBeNull();
    expect(snap.autoRenewsInherited).toBeNull();
    expect(snap.situation).toBe("unknown");
    expect(snap.chargeWarning).toBe(false);
    // A mark answers it.
    const marked = build({
      settings: { packagesRenewAutomatically: true },
      client: { mindbodyServices: { a: service(1, "10 Pack", 20, { count: 10 }) }, ...mark(true) },
    });
    expect(marked.autoRenews).toBe(true);
    expect(marked.autoRenewsFrom).toBe("client");
    expect(marked.autoRenewsInherited).toBeNull();
  });

  it("claims no renewal under a coach's paid-in-full or banked-sessions lock over a running contract", () => {
    const lock = (payment: "pif" | "sessions-only" | "monthly") => ({
      contractTierOverride: { term: 12 as const, payment, setAt: "2026-09-10T15:00:00.000Z", setByName: "AJ" },
    });
    for (const payment of ["pif", "sessions-only"] as const) {
      // Mindbody's flag and a mark included: the lock is there because Mindbody's reading is wrong for her.
      const snap = build({ contract: { isAutoRenewing: true }, client: { ...lock(payment), ...mark(true) } });
      expect(snap.paymentMode, payment).toBe("monthly");
      expect(snap.autoRenews, payment).toBeNull();
      expect(snap.autoRenewsFrom, payment).toBeNull();
      // The answer without her lock or her mark: what renewalOf rebuilds from once the lock comes off.
      expect(snap.autoRenewsInherited, payment).toEqual({ renews: true, from: "mindbody" });
      // No "Auto-renews" claim, and no "before the charge" warning: nothing bills, so no charge is coming.
      expect(snap.situation, payment).toBe("will-bank");
      expect(snap.chargeWarning, payment).toBe(false);
    }
    const studioOn = build({ settings: { packagesRenewAutomatically: true }, client: lock("pif") });
    expect(studioOn.autoRenews).toBeNull();
    expect(studioOn.autoRenewsInherited).toEqual({ renews: true, from: "studio" });
    expect(studioOn.chargeWarning).toBe(false);
    // A monthly lock still bills: the order as ever, and its warning.
    const monthly = build({ client: lock("monthly") });
    expect(monthly.autoRenewsFrom).toBe("default");
    expect(monthly.chargeWarning).toBe(true);
  });

  it("never brings a warning back under a lock where Mindbody, the studio, the package or a mark said no", () => {
    const pif = {
      contractTierOverride: { term: 12 as const, payment: "pif" as const, setAt: "2026-09-10T15:00:00.000Z", setByName: "AJ" },
    };
    const noPackage = DEFAULT_RENEWAL_SETTINGS.packages.map((p) =>
      p.key === "committed" ? { ...p, renewsAutomatically: false } : p,
    );
    const cases: Array<[string, Parameters<typeof build>[0]]> = [
      ["Mindbody no", { contract: { isAutoRenewing: false } }],
      ["studio OFF", { settings: { packagesRenewAutomatically: false } }],
      ["package no", { settings: { packages: noPackage } }],
      ["mark no", { client: mark(false) }],
    ];
    for (const [name, over] of cases) {
      // Without the lock: the "no" switches the warning off.
      const bare = build(over);
      expect(bare.autoRenews, name).toBe(false);
      expect(bare.chargeWarning, name).toBe(false);
      // With it: no answer, and still no warning.
      const locked = build({ ...over, client: { ...over?.client, ...pif } });
      expect(locked.autoRenews, name).toBeNull();
      expect(locked.situation, name).toBe("will-bank");
      expect(locked.chargeWarning, name).toBe(false);
    }
  });

  it("says nothing of auto-renew for a package paid in full, whatever a mark says", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: {},
          mindbodyServices: { a: service(1, "144 PIF", 100, { count: 144 }) },
          ...mark(false),
        }),
        attendance: visitsAt(2, "2026-06-01"),
      }),
    );
    expect(snap.paymentMode).toBe("prepaid");
    expect(snap.autoRenews).toBeNull();
    expect(snap.autoRenewsFrom).toBeNull();
    expect(snap.autoRenewsInherited).toBeNull();
  });
});

describe("where the numbers come from", () => {
  it("estimates the charge date from the last scheduled payment when Mindbody has no end date", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: {
            "1": contract({
              id: 1,
              startDate: START,
              upcomingAutopayEvents: [{ scheduleDate: "2026-10-09", chargeAmount: 480 }],
            }),
          },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 4) },
        }),
      }),
    );
    expect(snap.chargeDate).toBe(addDays("2026-10-09", 27));
    expect(snap.chargeDateSource).toBe("estimate");
  });

  it("estimates payments left from the dates, and says so, when Mindbody sent no schedule", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: { "1": contract({ id: 1, startDate: START, endDate: CHARGE }) },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 4) },
        }),
        attendance: visitsAt(2, "2026-06-01"),
      }),
    );
    // Payments fall every 28 days from the start; two are still to come.
    expect(snap.paymentsLeft).toBe(2);
    expect(snap.sessionsLeft).toBe(4 + 16);
    expect(snap.sessionsLeftSource).toBe("estimate");
  });

  it("counts complimentary sessions but not an unrecognized pricing option — and says which", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyServices: {
            a: service(1, "144 PIF", 20, { count: 144 }),
            b: service(2, "Session Comp", 2, { count: 2 }),
            c: service(3, "10 Pack", 6, { count: 10 }),
          },
        }),
      }),
    );
    expect(snap.sessionsOnHand).toBe(22);
    expect(snap.dataGaps.join(" ")).toContain('"10 Pack" (6 sessions)');
  });

  describe("given (comp) sessions count toward the renewal (AJ, Oct 2 2026: \"Yes, count them in\")", () => {
    it("holds the conversation while the given sessions keep her above the threshold", () => {
      // 6 left in the contract alone would be due (threshold 10); +12 given is 18.
      const snap = buildRenewalSnapshot(
        input({
          client: client({
            mindbodyServices: {
              a: service(1, "144 PIF", 6, { count: 144 }),
              b: service(2, "Session Comp", 12, { count: 12 }),
            },
          }),
          attendance: visitsAt(2, "2026-06-01"),
        }),
      );
      expect(snap.sessionsLeft).toBe(18);
      expect(snap.conversationDue).toBe(false);
    });

    it("comes due once the package and the given sessions together are at the threshold", () => {
      const snap = buildRenewalSnapshot(
        input({
          client: client({
            mindbodyServices: {
              a: service(1, "144 PIF", 4, { count: 144 }),
              b: service(2, "Session Comp", 3, { count: 3 }),
            },
          }),
          attendance: visitsAt(2, "2026-06-01"),
        }),
      );
      expect(snap.sessionsLeft).toBe(7);
      expect(snap.conversationDue).toBe(true);
    });

    it("is not 'ended' while she still holds given sessions after her package is spent", () => {
      const snap = buildRenewalSnapshot(
        input({
          client: client({
            mindbodyServices: {
              a: service(1, "144 PIF", 0, { count: 144 }),
              b: service(2, "Session Comp", 12, { count: 12 }),
            },
          }),
          attendance: visitsAt(2, "2026-06-01"),
        }),
      );
      expect(snap.situation).not.toBe("ended");
      expect(snap.situation).not.toBe("lapsed");
      expect(snap.sessionsLeft).toBe(12);
      expect(snap.conversationDue).toBe(false);
    });

    it("still ends when the package and the given sessions are both used", () => {
      const snap = buildRenewalSnapshot(
        input({
          client: client({
            mindbodyServices: {
              a: service(1, "144 PIF", 0, { count: 144 }),
              b: service(2, "Session Comp", 0, { count: 12 }),
            },
          }),
          attendance: visitsAt(2, "2026-06-01"),
        }),
      );
      expect(["ended", "lapsed"]).toContain(snap.situation);
    });
  });

  it("counts a late cancel as a session used in the pace, never as a visit (Atlas answers, Oct 2 2026)", () => {
    const base = {
      client: client({ mindbodyServices: { a: service(1, "144 PIF", 40, { count: 144 }) } }),
      attendanceSince: "2026-07-01",
    };
    const visits = visitsAt(1, "2026-07-20");
    const plain = buildRenewalSnapshot(input({ ...base, attendance: visits }));
    // The same weeks with a late cancel between each visit: twice the sessions used.
    const lateCancels: AttendanceRow[] = visits.map((v) => ({ day: addDays(v.day, 3), kind: "no-show" as const })).filter((r) => r.day <= TODAY);
    const withLate = buildRenewalSnapshot(input({ ...base, attendance: [...visits, ...lateCancels] }));
    expect(withLate.pacePerWeek!).toBeGreaterThan(plain.pacePerWeek!);
    // ...and the last VISIT is still the last visit.
    expect(withLate.lastVisitDate).toBe(plain.lastVisitDate);
  });

  it("flags sessions on a pricing option Mindbody shows as expired", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyServices: { a: service(1, "144 PIF", 12, { count: 144, expirationDate: "2026-08-01" }) },
        }),
      }),
    );
    const flag = snap.flags.find((f) => f.code === "expired-sessions");
    expect(flag?.text).toContain("12 sessions");
    expect(flag?.text).toContain("Aug 1");
  });

  it("says what is missing instead of guessing", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({ mindbodyCommercialSyncedAt: undefined, mindbodyServicesSyncedAt: undefined }),
      }),
    );
    expect(snap.situation).toBe("unknown");
    expect(snap.sessionsLeft).toBeNull();
    expect(snap.dataGaps[0]).toContain("Nothing has been pulled from Mindbody");
  });

  it("names an unrecognized contract", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: { "1": contract({ id: 1, contractName: "Mystery EFT", startDate: START, endDate: CHARGE }) },
          mindbodyServices: {},
        }),
      }),
    );
    expect(snap.situation).toBe("unknown");
    expect(snap.dataGaps.join(" ")).toContain('"Mystery EFT"');
  });
});

describe("paid in full", () => {
  it("runs on the session clock alone", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({ mindbodyServices: { a: service(1, "144 PIF", 9, { count: 144, activeDate: "2025-04-01" }) } }),
        attendance: visitsAt(2, "2026-06-01"),
      }),
    );
    expect(snap.paymentMode).toBe("prepaid");
    expect(snap.packageLabel).toBe("Life Transformed · 18 months · paid in full");
    expect(snap.chargeDate).toBeNull();
    expect(snap.sessionsLeft).toBe(9);
    expect(snap.conversationDue).toBe(true);
    expect(snap.situation).toBe("on-track");
    expect(snap.focusDate).toBe(snap.runOutDate);
    expect(snap.cycleKey).toBe("pif-1");
  });

  it("has ended once the last session is used", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({ mindbodyServices: { a: service(1, "144 PIF", 0, { count: 144 }) } }),
        attendance: visitsAt(2, "2026-06-01", "2026-09-01"),
      }),
    );
    expect(snap.situation).toBe("ended");
    expect(snap.focusDate).toBe(snap.lastVisitDate);
  });
});

describe("after billing ends", () => {
  it("is still a live package while banked sessions remain", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: { "1": contract({ id: 1, startDate: "2025-08-15", endDate: "2026-08-01" }) },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 12) },
        }),
        attendance: visitsAt(1.5, "2026-06-01"),
      }),
    );
    expect(snap.paymentMode).toBe("sessions-only");
    expect(snap.situation).toBe("on-track");
    expect(snap.sessionsLeft).toBe(12);
  });

  it("is 'ended' inside the studio's lost window and 'lapsed' after it", () => {
    const ended = (end: string) =>
      buildRenewalSnapshot(
        input({
          client: client({
            mindbodyContracts: { "1": contract({ id: 1, startDate: "2025-09-01", endDate: end }) },
            mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 0) },
          }),
          attendance: visitsAt(2, "2026-06-01", end),
        }),
      );
    expect(ended("2026-09-01").situation).toBe("ended");
    expect(ended("2026-09-01").focusDate).toBe("2026-09-01");
    expect(ended("2026-07-01").situation).toBe("lapsed");
  });

  it("never calls someone lapsed while they keep coming in", () => {
    // The contract ended Jun 1; they still train twice a week on something
    // the package table doesn't know.
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: { "1": contract({ id: 1, startDate: "2025-06-01", endDate: "2026-06-01" }) },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 0) },
        }),
        attendance: visitsAt(2, "2026-06-01"),
      }),
    );
    expect(snap.situation).toBe("ended");
    expect(snap.focusDate).toBe(snap.lastVisitDate);
  });

  it("says 'not enough data' rather than ended when unmatched sessions are on hand", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: { "1": contract({ id: 1, startDate: "2025-06-01", endDate: "2026-06-01" }) },
          mindbodyServices: {
            a: service(1, "96 Sessions - 2X Week", 0),
            b: service(2, "144 Sessions PIF Special", 100, { count: 144 }),
          },
        }),
        attendance: [],
      }),
    );
    expect(snap.situation).toBe("unknown");
    expect(snap.dataGaps.join(" ")).toContain("144 Sessions PIF Special");
  });

  it("remembers a last visit older than the job's window", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({ mindbodyServices: { a: service(1, "144 PIF", 0, { count: 144 }) } }),
        attendance: [],
        lastVisitHint: "2026-05-01",
      }),
    );
    expect(snap.lastVisitDate).toBe("2026-05-01");
    // Used up May 1, more than 30 days ago: the win-back list, not "unknown".
    expect(snap.situation).toBe("lapsed");
    expect(snap.focusDate).toBe("2026-05-01");
  });

  it("keeps a due paid-in-full client in the pipeline with no pace to project from", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({ mindbodyServices: { a: service(1, "144 PIF", 5, { count: 144, activeDate: "2025-04-01" }) } }),
        attendance: [],
        lastVisitHint: "2026-07-01",
      }),
    );
    expect(snap.conversationDue).toBe(true);
    expect(snap.runOutDate).toBeNull();
    expect(snap.focusDate).toBe("2026-07-01");
  });

  it("treats a renewal already on the books as the package", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: {
            "1": contract({ id: 1, startDate: "2025-09-12", endDate: "2026-09-10" }),
            "2": contract({ id: 2, startDate: "2026-09-13", endDate: "2027-08-14" }),
          },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 3) },
        }),
        attendance: visitsAt(2, "2026-06-01"),
      }),
    );
    expect(snap.situation).not.toBe("ended");
    expect(snap.clientContractId).toBe("2");
    expect(snap.chargeDate).toBe("2027-08-14");
    expect(snap.pacePerWeek).toBe(2);
  });
});

describe("away time", () => {
  it("pauses a snowbird, even one whose package has ended", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          events: [{ id: "e1", type: "Snowbird", title: "Florida", date: "2026-09-01", endDate: "2027-04-01" } as any],
          mindbodyContracts: { "1": contract({ id: 1, startDate: "2025-08-01", endDate: "2026-07-01" }) },
          mindbodyServices: {},
        }),
      }),
    );
    expect(snap.situation).toBe("away");
    expect(snap.awayUntil).toBe("2027-04-01");
    expect(snap.awayReason).toBe("Snowbird");
    expect(snap.flags.some((f) => f.code === "no-future-booking")).toBe(false);
  });

  it("reads the profile's MIA pause as away", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          retentionMeta: { excludedFromMIA: true, excludedReason: "Surgery", autoIncludeAfter: "2026-12-01" },
        }),
      }),
    );
    expect(snap.situation).toBe("away");
    expect(snap.awayUntil).toBe("2026-12-01");
    expect(snap.awayReason).toBe("Surgery");
  });

  it("leaves away days out of the pace", () => {
    const visits = visitsAt(2, "2026-06-01", "2026-08-13");
    const away = [{ from: "2026-08-14", to: "2026-09-10", reason: "Vacation" }];
    const pace = computePace({
      visitDays: visits.map((v) => v.day),
      today: TODAY,
      attendanceSince: "2026-06-01",
      billingStart: null,
      away,
      pauseDuringAway: true,
    });
    expect(pace.perWeek).toBe(2);
  });
});

describe("pace", () => {
  it("says nothing below three weeks of observable time", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({ mindbodyServices: { a: service(1, "144 PIF", 50, { count: 144 }) } }),
        attendance: visitsAt(2, addDays(TODAY, -10)),
        attendanceSince: addDays(TODAY, -10),
      }),
    );
    expect(snap.pacePerWeek).toBeNull();
    expect(snap.runOutDate).toBeNull();
  });

  it("never reaches back before the studio's bookings were synced", () => {
    const pace = computePace({
      visitDays: visitsAt(2, "2026-08-01").map((v) => v.day),
      today: TODAY,
      attendanceSince: "2026-08-01",
      billingStart: null,
      away: [],
      pauseDuringAway: true,
    });
    expect(pace.windowStart).toBe("2026-08-01");
    expect(pace.perWeek).toBe(2);
  });
});

describe("flags", () => {
  it("carries its evidence in the sentence", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          mindbodyContracts: {
            "1": contract({ id: 1, startDate: "2026-01-02", endDate: "2026-12-03", autopayStatus: "Suspended" }),
          },
          mindbodyServices: { a: service(1, "96 Sessions - 2X Week", 10) },
          subjectiveSnapshot: {
            reportId: "r",
            date: "2025-11-20",
            overallStatus: "yellow",
            overallPercent: 0.6,
            proteinStatus: null,
            hydrationStatus: null,
            redCategories: ["sleepRecovery"],
            flags: [],
          } as any,
        }),
        attendance: [
          ...visitsAt(2, "2026-06-01", "2026-08-20"),
          { day: "2026-08-25", kind: "cancelled" },
          { day: "2026-09-01", kind: "no-show" },
        ],
        sessionFeel: [
          { day: "2026-08-20", clientFeel: "Wiped Out" },
          { day: "2026-08-18", energyLevel: "low" },
          { day: "2026-08-13", clientFeel: "Good" },
        ],
      }),
    );
    const byCode = Object.fromEntries(snap.flags.map((f) => [f.code, f.text]));
    expect(byCode["autopay-suspended"]).toBe("Autopay is suspended in Mindbody.");
    expect(byCode["no-future-booking"]).toContain("Nothing booked");
    expect(byCode["missed-sessions"]).toBe("2 cancellations or no-shows in the last 30 days.");
    expect(byCode["on-break"]).toContain("No visit in 22 days");
    expect(byCode["rough-patch"]).toContain("2 of the last 3");
    expect(byCode["check-in-red"]).toContain("Sleep & Recovery");
    // The only check-in predates this package, which began in January.
    expect(byCode["no-report-this-cycle"]).toBeDefined();
  });
});

describe("proof", () => {
  it("counts weeks attended and machines improved, with minimum samples", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          machineStats: {
            m1: { firstWeight: 100, lastWeight: 130, timesPerformed: 12 },
            m2: { firstWeight: 80, lastWeight: 90, timesPerformed: 10 },
            m3: { firstWeight: 60, lastWeight: 60, timesPerformed: 9 },
            m4: { firstWeight: 50, lastWeight: 90, timesPerformed: 1 },
          },
        }),
        attendance: visitsAt(2, "2026-06-01"),
        machineNames: { m1: "Leg Press", m2: "Chest Press" },
      }),
    );
    expect(snap.proof.weeksAttended).toBe(snap.proof.weeksObserved);
    expect(snap.proof.weeksObserved).toBe(12);
    // m4 was logged once: not enough to count.
    expect(snap.proof.machinesTracked).toBe(3);
    expect(snap.proof.machinesImproved).toBe(2);
    expect(snap.proof.bestGain).toEqual({ machineId: "m1", machineName: "Leg Press", pct: 30 });
  });

  it("says nothing about strength from two machines", () => {
    const snap = buildRenewalSnapshot(
      input({
        client: client({
          machineStats: {
            m1: { firstWeight: 100, lastWeight: 130, timesPerformed: 12 },
            m2: { firstWeight: 80, lastWeight: 90, timesPerformed: 10 },
          },
        }),
      }),
    );
    expect(snap.proof.machinesImproved).toBeNull();
  });

  it("carries the InBody change the app keeps on the client, once there are two scans", () => {
    const latest = { weightLb: 172.4, skeletalMuscleMassLb: 68.1, bodyFatMassLb: 53.8, percentBodyFat: 31.2 };
    const two = buildRenewalSnapshot(
      input({
        client: client({
          inbodySummary: {
            scanCount: 2,
            firstTestedAt: "2026-01-15",
            latestTestedAt: "2026-09-02",
            latest,
            weightLbChange: -3.8,
            muscleLbChange: 2.3,
            bodyFatLbChange: -5.1,
            bodyFatPctChange: -2.2,
          },
        }),
      }),
    );
    expect(two.proof.inbody).toEqual({ muscleLbChange: 2.3, bodyFatPctChange: -2.2, since: "2026-01-15" });

    const one = buildRenewalSnapshot(
      input({
        client: client({
          inbodySummary: {
            scanCount: 1,
            firstTestedAt: "2026-09-02",
            latestTestedAt: "2026-09-02",
            latest,
            weightLbChange: null,
            muscleLbChange: null,
            bodyFatLbChange: null,
            bodyFatPctChange: null,
          },
        }),
      }),
    );
    expect(one.proof.inbody).toBeNull();
  });
});

describe("a renewal on the books", () => {
  it("stops the conversation prompt once the next package is signed", () => {
    // Billing ends in 20 days with 8 sessions left: the conversation is due.
    const end = addDays(TODAY, 20);
    const base = client({
      mindbodyContracts: {
        "9001": contract({ id: 9001, contractName: "96 Sessions - 2X Week", startDate: addDays(end, -(12 * 28 - 1)), endDate: end }),
      },
      mindbodyServices: { "1": service(1, "96 Sessions - 2X Week", 8) },
    });
    const before = buildRenewalSnapshot(input({ client: base, attendance: visitsAt(2, "2026-06-01") }));
    expect(before.conversationDue).toBe(true);
    expect(before.renewalOnBooks).toBeNull();

    const signed = client({
      ...base,
      mindbodyContracts: {
        ...base.mindbodyContracts,
        "9002": contract({ id: 9002, contractName: "144 Sessions - 2X Week", startDate: addDays(end, 1), endDate: "2028-05-01" }),
      },
    });
    const after = buildRenewalSnapshot(input({ client: signed, attendance: visitsAt(2, "2026-06-01") }));
    expect(after.cycleKey).toBe("9001");
    expect(after.renewalOnBooks).toEqual({ cycleKey: "9002", packageKey: "transformed", startsOn: addDays(end, 1) });
    expect(after.conversationDue).toBe(false);
  });
});

describe("primaryTrainerOf", () => {
  it("names whoever coached the most days in the window, the latest breaking a tie", () => {
    const rows: AttendanceRow[] = [
      { day: "2026-08-01", kind: "visit", trainerId: "ann" },
      { day: "2026-08-01", kind: "visit", trainerId: "ann" }, // booking + workout, same day
      { day: "2026-08-05", kind: "visit", trainerId: "bo" },
      { day: "2026-08-09", kind: "visit", trainerId: "ann" },
      { day: "2026-08-20", kind: "visit", trainerId: "bo" },
      { day: "2026-09-01", kind: "visit", trainerId: "legacy-trainer" },
      { day: "2026-09-02", kind: "booked", trainerId: "cy" },
      { day: "2026-01-02", kind: "visit", trainerId: "cy" },
    ];
    // ann and bo both have 2 days; bo's is more recent. cy's visit is outside the window.
    expect(primaryTrainerOf(rows, "2026-06-13", TODAY)).toBe("bo");
    expect(primaryTrainerOf(rows.slice(0, 4), "2026-06-13", TODAY)).toBe("ann");
    expect(primaryTrainerOf([], "2026-06-13", TODAY)).toBeNull();
  });
});

describe("pickContracts", () => {
  it("prefers a recognized package, then the latest start", () => {
    const index = buildPackageNameIndex({
      ...DEFAULT_RENEWAL_SETTINGS,
      packages: DEFAULT_RENEWAL_SETTINGS.packages.map((p) =>
        p.key === "committed" ? { ...p, mindbodyNames: [...p.mindbodyNames, "Committed 12 Month EFT"] } : p,
      ),
    });
    const pick = pickContracts(
      {
        a: contract({ id: 1, contractName: "Towel Service", startDate: "2026-05-01", endDate: "2027-05-01" }),
        b: contract({ id: 2, startDate: "2026-01-01", endDate: "2026-12-01" }),
      },
      TODAY,
      index,
    );
    expect(pick.current?.id).toBe("2");
  });
});

describe("sameSnapshot", () => {
  it("ignores when it was computed", () => {
    const a = buildRenewalSnapshot(input({ client: client() }));
    expect(sameSnapshot({ ...a, computedAt: 1 }, { ...a, computedAt: 2 })).toBe(true);
    expect(sameSnapshot(a, { ...a, sessionsLeft: 3 })).toBe(false);
  });
});
