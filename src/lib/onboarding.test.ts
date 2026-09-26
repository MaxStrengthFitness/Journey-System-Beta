import { describe, it, expect } from "vitest";
import {
  addDays,
  monthsBefore,
  newClientRecord,
  onboardWindow,
  planClient,
  scopeFromAppointments,
  windowChunks,
} from "./onboarding";

describe("the window (AJ: booked in the next 30 days, trained in the last 6 months)", () => {
  it("counts calendar days and months", () => {
    expect(addDays("2026-09-26", 30)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(monthsBefore("2026-09-26", 6)).toBe("2026-03-26");
    expect(monthsBefore("2026-08-31", 6)).toBe("2026-02-28"); // clamped to February's last day
    expect(monthsBefore("2027-01-15", 1)).toBe("2026-12-15");
  });

  it("reaches six months back and thirty days ahead", () => {
    expect(onboardWindow("2026-10-27")).toEqual({ from: "2026-04-27", to: "2026-11-26" });
  });

  it("cuts the window into pieces that cover every day exactly once", () => {
    const chunks = windowChunks("2026-04-27", "2026-11-26", 31);
    expect(chunks[0]).toEqual({ start: "2026-04-27", end: "2026-05-27" });
    expect(chunks[chunks.length - 1].end).toBe("2026-11-26");
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start).toBe(addDays(chunks[i - 1].end, 1));
    }
    expect(windowChunks("2026-09-26", "2026-09-26")).toEqual([{ start: "2026-09-26", end: "2026-09-26" }]);
    expect(windowChunks("2026-09-27", "2026-09-26")).toEqual([]);
  });
});

describe("scopeFromAppointments", () => {
  const TODAY = "2026-10-27";
  const appt = (client: string, day: string, extra: Record<string, unknown> = {}) => ({
    ClientId: client,
    StartDateTime: `${day}T09:00:00`,
    LocationId: 3,
    Status: "Booked",
    ...extra,
  });

  it("finds who trained, who is booked, and who is both", () => {
    const scope = scopeFromAppointments(
      [
        appt("101", "2026-06-02"),
        appt("101", "2026-10-20"),
        appt("202", "2026-11-03"),
        appt("303", "2026-09-01"),
        appt("303", "2026-11-10"),
        appt("303", "2026-11-04"),
      ],
      { today: TODAY, locationId: null },
    );
    expect(scope.map((s) => s.mindbodyClientId)).toEqual(["101", "202", "303"]);
    expect(scope[0]).toMatchObject({ lastSeen: "2026-10-20", nextBooking: null, reasons: ["trained"], bookings: 2 });
    expect(scope[1]).toMatchObject({ lastSeen: null, nextBooking: "2026-11-03", reasons: ["booked"] });
    expect(scope[2]).toMatchObject({ lastSeen: "2026-09-01", nextBooking: "2026-11-04", reasons: ["trained", "booked"] });
  });

  it("counts today as trained, not booked ahead", () => {
    const [s] = scopeFromAppointments([appt("101", TODAY)], { today: TODAY, locationId: null });
    expect(s).toMatchObject({ lastSeen: TODAY, nextBooking: null });
  });

  it("keeps only the studio's own location on a shared site", () => {
    const scope = scopeFromAppointments(
      [appt("101", "2026-10-01", { LocationId: 3 }), appt("202", "2026-10-01", { Location: { Id: 5 }, LocationId: undefined })],
      { today: TODAY, locationId: "5" },
    );
    expect(scope.map((s) => s.mindbodyClientId)).toEqual(["202"]);
  });

  it("drops a cancelled booking, a booking with no client and one with no readable day", () => {
    const scope = scopeFromAppointments(
      [
        appt("101", "2026-10-01", { Status: "Cancelled" }),
        appt("", "2026-10-01"),
        { ClientId: "303", StartDateTime: "soon", LocationId: 3 },
        appt("404", "2026-10-01", { Status: "LateCancelled" }),
      ],
      { today: TODAY, locationId: null },
    );
    // A late cancel is still a client of the studio; an early cancel is not.
    expect(scope.map((s) => s.mindbodyClientId)).toEqual(["404"]);
  });

  it("reads the client id from either shape Mindbody sends", () => {
    const scope = scopeFromAppointments(
      [{ Client: { Id: 555 }, StartDateTime: "2026-10-01T08:00:00", LocationId: 3 }],
      { today: TODAY, locationId: null },
    );
    expect(scope[0].mindbodyClientId).toBe("555");
  });
});

describe("planClient", () => {
  it("makes a record for a client Journey has never seen", () => {
    expect(planClient({ record: null, resumed: false, conflict: false, resync: false })).toEqual({ action: "sync", create: true });
  });

  it("never syncs one twice, so a re-run costs nothing", () => {
    const record = { mindbodyMasterSyncedAt: "2026-10-20T10:00:00.000Z" };
    expect(planClient({ record, resumed: false, conflict: false, resync: false })).toEqual({ action: "skip", reason: "already-synced" });
    expect(planClient({ record, resumed: false, conflict: false, resync: true })).toEqual({ action: "sync", create: false });
  });

  it("skips what an interrupted run already finished", () => {
    expect(planClient({ record: {}, resumed: true, conflict: false, resync: false })).toEqual({ action: "skip", reason: "done-this-run" });
  });

  it("refuses a record carrying two Mindbody ids, as the profile's Sync does", () => {
    expect(planClient({ record: {}, resumed: false, conflict: true, resync: false })).toEqual({ action: "skip", reason: "conflict" });
  });

  it("syncs a record that exists but was never synced", () => {
    expect(planClient({ record: { mindbodyMasterSyncedAt: "" }, resumed: false, conflict: false, resync: false })).toEqual({ action: "sync", create: false });
  });
});

describe("newClientRecord", () => {
  it("is the schedule pull's shape, named by Mindbody and marked as the onboarding's", () => {
    const r = newClientRecord({
      mindbodyClientId: "100000123",
      siteId: " 5746957 ",
      studioId: "solon",
      firstName: " Ana ",
      lastName: "Ruiz",
      now: "NOW",
    });
    expect(r).toMatchObject({
      firstName: "Ana",
      lastName: "Ruiz",
      mindbodyClientId: "100000123",
      mindbodySiteId: "5746957",
      homeStudioId: "solon",
      isActive: true,
      sessionCount: 0,
      createdBy: "mindbody:onboard",
      isMindbodyStub: false,
      createdAt: "NOW",
    });
  });

  it("falls back to the pull's stand-in name when Mindbody gave none", () => {
    const r = newClientRecord({ mindbodyClientId: "7", siteId: "1", studioId: "s", firstName: null, lastName: "", now: 0 });
    expect(r.firstName).toBe("Mindbody");
    expect(r.lastName).toBe("Client 7");
  });
});
