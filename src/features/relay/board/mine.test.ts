import { describe, expect, it } from "vitest";
import { followUps, handedAsks, isGrowthRow, isMyClient, myClients } from "./mine";
import type { Client } from "../../../types";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TaskRow } from "../../studio-tasks/types";

const TODAY = "2026-09-16";
const client = (id: string, over: Record<string, unknown> = {}): Client =>
  ({ id, firstName: id, lastName: "Client", isActive: true, homeStudioId: "s1", ...over }) as unknown as Client;

describe("my clients", () => {
  it("counts a client coached lately, tallied, or won", () => {
    expect(isMyClient(client("a", { renewal: { coachIds: ["t1"] } }), "t1")).toBe(true);
    expect(isMyClient(client("b", { trainerTally: { t1: 3 } }), "t1")).toBe(true);
    expect(isMyClient(client("c", { topTrainerId: "t1" }), "t1")).toBe(true);
    expect(isMyClient(client("d", { trainerTally: { t2: 3 } }), "t1")).toBe(false);
    expect(isMyClient(client("e"), null)).toBe(false);
    expect(myClients([client("f", { topTrainerId: "t1", isActive: false })], "t1")).toEqual([]);
  });
});

describe("followUps", () => {
  it("lists birthdays and FORD dates in the window, soonest first", () => {
    const list = followUps(
      [
        client("Priya", { topTrainerId: "t1", dateOfBirth: "1980-09-19" }),
        client("Marcus", { topTrainerId: "t1", fordSummary: { nextDate: { date: "2026-09-17", label: "Daughter's wedding", pillar: "family" } } }),
        client("Far", { topTrainerId: "t1", dateOfBirth: "1980-12-01" }),
        client("NotMine", { topTrainerId: "t2", dateOfBirth: "1980-09-17" }),
        client("Both", { topTrainerId: "t1", dateOfBirth: "1990-09-16", fordSummary: { nextDate: { date: "2026-09-30", label: "Marathon", pillar: "recreation" } } }),
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
    const list = followUps([client("x", { topTrainerId: "t1", fordSummary: { nextDate: { date: "soon", label: "?", pillar: null } } }), client("y", { topTrainerId: "t1", fordSummary: { nextDate: { date: "2026-09-01", label: "past", pillar: null } } })], "t1", TODAY);
    expect(list).toEqual([]);
  });
});

describe("lanes", () => {
  it("knows a growth row and a hand-off", () => {
    expect(isGrowthRow({ template: { category: "growth" } } as TaskRow)).toBe(true);
    expect(isGrowthRow({ template: { category: "ops" } } as TaskRow)).toBe(false);
    const asks = [
      { id: "a", status: "open", forId: "u1" },
      { id: "b", status: "open", forId: "t1" },
      { id: "c", status: "resolved", forId: "u1" },
      { id: "d", status: "open" },
    ] as TaskRequest[];
    expect(handedAsks(asks, ["u1", "t1", null]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
