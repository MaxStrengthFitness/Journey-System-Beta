import { describe, expect, it } from "vitest";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import {
  attentionCounts,
  isSuperAdminRole,
  resolveScope,
  staffCountByStudio,
  trainerIsIn,
  visibleNetworks,
} from "./scope";

function studio(id: string, over: Partial<Studio> = {}): Studio {
  return {
    id,
    name: id.toUpperCase(),
    ownerId: "nobody",
    timezone: "America/New_York",
    ...over,
  } as Studio;
}

function trainer(id: string, over: Partial<Trainer> = {}): Trainer {
  return {
    id,
    fullName: id,
    initials: id.slice(0, 2).toUpperCase(),
    role: "Trainer",
    primaryHomeStudioId: "",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    ...over,
  } as Trainer;
}

function network(id: string, over: Partial<FranchiseNetwork> = {}): FranchiseNetwork {
  return { id, name: id, studioIds: [], ...over };
}

const OWNER = trainer("owner", { role: "FranchiseOwner" });
const ADMIN = trainer("admin", { role: "Admin" });

describe("isSuperAdminRole", () => {
  it("recognises the three that see everything", () => {
    expect(isSuperAdminRole("Founder")).toBe(true);
    expect(isSuperAdminRole("Admin")).toBe(true);
    expect(isSuperAdminRole("Overseer")).toBe(true);
  });

  it("does not promote a franchise owner", () => {
    expect(isSuperAdminRole("FranchiseOwner")).toBe(false);
    expect(isSuperAdminRole(undefined)).toBe(false);
  });
});

