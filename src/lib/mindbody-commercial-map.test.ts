import { describe, it, expect } from "vitest";
import {
  contractRowFromApi,
  mapContractRecords,
  mapServiceRecords,
  parseMindbodyInstant,
  selectServiceRows,
  serviceRowFromApi,
  type ServiceRow,
} from "./mindbody-commercial-map";

// Dates stay plain Dates in these tests; the real callers pass their SDK's
// Timestamp.fromDate.
const asDate = (d: Date) => d;

describe("parseMindbodyInstant", () => {
  it("reads a zoneless Mindbody date as UTC, so the calendar day never slips", () => {
    expect(parseMindbodyInstant("2026-11-14T00:00:00")?.toISOString()).toBe(
      "2026-11-14T00:00:00.000Z",
    );
  });
  it("keeps an explicit zone", () => {
    expect(parseMindbodyInstant("2026-11-14T05:00:00Z")?.toISOString()).toBe(
      "2026-11-14T05:00:00.000Z",
    );
  });
  it("is null for nothing or nonsense", () => {
    expect(parseMindbodyInstant("")).toBeNull();
    expect(parseMindbodyInstant("not a date")).toBeNull();
    expect(parseMindbodyInstant(null)).toBeNull();
  });
});

describe("contractRowFromApi", () => {
  const apiContract = {
    Id: 9001,
    ContractName: "Committed - 12 Month",
    AgreementDate: "2026-01-02T10:00:00",
    StartDate: "2026-01-02T00:00:00",
    EndDate: "2026-12-03T00:00:00",
    AutopayStatus: "Active",
    OriginationLocationId: 3,
    SiteId: 29068,
    UpcomingAutopayEvents: [
      { ClientContractId: 9001, ChargeAmount: 480, PaymentMethod: "CreditCard", ScheduleDate: "2026-10-09T00:00:00" },
      { ClientContractId: 9001, ChargeAmount: "480.00", PaymentMethod: "CreditCard", ScheduleDate: "2026-11-06T00:00:00" },
    ],
  };

  it("keeps the scheduled charges the route used to throw away", () => {
    const row = contractRowFromApi(apiContract, "29068");
    expect(row.clientContractId).toBe(9001);
    expect(row.upcomingAutopayEvents).toEqual([
      { scheduleDate: "2026-10-09T00:00:00", chargeAmount: 480, paymentMethod: "CreditCard" },
      { scheduleDate: "2026-11-06T00:00:00", chargeAmount: 480, paymentMethod: "CreditCard" },
    ]);
  });

  it("leaves the list out when Mindbody sent none at all", () => {
    const { UpcomingAutopayEvents, ...rest } = apiContract;
    expect(contractRowFromApi(rest, "29068")).not.toHaveProperty("upcomingAutopayEvents");
  });
});

describe("mapContractRecords", () => {
  it("writes an empty charge list as a real answer, and drops unreadable dates", () => {
    const out = mapContractRecords(
      [
        { clientContractId: 1, upcomingAutopayEvents: [] },
        {
          clientContractId: 2,
          upcomingAutopayEvents: [
            { scheduleDate: "2026-10-09T00:00:00", chargeAmount: 480 },
            { scheduleDate: "garbage", chargeAmount: 480 },
          ],
        },
        { clientContractId: 3 },
      ],
      "NOW",
      asDate,
    );
    expect(out["1"].upcomingAutopayEvents).toEqual([]);
    expect(out["2"].upcomingAutopayEvents).toEqual([
      { scheduleDate: new Date("2026-10-09T00:00:00Z"), chargeAmount: 480, paymentMethod: "" },
    ]);
    // Nothing said about charges: nothing written, so an older list survives.
    expect(out["3"]).not.toHaveProperty("upcomingAutopayEvents");
  });
});

describe("pricing options", () => {
  const row = (over: Partial<ServiceRow>): ServiceRow => ({
    serviceId: 1,
    name: "48 Sessions - 2X Week",
    count: 8,
    remaining: 0,
    activeDate: "2026-01-02T00:00:00",
    expirationDate: "2027-01-02T00:00:00",
    paymentDate: "2026-01-02T00:00:00",
    current: true,
    returned: false,
    programName: "Personal Training",
    siteId: 29068,
    ...over,
  });

  it("reads Mindbody's ClientService shape", () => {
    const r = serviceRowFromApi(
      {
        Id: 555,
        Name: "144 PIF",
        Count: 144,
        Remaining: 109,
        ActiveDate: "2026-02-01T00:00:00",
        ExpirationDate: "2027-08-01T00:00:00",
        PaymentDate: "2026-02-01T00:00:00",
        Current: true,
        Program: { Name: "Personal Training" },
        SiteId: 5746957,
      },
      "5746957",
    );
    expect(r).toMatchObject({
      serviceId: 555,
      name: "144 PIF",
      count: 144,
      remaining: 109,
      current: true,
      returned: false,
      programName: "Personal Training",
    });
  });

  it("keeps every pricing option with sessions left, plus the most recent few", () => {
    const rows = [
      row({ serviceId: 1, activeDate: "2025-01-01T00:00:00", remaining: 0 }),
      row({ serviceId: 2, activeDate: "2025-02-01T00:00:00", remaining: 3 }),
      row({ serviceId: 3, activeDate: "2025-03-01T00:00:00", remaining: 0 }),
      row({ serviceId: 4, activeDate: "2025-04-01T00:00:00", remaining: 0 }),
      row({ serviceId: 5, activeDate: "2025-05-01T00:00:00", remaining: 8 }),
      row({ serviceId: 6, name: "Session Comp", count: 2, activeDate: "2024-01-01T00:00:00", remaining: 2 }),
    ];
    const kept = selectServiceRows(rows, 2).map((r) => r.serviceId).sort();
    // 2, 5 and 6 have sessions; 4 and 5 are the two most recent.
    expect(kept).toEqual([2, 4, 5, 6]);
  });

  it("drops refunded pricing options entirely", () => {
    const kept = selectServiceRows([row({ serviceId: 9, remaining: 8, returned: true })]);
    expect(kept).toEqual([]);
  });

  it("maps to Firestore records keyed by the ClientService id", () => {
    const out = mapServiceRecords(
      [row({ serviceId: 77, remaining: 5 }), row({ serviceId: "bad.id" })],
      "NOW",
      asDate,
    );
    expect(Object.keys(out)).toEqual(["77"]);
    expect(out["77"]).toMatchObject({
      serviceId: 77,
      name: "48 Sessions - 2X Week",
      count: 8,
      remaining: 5,
      current: true,
      lastPullSyncAt: "NOW",
      activeDate: new Date("2026-01-02T00:00:00Z"),
    });
  });

  it("keeps a zero balance as zero", () => {
    const out = mapServiceRecords([row({ serviceId: 8, remaining: 0 })], "NOW", asDate);
    expect(out["8"].remaining).toBe(0);
  });
});
