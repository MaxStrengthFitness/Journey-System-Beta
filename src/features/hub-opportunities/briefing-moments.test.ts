/**
 * The briefing's milestone and break come from the Hub's one engine (the
 * Atlas answers, Oct 2 2026), so the briefing and the Hub card never
 * disagree. Run with TZ=America/New_York.
 */
import { describe, expect, it } from "vitest";
import { NOW, STUDIOS, TODAY, makeClient } from "../client-directory/fixtures";
import { briefingMoments } from "./briefing-moments";

const COMPLETE = { clientsNumberOfVisitsAtSite: 2 };
const ask = (over: Record<string, unknown>) =>
  briefingMoments({ client: makeClient({ id: "c", ...over }), today: TODAY, now: NOW, tz: "America/New_York", studios: STUDIOS });

describe("the briefing's milestone and break, from the Hub engine", () => {
  it("names the 100th as the card does, and not the 25th (the old every-25th rule is gone)", () => {
    expect(ask({ sessionCount: 99, ...COMPLETE }).map((m) => m.chip)).toEqual(["100th today"]);
    expect(ask({ sessionCount: 24, ...COMPLETE })).toEqual([]);
  });

  it("claims no milestone for a migrating client whose total can't be quoted", () => {
    expect(ask({ sessionCount: 99, clientsNumberOfVisitsAtSite: 300 })).toEqual([]);
  });

  it("says she is back only when she missed sessions at her own pace, as the card does", () => {
    const pace = { renewal: { pacePerWeek: 2 } };
    expect(ask({ ...COMPLETE, lastSessionDate: "2026-08-23", ...pace }).map((m) => m.chip)).toEqual(["Back after 5 wk"]);
    // No pace on file: the card says nothing, and so does the briefing now
    // (the old rule said "Back after 5 wk" off 21 calendar days).
    expect(ask({ ...COMPLETE, lastSessionDate: "2026-08-23" })).toEqual([]);
  });

  it("takes only the milestone and the break from the engine", () => {
    const kinds = ask({ sessionCount: 99, ...COMPLETE, dateOfBirth: "1950-09-27" }).map((m) => m.kind);
    expect(kinds).toEqual(["milestone"]);
  });
});
