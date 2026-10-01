/**
 * IS SHE DUE AN INBODY SCAN? (FileMaker parity, Oct 1 2026; AJ: "up to the
 * studio or even that client").
 */
import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../types";
import {
  clientEveryOf,
  completedSessionDays,
  inbodyDue,
  inbodyDueLine,
  inbodyDueSentence,
  type InBodyDueInput,
} from "./due";

/** n Completed-session days, one a day from Jan 2 2026. */
function days(n: number, from = "2026-01-02"): string[] {
  const out: string[] = [];
  const start = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  for (let i = 0; i < n; i++) out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

const base: InBodyDueInput = {
  latestScanDay: "2026-01-01",
  sessionDays: [],
  listComplete: true,
  coverage: "complete",
  studioEvery: 50,
};

describe("inbodyDue", () => {
  it("counts the sessions after her last scan and says due at the studio's number", () => {
    expect(inbodyDue({ ...base, sessionDays: days(49) })).toMatchObject({ kind: "count", sessions: 49, due: false, atLeast: false });
    const due = inbodyDue({ ...base, sessionDays: days(51) });
    expect(due).toMatchObject({ kind: "count", sessions: 51, due: true, since: "scan", every: 50, everySource: "studio" });
    expect(inbodyDueLine(due, "her")).toBe("Due an InBody: 51 sessions since her last scan");
  });

  it("does not count the session on the scan day itself", () => {
    const r = inbodyDue({ ...base, latestScanDay: "2026-01-02", sessionDays: ["2026-01-01", "2026-01-02", "2026-01-03"] });
    expect(r).toMatchObject({ kind: "count", sessions: 1, atLeast: false });
  });

  it("takes the client's own number first, and 'never' turns it off", () => {
    expect(inbodyDue({ ...base, sessionDays: days(20), clientEvery: 12 })).toMatchObject({ due: true, every: 12, everySource: "client" });
    const off = inbodyDue({ ...base, sessionDays: days(200), clientEvery: "never" });
    expect(off).toEqual({ kind: "off" });
    expect(inbodyDueLine(off, "her")).toBeNull();
  });

  it("ignores a client number that isn't usable, rather than bending it", () => {
    expect(clientEveryOf(2)).toBeNull();
    expect(clientEveryOf(500)).toBeNull();
    expect(clientEveryOf(12.5)).toBeNull();
    expect(clientEveryOf("12")).toBeNull();
    expect(clientEveryOf(12)).toBe(12);
    expect(inbodyDue({ ...base, sessionDays: days(20), clientEvery: 2 })).toMatchObject({ every: 50, everySource: "studio", due: false });
  });

  it("never claims a count with no scan in Journey when Journey doesn't hold her whole story", () => {
    for (const coverage of ["partial", "unknown"] as const) {
      const r = inbodyDue({ ...base, latestScanDay: null, coverage, sessionDays: days(80) });
      expect(r).toEqual({ kind: "no-scan", every: 50, everySource: "studio" });
      expect(inbodyDueLine(r, "her")).toBeNull();
      expect(inbodyDueSentence(r, "her")).toBe("No InBody scan in Journey yet.");
    }
  });

  it("counts from her first session when there was never a scan and Journey holds her whole story", () => {
    const r = inbodyDue({ ...base, latestScanDay: null, sessionDays: days(52) });
    expect(r).toMatchObject({ kind: "count", sessions: 52, since: "first-session", due: true });
    expect(inbodyDueLine(r, "his")).toBe("Due an InBody: 52 sessions and no scan yet");
    expect(inbodyDue({ ...base, latestScanDay: null, sessionDays: days(3) })).toMatchObject({ sessions: 3, due: false });
  });

  it("calls the count a floor when the scan predates everything Journey holds of a migrating client", () => {
    const r = inbodyDue({ ...base, latestScanDay: "2025-06-01", coverage: "partial", sessionDays: days(12) });
    expect(r).toMatchObject({ kind: "count", sessions: 12, atLeast: true, due: false });
    expect(inbodyDueSentence(r, "her")).toBe("At least 12 sessions since her last scan that Journey can see. A scan is due every 50.");
    // A floor past her number is still due.
    const due = inbodyDue({ ...base, latestScanDay: "2025-06-01", coverage: "partial", sessionDays: days(60) });
    expect(inbodyDueLine(due, "her")).toBe("Due an InBody: at least 60 sessions since her last scan");
    // A scan Journey saw sessions either side of is counted exactly, whatever the coverage.
    const exact = inbodyDue({ ...base, latestScanDay: "2026-01-05", coverage: "partial", sessionDays: days(10) });
    expect(exact).toMatchObject({ sessions: 6, atLeast: false });
  });

  it("calls the count a floor when the list is only a page of her sessions", () => {
    const r = inbodyDue({ ...base, sessionDays: days(40), listComplete: false });
    expect(r).toMatchObject({ sessions: 40, atLeast: true });
    // ...but not when the page already reaches back past the scan.
    const back = inbodyDue({ ...base, latestScanDay: "2026-01-10", sessionDays: days(40), listComplete: false });
    expect(back).toMatchObject({ sessions: 31, atLeast: false });
  });

  it("counts nothing while her sessions are unread: an unread list is not an empty one", () => {
    const r = inbodyDue({ ...base, sessionDays: [], sessionsRead: false });
    expect(r).toEqual({ kind: "unread" });
    expect(inbodyDueLine(r, "her")).toBeNull();
    expect(inbodyDueSentence(r, "her")).toBe("Counting her sessions…");
    // No scan and not her whole story: "no scan" whether or not the sessions are read.
    expect(inbodyDue({ ...base, latestScanDay: null, coverage: "partial", sessionDays: [], sessionsRead: false })).toMatchObject({ kind: "no-scan" });
  });

  it("says how many are left on the card", () => {
    expect(inbodyDueSentence(inbodyDue({ ...base, sessionDays: days(47) }), "her")).toBe(
      "47 sessions since her last scan. Due in 3 sessions (every 50).",
    );
    expect(inbodyDueSentence(inbodyDue({ ...base, sessionDays: days(1) }), "their")).toBe(
      "1 session since their last scan. Due in 49 sessions (every 50).",
    );
    expect(inbodyDueSentence(inbodyDue({ ...base, sessionDays: days(50) }), "her")).toBe(
      "50 sessions since her last scan: due a scan (every 50).",
    );
    expect(inbodyDueSentence({ kind: "off" }, "her")).toBe("InBody reminders are off for this client.");
  });
});

describe("completedSessionDays", () => {
  it("keeps only Completed sessions, on their studio day", () => {
    const s = (status: string, date: string) => ({ status, date }) as unknown as WorkoutSession;
    expect(completedSessionDays([s("Completed", "2026-03-04"), s("In-Progress", "2026-03-05"), s("Completed", "2026-03-06")])).toEqual([
      "2026-03-04",
      "2026-03-06",
    ]);
    expect(completedSessionDays(null)).toEqual([]);
  });
});
