import { describe, expect, it } from "vitest";
import { followUps, isGrowthRow, isMyClient, myClients } from "./mine";
import type { Client } from "../../../types";
import type { TaskRow } from "../../studio-tasks/types";

const TODAY = "2026-09-16";
const client = (id: string, over: Record<string, unknown> = {}): Client =>
  ({ id, firstName: id, lastName: "Client", isActive: true, homeStudioId: "s1", ...over }) as unknown as Client;

describe("my clients", () => {
  it("counts a client coached in the last 60 days, under any of your ids, and nothing else (one Mine, Oct 2 2026)", () => {
    expect(isMyClient(client("a", { renewal: { coachIds: ["t1"] } }), "t1")).toBe(true);
    expect(isMyClient(client("a2", { renewal: { coachIds: ["uid-1"] } }), ["t1", "uid-1"])).toBe(true);
    expect(isMyClient(client("b", { trainerTally: { t1: 3 } }), "t1")).toBe(false);
    expect(isMyClient(client("c", { topTrainerId: "t1" }), "t1")).toBe(false);
    expect(isMyClient(client("d", { trainerTally: { t2: 3 } }), "t1")).toBe(false);
    expect(isMyClient(client("e"), null)).toBe(false);
    expect(myClients([client("f", { renewal: { coachIds: ["t1"] }, isActive: false })], "t1")).toEqual([]);
  });
});

describe("followUps", () => {
  it("lists birthdays and FORD dates in the window, soonest first", () => {
    const list = followUps(
      [
        client("Priya", { renewal: { coachIds: ["t1"] }, dateOfBirth: "1980-09-19" }),
        client("Marcus", { renewal: { coachIds: ["t1"] }, fordSummary: { nextDate: { date: "2026-09-17", label: "Daughter's wedding", pillar: "family" } } }),
        client("Far", { renewal: { coachIds: ["t1"] }, dateOfBirth: "1980-12-01" }),
        client("NotMine", { renewal: { coachIds: ["t2"] }, dateOfBirth: "1980-09-17" }),
        client("Both", { renewal: { coachIds: ["t1"] }, dateOfBirth: "1990-09-16", fordSummary: { nextDate: { date: "2026-09-30", label: "Marathon", pillar: "recreation" } } }),
      ],
      "t1",
      TODAY,
    );
    expect(list.map((f) => `${f.clientName}: ${f.label}`)).toEqual([
      "Both Client: Birthday today",
      "Marcus Client: Daughter's wedding · tomorrow",
      "Priya Client: Birthday in 3 days",
      "Both Client: Marathon · in 14 days",
    ]);
    expect(list[2].date).toBe("2026-09-19");
  });
  it("ignores malformed FORD dates and past one-offs", () => {
    const list = followUps([client("x", { renewal: { coachIds: ["t1"] }, fordSummary: { nextDate: { date: "soon", label: "?", pillar: null } } }), client("y", { renewal: { coachIds: ["t1"] }, fordSummary: { nextDate: { date: "2026-09-01", label: "past", pillar: null } } })], "t1", TODAY);
    expect(list).toEqual([]);
  });
});

describe("lanes", () => {
  it("knows a growth row (a hand-off is the Tracker's Handed to you since Sep 28 2026, relay/tracker.ts)", () => {
    expect(isGrowthRow({ template: { category: "growth" } } as TaskRow)).toBe(true);
    expect(isGrowthRow({ template: { category: "ops" } } as TaskRow)).toBe(false);
  });
});
