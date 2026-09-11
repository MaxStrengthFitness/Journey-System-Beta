import { describe, it, expect } from "vitest";
import {
  buildRenewalSnapshot,
  computePace,
  mindbodyDayKey,
  pickContracts,
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
            overallStatus: "Yellow",
            overallPercent: 60,
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
