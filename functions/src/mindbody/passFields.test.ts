import { describe, it, expect } from "vitest";
import { extractBookingExtras } from "./passFields";

describe("extractBookingExtras", () => {
  it("returns an empty object when the payload carries none of the fields", () => {
    // This is the expected case for 1:1 appointments — Mindbody's published
    // appointmentBooking schema does not include pass data. Writing nothing is
    // the whole point: no empty keys land on the document.
    expect(extractBookingExtras({ clientId: 5, startDateTime: "x" })).toEqual({});
  });

  it("extracts a full pass payload", () => {
    expect(
      extractBookingExtras({
        clientPassId: "pass-9",
        clientPassSessionsTotal: 24,
        clientPassSessionsDeducted: 9,
        clientPassSessionsRemaining: 15,
        clientPassActivationDateTime: "2026-01-01T00:00:00Z",
        clientPassExpirationDateTime: "2026-12-31T00:00:00Z",
        bookingOriginatedFromWaitlist: true,
        clientsNumberOfVisitsAtSite: 87,
      }),
    ).toEqual({
      pass: {
        passId: "pass-9",
        sessionsTotal: 24,
        sessionsDeducted: 9,
        sessionsRemaining: 15,
        activationDateTime: "2026-01-01T00:00:00Z",
        expirationDateTime: "2026-12-31T00:00:00Z",
      },
      bookingOriginatedFromWaitlist: true,
      clientsNumberOfVisitsAtSite: 87,
    });
  });

  it("reads PascalCase, as the REST proxy spells it", () => {
    const out = extractBookingExtras({
      ClientPassId: 41,
      ClientPassSessionsRemaining: 3,
      BookingOriginatedFromWaitlist: false,
      ClientsNumberOfVisitsAtSite: 12,
    });
    // A numeric pass id is normalised to a string; ids are identifiers, not maths.
    expect(out.pass).toEqual({ passId: "41", sessionsRemaining: 3 });
    expect(out.bookingOriginatedFromWaitlist).toBe(false);
    expect(out.clientsNumberOfVisitsAtSite).toBe(12);
  });

  it("omits the pass object entirely when no pass field is present", () => {
    const out = extractBookingExtras({ clientsNumberOfVisitsAtSite: 4 });
    expect(out.pass).toBeUndefined();
    expect(out).toEqual({ clientsNumberOfVisitsAtSite: 4 });
  });

  it("keeps a legitimate zero rather than treating it as absent", () => {
    // 0 sessions remaining is meaningful — the client is out of sessions.
    const out = extractBookingExtras({ clientPassSessionsRemaining: 0 });
    expect(out.pass).toEqual({ sessionsRemaining: 0 });
  });

  it("ignores nulls, which is how the REST proxy signals 'not provided'", () => {
    expect(
      extractBookingExtras({
        clientPassId: null,
        clientPassSessionsRemaining: null,
        bookingOriginatedFromWaitlist: null,
        clientsNumberOfVisitsAtSite: null,
      }),
    ).toEqual({});
  });

  it("coerces numeric strings and boolean strings", () => {
    const out = extractBookingExtras({
      clientPassSessionsTotal: "24",
      bookingOriginatedFromWaitlist: "true",
    });
    expect(out.pass).toEqual({ sessionsTotal: 24 });
    expect(out.bookingOriginatedFromWaitlist).toBe(true);
  });

  it("drops values that are not really numbers", () => {
    expect(
      extractBookingExtras({ clientPassSessionsTotal: "not-a-number" }),
    ).toEqual({});
  });
});
