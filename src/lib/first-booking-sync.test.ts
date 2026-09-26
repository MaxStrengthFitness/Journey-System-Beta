import { describe, it, expect } from "vitest";
import { firstSyncOrder, needsFirstSync } from "./first-booking-sync";

const TODAY = "2026-11-02";
const TOMORROW = "2026-11-03";

describe("needsFirstSync (the cost plan, B5)", () => {
  const client = { id: "100000123", mindbodyClientId: "100000123" };

  it("syncs a never-synced client booked today or tomorrow", () => {
    expect(needsFirstSync(client, [TODAY], TODAY, TOMORROW)).toBe(true);
    expect(needsFirstSync(client, ["2026-11-20", TOMORROW], TODAY, TOMORROW)).toBe(true);
  });

  it("leaves a client booked only later to the night before", () => {
    expect(needsFirstSync(client, ["2026-11-04"], TODAY, TOMORROW)).toBe(false);
    expect(needsFirstSync(client, [], TODAY, TOMORROW)).toBe(false);
  });

  it("never re-syncs one already synced: details and packages arrive when they change", () => {
    expect(
      needsFirstSync({ ...client, mindbodyMasterSyncedAt: "2026-10-01T10:00:00.000Z" }, [TODAY], TODAY, TOMORROW),
    ).toBe(false);
  });

  it("skips a record with no Mindbody id, or two different ones", () => {
    expect(needsFirstSync({ id: "abc-temp", provisional: true }, [TODAY], TODAY, TOMORROW)).toBe(false);
    expect(needsFirstSync({ id: "100000123", mindbodyClientId: "100000999" }, [TODAY], TODAY, TOMORROW)).toBe(false);
  });

  it("reads the site-qualified record's number from its field", () => {
    expect(needsFirstSync({ id: "29068-100000123", mindbodyClientId: "100000123" }, [TODAY], TODAY, TOMORROW)).toBe(true);
  });

  it("puts today's bookings before tomorrow's", () => {
    const rows = [
      { id: "b", firstDay: TOMORROW },
      { id: "a", firstDay: TOMORROW },
      { id: "c", firstDay: TODAY },
    ];
    expect(rows.sort(firstSyncOrder).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});
