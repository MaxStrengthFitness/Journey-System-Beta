import { describe, expect, it } from "vitest";
import { clientSinceLabel, resolveClientSince } from "./client-since";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

/*
 * "Client since" on the profile (Sep 24 2026). `firstSessionDate` is written
 * the first time Journey sees a client, so for a migrating client it is
 * months old while Mindbody's first visit is years old. The earliest proven
 * date wins; a Journey-only date is still labelled "In Journey since".
 */
describe("clientSinceLabel", () => {
  it("does not call a migrating client new because Journey met her recently", () => {
    const label = clientSinceLabel({
      firstSessionDate: ts("2026-09-02T15:00:00"),
      firstAppointmentDate: ts("2014-03-01T15:00:00"),
    });
    expect(label).toEqual({ label: "Client since", value: "Mar 2014", source: "firstAppointment" });
  });

  it("keeps a genuinely new client's first session", () => {
    const since = resolveClientSince({
      firstSessionDate: ts("2026-09-02T15:00:00"),
      firstAppointmentDate: ts("2026-09-02T18:00:00"),
      mindbodyCreatedAt: ts("2026-09-01T12:00:00"),
    });
    // Mindbody made her record the day before: that is the earliest proof.
    expect(since?.source).toBe("mindbodyCreated");
    expect(clientSinceLabel({ firstSessionDate: ts("2026-09-02T15:00:00") })?.value).toBe("Sep 2026");
  });

  it("still labels a Journey-only date as Journey's", () => {
    expect(clientSinceLabel({ createdAt: ts("2026-08-01T12:00:00") })?.label).toBe("In Journey since");
  });
});
