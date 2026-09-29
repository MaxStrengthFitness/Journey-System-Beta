import { describe, expect, it } from "vitest";
import { clientSinceLabel, earliestKnownDate, resolveClientSince, statedFirstDay } from "./client-since";

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

  /*
   * With the coverage: Journey's first session proves when she started only
   * when Journey holds her whole story (the codex Story's rule), so the
   * header and the Story cannot disagree about a FileMaker client.
   */
  it("labels Journey's first session 'In Journey since' unless Journey holds her whole story", () => {
    const filemaker = { firstSessionDate: ts("2026-09-02T15:00:00") };
    for (const coverage of ["partial", "unknown"] as const) {
      expect(clientSinceLabel(filemaker, { coverage })).toEqual({
        label: "In Journey since",
        value: "Sep 2026",
        source: "firstSession",
      });
    }
    expect(clientSinceLabel(filemaker, { coverage: "complete" })?.label).toBe("Client since");
    // A prior record means sessions before Journey, whatever coverage says.
    const prior = { ...filemaker, priorHistory: { sessions: 400, through: "2026-08-31", source: "filemaker" } };
    expect(resolveClientSince(prior, { coverage: "complete" })?.fromMindbody).toBe(false);
  });

  it("still takes Mindbody's own dates, and an earlier contract, over Journey's first session", () => {
    const withVisit = { firstSessionDate: ts("2026-09-02T15:00:00"), firstAppointmentDate: ts("2014-03-01T15:00:00") };
    expect(resolveClientSince(withVisit, { coverage: "partial" })?.source).toBe("firstAppointment");
    const withContract = {
      firstSessionDate: ts("2026-09-02T15:00:00"),
      mindbodyContracts: { a: { startDate: ts("2019-05-01T12:00:00") } },
    };
    expect(resolveClientSince(withContract, { coverage: "partial" })).toMatchObject({ source: "commercial", fromMindbody: true });
    // ...and Journey's first session over the Journey document's createdAt.
    const both = { firstSessionDate: ts("2026-09-02T15:00:00"), createdAt: ts("2026-08-01T12:00:00") };
    expect(resolveClientSince(both, { coverage: "partial" })?.source).toBe("firstSession");
  });

  /*
   * The first day a person set (Sep 29 2026). Every inferred date is only an
   * upper bound, so the stated day wins outright, whatever the coverage, and
   * it is read as a calendar day (never the previous evening in Ohio).
   */
  it("takes the day a person set over every inferred one, as a calendar day", () => {
    const client = {
      firstStudioDay: "2014-09-08",
      firstSessionDate: ts("2026-09-02T15:00:00"),
      firstAppointmentDate: ts("2015-03-01T15:00:00"),
      priorHistory: { sessions: 400, through: "2026-08-31", source: "filemaker" },
    };
    for (const coverage of ["partial", "unknown", "complete"] as const) {
      const since = resolveClientSince(client, { coverage });
      expect(since).toMatchObject({ source: "stated", fromMindbody: true });
      expect(since?.date.getFullYear()).toBe(2014);
      expect(since?.date.getMonth()).toBe(8);
      expect(since?.date.getDate()).toBe(8);
    }
    expect(clientSinceLabel(client, { coverage: "partial" })).toEqual({ label: "Client since", value: "Sep 2014", source: "stated" });
    expect(statedFirstDay({ firstStudioDay: "2014-02-30" })).toBeNull();
    expect(statedFirstDay({ firstStudioDay: "1980-01-01" })).toBeNull();
    expect(statedFirstDay({ firstStudioDay: "" })).toBeNull();
    expect(earliestKnownDate({ firstStudioDay: "2014-09-08", createdAt: ts("2026-08-01T12:00:00") })?.getFullYear()).toBe(2014);
  });

  it("still labels a Journey-only date as Journey's", () => {
    expect(clientSinceLabel({ createdAt: ts("2026-08-01T12:00:00") })?.label).toBe("In Journey since");
  });
});
