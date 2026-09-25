import { describe, expect, it } from "vitest";
import { reportJoinedDate } from "./joined";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const day = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;

describe("reportJoinedDate — the profile's rule, not the report's old one", () => {
  it("takes the EARLIEST of the first session and Mindbody's first visit", () => {
    // Each is only an upper bound on when she started. A migrating client's
    // `firstSessionDate` is her first session IN JOURNEY - Sep 2026 for a
    // woman Mindbody met in 2014 - so the first one present is not the answer.
    const migrating = reportJoinedDate(
      { firstSessionDate: "2026-09-02", firstAppointmentDate: ts("2014-03-01T15:00:00") },
      "2026-09-02",
    );
    expect(day(migrating)).toBe("2014-03-01");

    const d = reportJoinedDate(
      { firstSessionDate: "2019-04-02", firstAppointmentDate: ts("2018-01-10T15:00:00") },
      "2026-01-05",
    );
    expect(day(d)).toBe("2018-01-10");
  });

  it("keeps the first session when it IS the earliest", () => {
    const d = reportJoinedDate(
      { firstSessionDate: "2019-04-02", firstAppointmentDate: ts("2019-05-10T15:00:00") },
      "2026-01-05",
    );
    expect(day(d)).toBe("2019-04-02");
  });

  it("uses the report's own first session when the client has none", () => {
    expect(day(reportJoinedDate({}, "2021-06-07"))).toBe("2021-06-07");
    expect(day(reportJoinedDate({ firstAppointmentDate: ts("2022-01-10T15:00:00") }, "2021-06-07"))).toBe("2021-06-07");
    // ...but not over an earlier Mindbody visit: Journey's first day is not hers.
    expect(day(reportJoinedDate({ firstAppointmentDate: ts("2018-01-10T15:00:00") }, "2021-06-07"))).toBe("2018-01-10");
  });

  it("then Mindbody's first visit, then Mindbody's created date", () => {
    expect(day(reportJoinedDate({ firstAppointmentDate: ts("2018-01-10T15:00:00") }, ""))).toBe("2018-01-10");
    expect(day(reportJoinedDate({ mindbodyCreatedAt: "2017-03-04" }, null))).toBe("2017-03-04");
  });

  it("prints a dash, not the day Journey met her, when Journey does not hold her whole story", () => {
    // A FileMaker client whose only date is her first session in Journey:
    // "Joined Sep 2026" would call a twelve-year client new.
    expect(reportJoinedDate({ firstSessionDate: "2026-09-02" }, "2026-09-02", "partial")).toBeNull();
    expect(reportJoinedDate({ firstSessionDate: "2026-09-02" }, "2026-09-02", "unknown")).toBeNull();
    // A prior record means sessions before Journey, whatever the coverage says.
    expect(
      reportJoinedDate({ firstSessionDate: "2026-09-02", priorHistory: { sessions: 400, through: "2026-08-31", source: "filemaker" } as never }, null, "complete"),
    ).toBeNull();
    expect(day(reportJoinedDate({ firstSessionDate: "2026-09-02" }, null, "complete"))).toBe("2026-09-02");
    // Mindbody's own date still stands.
    expect(
      day(reportJoinedDate({ firstSessionDate: "2026-09-02", firstAppointmentDate: ts("2014-03-01T15:00:00") }, null, "partial")),
    ).toBe("2014-03-01");
  });

  it("then the earliest contract", () => {
    const d = reportJoinedDate(
      {
        mindbodyContracts: {
          a: { clientContractId: "a", status: "Active", startDate: ts("2020-05-01T12:00:00") },
          b: { clientContractId: "b", status: "Cancelled", startDate: ts("2016-02-01T12:00:00") },
        },
      },
      undefined,
    );
    expect(day(d)).toBe("2016-02-01");
  });

  it("keeps a date-only string on its own day in Eastern time", () => {
    // new Date("2019-04-02") is UTC midnight — April 1 in Cleveland.
    expect(day(reportJoinedDate({}, "2019-04-02"))).toBe("2019-04-02");
  });

  it("is null rather than a guess", () => {
    expect(reportJoinedDate({}, "")).toBeNull();
    expect(reportJoinedDate({ firstSessionDate: "not a date" }, null)).toBeNull();
  });
});
