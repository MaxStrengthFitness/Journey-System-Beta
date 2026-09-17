import { describe, expect, it } from "vitest";
import { planRebuild } from "./rebuild";

const homes = new Map<string, string | null>([
  ["judy", "solon"],
  ["sam", "solon"],
  ["pat", "westlake"],
  ["drifter", null],
]);

describe("rebuilding the studio index from the record", () => {
  it("files each client's row under her HOME studio and the machine", () => {
    const plan = planRebuild(
      [
        { clientId: "judy", machineId: "m-leg-press", settings: { Seat: "4", Gap: "0" }, updatedAtMs: 10 },
        { clientId: "sam", machineId: "m-leg-press", settings: { seat: "2" }, sources: { seat: "suggested" }, updatedAtMs: 20 },
        { clientId: "pat", machineId: "m-leg-press", settings: { Seat: "6" }, updatedAtMs: 30 },
        { clientId: "judy", machineId: "m-abs", settings: { Seat: "3" }, updatedAtMs: 40 },
      ],
      homes,
    );
    expect(plan.rows).toBe(4);
    expect([...plan.studios.keys()].sort()).toEqual(["solon", "westlake"]);
    expect(plan.studios.get("solon")!.get("m-leg-press")).toEqual({
      judy: { s: { seat: "4", gap: "0" }, t: 10 },
      sam: { s: { seat: "2" }, src: { seat: "suggested" }, t: 20 },
    });
    expect(Object.keys(plan.studios.get("westlake")!.get("m-leg-press")!)).toEqual(["pat"]);
  });

  it("counts what it could not place instead of guessing a studio", () => {
    const plan = planRebuild(
      [
        { clientId: "drifter", machineId: "m-abs", settings: { Seat: "3" }, updatedAtMs: 1 },
        { clientId: "stranger", machineId: "m-abs", settings: { Seat: "3" }, updatedAtMs: 1 },
        { clientId: "judy", machineId: "m-abs", settings: {}, updatedAtMs: 1 },
        { clientId: "judy", machineId: null, settings: { Seat: "3" }, updatedAtMs: 1 },
        { machineId: "m-abs", settings: { Seat: "3" }, updatedAtMs: 1 },
      ],
      homes,
    );
    expect(plan).toMatchObject({ rows: 0, noStudio: 2, empty: 3 });
    expect(plan.studios.size).toBe(0);
  });

  it("keeps the newer of two documents for the same client and machine", () => {
    const plan = planRebuild(
      [
        { clientId: "judy", machineId: "m-abs", settings: { Seat: "5" }, updatedAtMs: 200 },
        { clientId: "judy", machineId: "m-abs", settings: { Seat: "3" }, updatedAtMs: 100 },
      ],
      homes,
    );
    expect(plan.rows).toBe(1);
    expect(plan.studios.get("solon")!.get("m-abs")!.judy.s.seat).toBe("5");
  });
});