describe("visibleNetworks", () => {
  const nets = [
    network("n1", { ownerIds: ["owner"] }),
    network("n2", { ownerId: "owner" }),
    network("n3", { ownerIds: ["someone-else"] }),
  ];

  it("shows a super admin everything", () => {
    expect(visibleNetworks(nets, ADMIN)).toHaveLength(3);
  });

  it("reads both the modern ownerIds and the legacy ownerId", () => {
    expect(visibleNetworks(nets, OWNER).map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("shows an owner nothing when they own nothing", () => {
    expect(visibleNetworks(nets, trainer("stranger"))).toEqual([]);
  });
});

describe("resolveScope network selection", () => {
  const nets = [network("n1", { ownerIds: ["owner"], studioIds: ["s1"] })];

  it("REGRESSION: picks a network up when it arrives after the first render", () => {
    // The old screen seeded selectedNetworkId from useState on the render
    // where `networks` was still empty, and useState never reconsiders. An
    // owner with no picker therefore saw an empty screen permanently.
    const empty = resolveScope({
      viewer: OWNER,
      studios: [studio("s1")],
      trainers: [],
      networks: [],
      preferredNetworkId: null,
    });
    expect(empty.activeNetworkId).toBeNull();

    const arrived = resolveScope({
      viewer: OWNER,
      studios: [studio("s1")],
      trainers: [],
      networks: nets,
      // Still the stale null the old component would have been holding.
      preferredNetworkId: null,
    });
    expect(arrived.activeNetworkId).toBe("n1");
    expect(arrived.studios.map((s) => s.id)).toEqual(["s1"]);
  });

  it("honours a preference that names an available network", () => {
    const two = [
      network("n1", { ownerIds: ["owner"], studioIds: ["s1"] }),
      network("n2", { ownerIds: ["owner"], studioIds: ["s2"] }),
    ];
    const scope = resolveScope({
      viewer: OWNER,
      studios: [studio("s1"), studio("s2")],
      trainers: [],
      networks: two,
      preferredNetworkId: "n2",
    });
    expect(scope.activeNetworkId).toBe("n2");
  });

  it("falls back when the preference names a network that is gone", () => {
    const scope = resolveScope({
      viewer: OWNER,
      studios: [],
      trainers: [],
      networks: nets,
      preferredNetworkId: "deleted",
    });
    expect(scope.activeNetworkId).toBe("n1");
  });

  it("does not offer a network the viewer does not own", () => {
    const scope = resolveScope({
      viewer: OWNER,
      studios: [],
      trainers: [],
      networks: [network("theirs", { ownerIds: ["other"], studioIds: ["s9"] })],
      preferredNetworkId: "theirs",
    });
    expect(scope.networks).toEqual([]);
    expect(scope.activeNetworkId).toBeNull();
    expect(scope.studios).toEqual([]);
  });
});

describe("resolveScope studio membership", () => {
  const studios = [
    studio("byOwnerId", { ownerId: "owner" }),
    studio("byOwnedList"),
    studio("byNetwork"),
    studio("unrelated"),
  ];
  const nets = [network("n1", { ownerIds: ["owner"], studioIds: ["byNetwork"] })];
  const viewer = trainer("owner", {
    role: "FranchiseOwner",
    ownedStudioIds: ["byOwnedList"],
  });

  it("unions all three routes to ownership", () => {
    const scope = resolveScope({
      viewer,
      studios,
      trainers: [],
      networks: nets,
    });
    expect(scope.studios.map((s) => s.id).sort()).toEqual([
      "byNetwork",
      "byOwnedList",
      "byOwnerId",
    ]);
  });

  it("leaves out a studio that reaches the viewer by none of them", () => {
    const scope = resolveScope({ viewer, studios, trainers: [], networks: nets });
    expect(scope.studios.map((s) => s.id)).not.toContain("unrelated");
  });

  it("scopes a super admin to the network they are viewing, not everything", () => {
    const scope = resolveScope({
      viewer: ADMIN,
      studios,
      trainers: [],
      networks: [network("n1", { studioIds: ["byNetwork"] })],
    });
    expect(scope.studios.map((s) => s.id)).toEqual(["byNetwork"]);
  });

  it("sorts studios by name so the list does not shuffle", () => {
    const scope = resolveScope({
      viewer,
      studios: [
        studio("z", { name: "Zeta", ownerId: "owner" }),
        studio("a", { name: "Alpha", ownerId: "owner" }),
      ],
      trainers: [],
      networks: [],
    });
    expect(scope.studios.map((s) => s.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("ignores a studio with no id rather than matching it to everything", () => {
    const scope = resolveScope({
      viewer,
      studios: [{ name: "Unsaved", ownerId: "owner", timezone: "x" } as Studio],
      trainers: [],
      networks: [],
    });
    expect(scope.studios).toEqual([]);
  });
});

describe("trainerIsIn", () => {
  it("counts a home studio", () => {
    expect(trainerIsIn(trainer("t", { primaryHomeStudioId: "s1" }), ["s1"])).toBe(
      true,
    );
  });

  it("counts granted and guest access", () => {
    expect(
      trainerIsIn(trainer("t", { accessibleStudioIds: ["s2"] }), ["s2"]),
    ).toBe(true);
    expect(
      trainerIsIn(trainer("t", { activeGuestStudioIds: ["s3"] }), ["s3"]),
    ).toBe(true);
  });

  it("is false against an empty scope rather than true", () => {
    expect(trainerIsIn(trainer("t", { primaryHomeStudioId: "s1" }), [])).toBe(
      false,
    );
  });

  it("does not match a trainer with a blank home studio", () => {
    expect(trainerIsIn(trainer("t", { primaryHomeStudioId: "" }), [""])).toBe(
      false,
    );
  });
});

describe("resolveScope staff", () => {
  it("gathers everyone standing in a scoped studio, once each", () => {
    const scope = resolveScope({
      viewer: trainer("owner", { role: "FranchiseOwner", ownedStudioIds: ["s1"] }),
      studios: [studio("s1")],
      trainers: [
        trainer("home", { primaryHomeStudioId: "s1" }),
        trainer("guest", { activeGuestStudioIds: ["s1"] }),
        trainer("both", {
          primaryHomeStudioId: "s1",
          accessibleStudioIds: ["s1"],
        }),
        trainer("elsewhere", { primaryHomeStudioId: "other" }),
      ],
      networks: [],
    });
    expect(scope.staff.map((t) => t.id)).toEqual(["both", "guest", "home"]);
  });
});

describe("attentionCounts", () => {
  it("counts someone who signed in and has no role yet", () => {
    const counts = attentionCounts([
      trainer("waiting", { role: undefined as never }),
      trainer("in", { role: "Trainer" }),
    ]);
    expect(counts.awaitingApproval).toBe(1);
  });

  it("does not count an unclaimed placeholder as awaiting approval", () => {
    // A placeholder has no role either, but nobody is standing there waiting.
    const counts = attentionCounts([
      trainer("placeholder", { role: undefined as never, pendingClaim: true }),
    ]);
    expect(counts.awaitingApproval).toBe(0);
    expect(counts.unclaimed).toBe(1);
  });

  it("counts temporary profiles", () => {
    expect(
      attentionCounts([trainer("temp", { provisional: true })]).provisional,
    ).toBe(1);
  });

  it("counts approved staff with no Mindbody link", () => {
    const counts = attentionCounts([
      trainer("linked", { role: "Trainer", mindbodyStaffId: "9" }),
      trainer("not", { role: "Trainer" }),
      // Neither of these is an approved trainer, so neither is a fault here.
      trainer("waiting", { role: undefined as never }),
      trainer("placeholder", { role: undefined as never, pendingClaim: true }),
    ]);
    expect(counts.unlinkedStaff).toBe(1);
  });

  it("is all zeroes for a settled roster", () => {
    expect(
      attentionCounts([trainer("a", { role: "Trainer", mindbodyStaffId: "1" })]),
    ).toEqual({
      awaitingApproval: 0,
      unclaimed: 0,
      provisional: 0,
      unlinkedStaff: 0,
    });
  });
});

describe("staffCountByStudio", () => {
  it("counts per studio, and counts a shared trainer in both", () => {
    const staff = [
      trainer("a", { primaryHomeStudioId: "s1" }),
      trainer("b", { primaryHomeStudioId: "s2" }),
      trainer("c", { primaryHomeStudioId: "s1", accessibleStudioIds: ["s2"] }),
    ];
    expect(staffCountByStudio(staff, ["s1", "s2"])).toEqual({ s1: 2, s2: 2 });
  });

  it("gives an empty studio a zero rather than leaving the key out", () => {
    expect(staffCountByStudio([], ["s1"])).toEqual({ s1: 0 });
  });
});
