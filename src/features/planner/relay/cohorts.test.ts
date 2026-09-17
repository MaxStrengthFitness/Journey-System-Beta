import { describe, expect, it } from "vitest";
import { cohortsOf } from "./cohorts";
import type { Client } from "../../../types";

const TODAY = "2026-09-16";
const client = (id: string, over: Record<string, unknown> = {}): Client =>
  ({ id, firstName: id, lastName: "C", isActive: true, homeStudioId: "s1", isRoutineBActive: true, ...over }) as unknown as Client;

describe("cohortsOf", () => {
  it("builds each cohort from the roster's own fields, this studio only", () => {
    const c = cohortsOf(
      [
        client("Renew", { renewal: { situation: "on-track", conversationDue: true, chargeWarning: false, renewalOnBooks: null, focusDate: "2026-09-26" } }),
        client("Away", { renewal: { situation: "away", conversationDue: true, chargeWarning: false, renewalOnBooks: null } }),
        client("Mia", { lastSessionDate: "2026-08-20" }),
        client("Paused", { lastSessionDate: "2026-08-20", retentionMeta: { excludedFromMIA: true } }),
        client("Back", { lastSessionDate: "2026-08-20", retentionMeta: { excludedFromMIA: true, autoIncludeAfter: "2026-09-01" } }),
        client("Bday", { dateOfBirth: "1980-10-01" }),
        client("Ford", { fordSummary: { nextDate: { date: "2026-09-20", label: "Marathon", pillar: "recreation" } } }),
        client("NoB", { isRoutineBActive: false }),
        client("Elsewhere", { homeStudioId: "s2", isRoutineBActive: false, lastSessionDate: "2026-01-01" }),
        client("Inactive", { isActive: false, isRoutineBActive: false }),
      ],
      "s1",
      TODAY,
    );
    expect(c.renewals.map((m) => `${m.name}: ${m.why}`)).toEqual(["Renew C: Package ends in 10 days"]);
    expect(c.mia.map((m) => m.name).sort()).toEqual(["Back C", "Mia C"]);
    expect(c.mia[0].why).toBe("Last session 27 days ago");
    expect(c.birthdays.map((m) => m.why)).toEqual(["Birthday in 15 days"]);
    expect(c.ford.map((m) => m.why)).toEqual(["Marathon · in 4 days"]);
    expect(c.routineB.map((m) => m.name)).toEqual(["NoB C"]);
  });
  it("is empty with no studio", () => {
    expect(cohortsOf([client("x", { isRoutineBActive: false })], null, TODAY).routineB).toEqual([]);
  });
});
