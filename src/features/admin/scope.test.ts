import { describe, expect, it } from "vitest";
import type { FranchiseNetwork, Studio, Trainer } from "../../types";
import { operationsStudios, studiosInScope } from "./scope";

const studios = [
  { id: "westlake", name: "Westlake", ownerId: "own-w" },
  { id: "solon", name: "Solon" },
  { id: "strongsville", name: "Strongsville" },
  { id: "willoughby", name: "Willoughby" },
] as Studio[];

const networks = [{ id: "n1", name: "East", ownerIds: ["own-e"], studioIds: ["solon", "willoughby"] }] as FranchiseNetwork[];

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
  it("gives the company tier every studio, by name", () => {
    expect(operationsStudios(trainer({ role: "Founder" }), studios, networks).map((s) => s.id)).toEqual([
      "solon",
      "strongsville",
      "westlake",
      "willoughby",
    ]);
    expect(operationsStudios(trainer({}), studios, networks, true)).toHaveLength(4);
  });

  it("gives an owner the studios that reach them — ownerId, ownedStudioIds, a network they own", () => {
    expect(operationsStudios(trainer({ id: "own-w", role: "Owner" }), studios, networks).map((s) => s.id)).toEqual(["westlake"]);
    expect(operationsStudios(trainer({ id: "own-e", role: "FranchiseOwner" }), studios, networks).map((s) => s.id)).toEqual([
      "solon",
      "willoughby",
    ]);
    expect(
      operationsStudios(trainer({ role: "Owner", ownedStudioIds: ["strongsville"] }), studios, networks).map((s) => s.id),
    ).toEqual(["strongsville"]);
  });

  it("gives a studio leader the studios they run, and the grant counts", () => {
    expect(operationsStudios(trainer({ role: "HeadTrainer" }), studios, networks).map((s) => s.id)).toEqual(["solon"]);
    expect(
      operationsStudios(trainer({ role: "StudioOwner", ownedStudioIds: ["westlake"] }), studios, networks).map((s) => s.id),
    ).toEqual(["solon", "westlake"]);
    expect(operationsStudios(trainer({ managedStudioIds: ["strongsville"] }), studios, networks).map((s) => s.id)).toEqual([
      "strongsville",
    ]);
    expect(operationsStudios(trainer({}), studios, networks)).toEqual([]);
    expect(operationsStudios(null, studios, networks)).toEqual([]);
  });
});

describe("studiosInScope", () => {
  it("is every readable studio for all, and the one studio otherwise — the app's own copy when it is the active one", () => {
    const readable = studios.slice(0, 2);
    expect(studiosInScope({ kind: "all" }, readable, null)).toHaveLength(2);
    const active = { id: "solon", name: "Solon (live)" } as Studio;
    expect(studiosInScope({ kind: "studio", studioId: "solon" }, readable, active)).toEqual([active]);
    expect(studiosInScope({ kind: "studio", studioId: "westlake" }, readable, active).map((s) => s.id)).toEqual(["westlake"]);
  });
});
