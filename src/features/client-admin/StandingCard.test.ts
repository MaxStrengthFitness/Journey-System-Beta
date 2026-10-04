/**
 * INACTIVE BY HERSELF, ON HER PROFILE (the inactive round, Oct 1 2026): said
 * off last night's record only on the Journey's own evidence.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null }, functions: {} }));

import type { Client } from "../../types";
import { automaticFromRecord } from "./StandingCard";

const client = (renewal: Record<string, unknown> | null) => ({ id: "rosie", firstName: "Rosie", homeStudioId: "westlake", ...(renewal ? { renewal } : {}) }) as unknown as Client;

describe("automaticFromRecord", () => {
  it("says inactive by herself past the studio's line with nothing booked", () => {
    expect(automaticFromRecord(client({ lastVisitDate: "2026-06-20", nextBookingDate: null }), "2026-10-01", 90)).toBe(
      "103 days since the last visit (Jun 20, 2026), past the studio's 90-day line, with nothing booked as of last night's record, so inactive.",
    );
  });

  it("says nothing short of the line, with a booking, away, or with no record or visit to go by", () => {
    expect(automaticFromRecord(client({ lastVisitDate: "2026-07-20", nextBookingDate: null }), "2026-10-01", 90)).toBeNull();
    expect(automaticFromRecord(client({ lastVisitDate: "2026-06-20", nextBookingDate: "2026-10-03" }), "2026-10-01", 90)).toBeNull();
    expect(automaticFromRecord(client({ lastVisitDate: "2026-06-20", situation: "away" }), "2026-10-01", 90)).toBeNull();
    expect(automaticFromRecord(client({ lastVisitDate: null }), "2026-10-01", 90)).toBeNull();
    expect(automaticFromRecord(client(null), "2026-10-01", 90)).toBeNull();
  });
});
