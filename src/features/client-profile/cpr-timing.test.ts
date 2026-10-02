import { describe, expect, it } from "vitest";
import { addMonths, cprTimingCue, lastFullReportDay, progressReportDue } from "./cpr-timing";

describe("progressReportDue: the one rule (Atlas answers, Oct 2 2026)", () => {
  const full = (date: string) => ({ date, status: "Finalized" as const });
  const quiet = { renewal: null, established: true };

  it("is due three months after the last FULL report; a Pulse round or a draft never resets it", () => {
    const reports = [full("2026-06-01"), { ...full("2026-09-01"), isCheckInOnly: true }, { date: "2026-09-10", status: "Draft" as const }];
    expect(lastFullReportDay(reports)).toBe("2026-06-01");
    const due = progressReportDue({ ...quiet, reports, today: "2026-09-02" });
    expect(due).toMatchObject({ level: "due", dueOn: "2026-09-01" });
    expect(due?.text).toBe("Progress report due: three months since the last full report (Jun 1, 2026).");
  });

  it("says soon inside three weeks, and nothing before", () => {
    expect(progressReportDue({ ...quiet, reports: [full("2026-06-20")], today: "2026-09-02" })).toMatchObject({ level: "soon", text: "Next progress report due Sep 20, 2026." });
    expect(progressReportDue({ ...quiet, reports: [full("2026-08-01")], today: "2026-09-02" })).toBeNull();
  });

  it("is off for a client with the switch on, and says nothing while the reports are unread", () => {
    expect(progressReportDue({ ...quiet, reports: [full("2026-01-01")], optedOut: true, today: "2026-09-02" })).toBeNull();
    expect(progressReportDue({ ...quiet, reports: null, today: "2026-09-02" })).toBeNull();
  });

  it("with no full report, expects one only once she has been here three months", () => {
    expect(progressReportDue({ ...quiet, reports: [], today: "2026-09-02" })?.level).toBe("due");
    expect(progressReportDue({ ...quiet, reports: [], established: false, today: "2026-09-02" })).toBeNull();
  });

  it("says it more strongly when the renewal conversation is close", () => {
    const due = progressReportDue({ ...quiet, reports: [full("2026-07-15")], renewal: snap(), today: "2026-09-15" });
    expect(due?.level).toBe("renewal");
    expect(due?.text).toContain("Renewal is coming up");
    // Off is off, renewal or not.
    expect(progressReportDue({ ...quiet, reports: [], renewal: snap(), optedOut: true, today: "2026-09-15" })).toBeNull();
  });

  it("counts calendar months", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-06-01", 3)).toBe("2026-09-01");
  });
});

const snap = (over: Record<string, unknown> = {}) =>
  ({ renewalOnBooks: null, conversationDue: true, chargeWarning: false, situation: "on-track", sessionsLeft: 9, ...over }) as never;

describe("cprTimingCue", () => {
  it("cues a report when the renewal conversation is due", () => {
    expect(cprTimingCue(snap(), [], "2026-09-15")?.text).toContain("9 sessions left");
  });
  it("stays quiet when nothing is approaching or the renewal is signed", () => {
    expect(cprTimingCue(snap({ conversationDue: false }), [], "2026-09-15")).toBeNull();
    expect(cprTimingCue(snap({ renewalOnBooks: { cycleKey: "x", packageKey: null, startsOn: "2026-10-01" } }), [], "2026-09-15")).toBeNull();
    expect(cprTimingCue(null, [], "2026-09-15")).toBeNull();
  });
  it("stays quiet after a recent full report, but not after a check-in or a draft", () => {
    const full = { date: "2026-08-20", status: "Finalized" as const };
    expect(cprTimingCue(snap(), [full], "2026-09-15")).toBeNull();
    expect(cprTimingCue(snap(), [{ ...full, isCheckInOnly: true }], "2026-09-15")).not.toBeNull();
    expect(cprTimingCue(snap(), [{ ...full, status: "Draft" as const }], "2026-09-15")).not.toBeNull();
    expect(cprTimingCue(snap(), [{ ...full, date: "2026-06-01" }], "2026-09-15")).not.toBeNull();
  });
  it("says why when there is no session count", () => {
    expect(cprTimingCue(snap({ sessionsLeft: null, conversationDue: false, situation: "will-run-out" }), [], "2026-09-15")?.text).toContain(
      "running out",
    );
  });
});
