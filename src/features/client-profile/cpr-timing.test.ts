import { describe, expect, it } from "vitest";
import { cprTimingCue } from "./cpr-timing";

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
