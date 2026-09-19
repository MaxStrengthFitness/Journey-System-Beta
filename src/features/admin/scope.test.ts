import { describe, expect, it } from "vitest";
import type { Studio, Trainer } from "../../types";
import { initialScope, operationsStudios, studiosInScope } from "./scope";

const studios = [
  { id: "westlake", name: "Westlake" },
  { id: "solon", name: "Solon" },
  { id: "strongsville", name: "Strongsville" },
] as Studio[];

const trainer = (extra: Partial<Trainer>): Trainer =>
  ({
    id: "t1",
    fullName: "T One",
    initials: "TO",
    role: "LifeTransformer",
    primaryHomeStudioId: "solon",
    accessibleStudioIds: ["solon"],
    activeGuestStudioIds: [],
    ...extra,
  }) as Trainer;

describe("operationsStudios — what a reader may look at", () => {
  it("gives the company and owner tiers every studio, by name", () => {
    expect(operationsStudios(trainer({ role: "Owner" }), studios).map((s) => s.id)).toEqual(["solon", "strongsville", "westlake"]);
    expect(operationsStudios(trainer({}), studios, true)).toHaveLength(3);
  });

  it("gives a studio leader the studios they run, and the grant counts", () => {
    expect(operationsStudios(trainer({ role: "HeadTrainer" }), studios).map((s) => s.id)).toEqual(["solon"]);
    expect(
      operationsStudios(trainer({ role: "StudioOwner", ownedStudioIds: ["solon", "westlake"] }), studios).map((s) => s.id),
    ).toEqual(["solon", "westlake"]);
    expect(operationsStudios(trainer({ managedStudioIds: ["strongsville"] }), studios).map((s) => s.id)).toEqual(["strongsville"]);
    expect(operationsStudios(trainer({}), studios)).toEqual([]);
  });
});

describe("the scope", () => {
  it("opens on the active studio when readable, else the first, never on all", () => {
    const readable = operationsStudios(trainer({ role: "Owner" }), studios);
    expect(initialScope(readable, "westlake")).toEqual({ kind: "studio", studioId: "westlake" });
    expect(initialScope(readable, "nowhere")).toEqual({ kind: "studio", studioId: "solon" });
    expect(initialScope([], "solon")).toBeNull();
  });

  it("lists the studios a scope covers", () => {
    expect(studiosInScope({ kind: "all" }, studios)).toHaveLength(3);
    expect(studiosInScope({ kind: "studio", studioId: "solon" }, studios).map((s) => s.id)).toEqual(["solon"]);
  });
});
