import { describe, expect, it } from "vitest";
import type { FranchiseNetwork, Studio } from "../../../types";
import {
  deleteStudioPlan,
  findLocationConflict,
  findOrphans,
  hasOrphans,
  linkPlan,
  mindbodyLinkState,
  repairPlan,
  standardSetSeed,
  unlinkPlan,
  validateStudioIdentity,
} from "./registry";

const studio = (over: Partial<Studio> & { id: string }): Studio => ({
  name: over.id,
  ownerId: "t1",
  timezone: "America/New_York",
  ...over,
});

const network = (over: Partial<FranchiseNetwork> & { id: string }): FranchiseNetwork => ({
  name: over.id,
  studioIds: [],
  ...over,
});

describe("findLocationConflict", () => {
  const studios = [
    studio({ id: "solon", mindbodySiteId: "5746957", mindbodyLocationId: "1" }),
    studio({ id: "willoughby", mindbodySiteId: "29068", mindbodyLocationId: "4" }),
  ];

  it("finds a studio already on that site and location", () => {
    expect(findLocationConflict("5746957", "1", studios)?.id).toBe("solon");
  });

  it("compares as trimmed strings, since one side is a number in Firestore", () => {
    expect(findLocationConflict(" 5746957 ", " 1 ", studios)?.id).toBe("solon");
    expect(
      findLocationConflict("29068", "4", [
        studio({ id: "n", mindbodySiteId: 29068 as any, mindbodyLocationId: 4 as any }),
      ])?.id,
    ).toBe("n");
  });

  it("ignores the studio being edited", () => {
    expect(findLocationConflict("5746957", "1", studios, "solon")).toBeNull();
  });

  it("is not a conflict without a location — that is a different rule", () => {
    expect(findLocationConflict("5746957", "", studios)).toBeNull();
  });
});

describe("validateStudioIdentity", () => {
  const studios = [
    studio({ id: "a", mindbodySiteId: "100", mindbodyLocationId: "1" }),
    studio({ id: "b", mindbodySiteId: "100", mindbodyLocationId: "2" }),
  ];

  it("requires a site id", () => {
    expect(
      validateStudioIdentity({ siteId: "  ", locationId: "1", studios }),
    ).toMatchObject({ code: "no-site" });
  });

  it("refuses a location another studio already claims", () => {
    expect(
      validateStudioIdentity({ siteId: "100", locationId: "2", studios }),
    ).toMatchObject({ code: "location-taken" });
  });

  it("requires a location when the site is shared", () => {
    // Without one, a second studio on the site pulls in every location's
    // bookings and the schedules mix.
    const problem = validateStudioIdentity({
      siteId: "100",
      locationId: "",
      studios,
    });
    expect(problem).toMatchObject({ code: "shared-site-needs-location" });
    expect((problem as any).siblings).toHaveLength(2);
  });

  it("lets a deliberately offline studio exist with no Site ID", () => {
    // Requiring one unconditionally is what made an offline studio
    // impossible to create — the whole point of the fallback protocol.
    expect(
      validateStudioIdentity({
        siteId: "",
        locationId: "",
        studios,
        mode: "offline",
      }),
    ).toBeNull();
  });

  it("still checks a site id an offline studio supplies anyway", () => {
    expect(
      validateStudioIdentity({
        siteId: "100",
        locationId: "2",
        studios,
        mode: "offline",
      }),
    ).toMatchObject({ code: "location-taken" });
  });

  it("allows no location on a site nobody else uses", () => {
    expect(
      validateStudioIdentity({ siteId: "999", locationId: "", studios }),
    ).toBeNull();
  });

  it("lets a studio keep its own location while editing", () => {
    expect(
      validateStudioIdentity({
        siteId: "100",
        locationId: "2",
        studios,
        excludeStudioId: "b",
      }),
    ).toBeNull();
  });
});

describe("mindbodyLinkState", () => {
  it("is unlinked with no site id", () => {
    expect(mindbodyLinkState(studio({ id: "x" }), [])).toBe("unlinked");
  });

  it("is linked when the site belongs to this studio alone", () => {
    const s = studio({ id: "x", mindbodySiteId: "1" });
    expect(mindbodyLinkState(s, [s])).toBe("linked");
  });

  it("distinguishes a deliberately offline studio from an unconfigured one", () => {
    // Showing both as "Not linked" is how a demo floor ends up looking broken
    // on every screen that lists it.
    const offline = studio({ id: "demo", mindbodyMode: "offline" });
    expect(mindbodyLinkState(offline, [offline])).toBe("offline");
    expect(mindbodyLinkState(studio({ id: "x" }), [])).toBe("unlinked");
  });

  it("flags a shared site with no location", () => {
    const a = studio({ id: "a", mindbodySiteId: "1" });
    const b = studio({ id: "b", mindbodySiteId: "1", mindbodyLocationId: "2" });
    expect(mindbodyLinkState(a, [a, b])).toBe("needs-location");
    expect(mindbodyLinkState(b, [a, b])).toBe("linked-shared");
  });
});

describe("linkPlan / unlinkPlan", () => {
  it("writes both sides of a link", () => {
    const plan = linkPlan(network({ id: "n1", studioIds: ["s0"] }), "s1");
    expect(plan).toEqual([
      { collection: "networks", id: "n1", data: { studioIds: ["s0", "s1"] } },
      { collection: "studios", id: "s1", data: { networkId: "n1" } },
    ]);
  });

  it("does nothing when the studio is already linked", () => {
    expect(linkPlan(network({ id: "n1", studioIds: ["s1"] }), "s1")).toEqual([]);
  });

  it("drops empty ids that earlier writes left behind", () => {
    const plan = linkPlan(network({ id: "n1", studioIds: ["", "s0"] as any }), "s1");
    expect(plan[0].data.studioIds).toEqual(["s0", "s1"]);
  });

  it("clears both sides on unlink", () => {
    const plan = unlinkPlan(network({ id: "n1", studioIds: ["s0", "s1"] }), "s1");
    expect(plan).toEqual([
      { collection: "networks", id: "n1", data: { studioIds: ["s0"] } },
      { collection: "studios", id: "s1", data: { networkId: null } },
    ]);
  });
});

describe("deleteStudioPlan", () => {
  it("removes the deleted studio from every network listing it", () => {
    // The orphan bug: the old delete removed the studio document and stopped,
    // leaving its id in the network array — while deleting a NETWORK
    // correctly unlinked its studios first.
    const plan = deleteStudioPlan(
      [
        network({ id: "n1", studioIds: ["s1", "s2"] }),
        network({ id: "n2", studioIds: ["s2"] }),
        network({ id: "n3", studioIds: ["s1"] }),
      ],
      "s1",
    );
    expect(plan).toEqual([
      { collection: "networks", id: "n1", data: { studioIds: ["s2"] } },
      { collection: "networks", id: "n3", data: { studioIds: [] } },
    ]);
  });

  it("is empty for a studio no network claims", () => {
    expect(deleteStudioPlan([network({ id: "n1", studioIds: ["s2"] })], "s1")).toEqual(
      [],
    );
  });
});

describe("findOrphans", () => {
  it("finds a network listing a studio that no longer exists", () => {
    const o = findOrphans(
      [network({ id: "n1", name: "Corporate", studioIds: ["gone", "s1"] })],
      [studio({ id: "s1", networkId: "n1" })],
    );
    expect(o.danglingStudioIds).toEqual([
      { networkId: "n1", networkName: "Corporate", studioIds: ["gone"] },
    ]);
    expect(hasOrphans(o)).toBe(true);
  });

  it("finds a studio naming a network that no longer exists", () => {
    const o = findOrphans([], [studio({ id: "s1", name: "Solon", networkId: "gone" })]);
    expect(o.strandedStudios).toEqual([
      { studioId: "s1", studioName: "Solon", networkId: "gone" },
    ]);
  });

  it("finds a link only the network knows about", () => {
    const o = findOrphans(
      [network({ id: "n1", studioIds: ["s1"] })],
      [studio({ id: "s1" })],
    );
    expect(o.oneSidedLinks).toEqual([
      expect.objectContaining({ studioId: "s1", side: "network-only" }),
    ]);
  });

  it("finds a link only the studio knows about", () => {
    const o = findOrphans(
      [network({ id: "n1", studioIds: [] })],
      [studio({ id: "s1", networkId: "n1" })],
    );
    expect(o.oneSidedLinks).toEqual([
      expect.objectContaining({ studioId: "s1", side: "studio-only" }),
    ]);
  });

  it("is quiet when both sides agree", () => {
    const o = findOrphans(
      [network({ id: "n1", studioIds: ["s1"] })],
      [studio({ id: "s1", networkId: "n1" })],
    );
    expect(hasOrphans(o)).toBe(false);
  });
});

describe("repairPlan", () => {
  it("drops a dangling id", () => {
    expect(
      repairPlan([network({ id: "n1", studioIds: ["gone", "s1"] })], [
        studio({ id: "s1", networkId: "n1" }),
      ]),
    ).toEqual([
      { collection: "networks", id: "n1", data: { studioIds: ["s1"] } },
    ]);
  });

  it("clears a studio pointing at a network that is gone", () => {
    expect(repairPlan([], [studio({ id: "s1", networkId: "gone" })])).toEqual([
      { collection: "studios", id: "s1", data: { networkId: null } },
    ]);
  });

  it("repairs a one-sided link toward the studio", () => {
    // The studio document is what every screen reads to decide which network
    // it is in, so the studio's answer is the surviving intent and the
    // network's array is a denormalised index of it.
    expect(
      repairPlan(
        [network({ id: "n1", studioIds: [] })],
        [studio({ id: "s1", networkId: "n1" })],
      ),
    ).toEqual([{ collection: "networks", id: "n1", data: { studioIds: ["s1"] } }]);
  });

  it("removes a studio the network claims but the studio disowns", () => {
    expect(
      repairPlan(
        [network({ id: "n1", studioIds: ["s1"] })],
        [studio({ id: "s1", networkId: "n2" }), studio({ id: "s2" })],
      ),
    ).toContainEqual({
      collection: "networks",
      id: "n1",
      data: { studioIds: [] },
    });
  });

  it("is empty when nothing is wrong", () => {
    expect(
      repairPlan(
        [network({ id: "n1", studioIds: ["s1"] })],
        [studio({ id: "s1", networkId: "n1" })],
      ),
    ).toEqual([]);
  });

  it("is idempotent — running it on the repaired state changes nothing", () => {
    const networks = [network({ id: "n1", studioIds: ["gone", "s1"] })];
    const studios = [studio({ id: "s1", networkId: "n1" }), studio({ id: "s2", networkId: "gone" })];
    const first = repairPlan(networks, studios);
    expect(first.length).toBeGreaterThan(0);

    // Apply it, then ask again.
    const applied = networks.map((n) => {
      const w = first.find((x) => x.collection === "networks" && x.id === n.id);
      return w ? { ...n, studioIds: w.data.studioIds as string[] } : n;
    });
    const appliedStudios = studios.map((s) => {
      const w = first.find((x) => x.collection === "studios" && x.id === s.id);
      return w ? { ...s, networkId: undefined } : s;
    });
    expect(repairPlan(applied, appliedStudios)).toEqual([]);
  });
});

describe("standardSetSeed", () => {
  const entry = (id: string, name: string, over: Record<string, unknown> = {}) => ({
    id,
    name,
    inStandardSet: true,
    status: "active",
    ...over,
  });

  it("seeds the whole standard set for a new studio", () => {
    const { seed } = standardSetSeed(
      [entry("m-leg-press", "LEG PRESS"), entry("m-ext", "LEG EXTENSION")],
      [],
    );
    expect(seed.map((s) => s.id)).toEqual(["m-leg-press", "m-ext"]);
  });

  it("skips machines the studio already has, so re-running adds nothing", () => {
    const catalog = [entry("m-leg-press", "LEG PRESS"), entry("m-ext", "LEG EXTENSION")];
    const { seed, alreadyPresent } = standardSetSeed(catalog, [
      "m-leg-press",
      "m-ext",
    ]);
    expect(seed).toEqual([]);
    expect(alreadyPresent).toBe(2);
  });

  it("collapses the duplicate Leg Extension rather than seeding both", () => {
    // "LEG EXTENSION" (m-ext, the app's default) and a Firestore document
    // filed as leg_extension under the older id convention are ONE machine.
    // Seeding both is how a studio ends up with two leg extensions on its
    // floor. The stray document is still wrong — `duplicates` names it so it
    // can be deleted at the source.
    const { seed, duplicates } = standardSetSeed(
      [entry("m-ext", "LEG EXTENSION"), entry("leg_extension", "Seated Leg Extension")],
      [],
    );
    expect(seed.map((s) => s.id)).toEqual(["m-ext"]);
    expect(duplicates).toEqual({ "m-ext": ["leg_extension"] });
  });

  it("does not re-seed a machine the studio holds under the other id", () => {
    const { seed, alreadyPresent } = standardSetSeed(
      [entry("leg_extension", "Seated Leg Extension")],
      ["m-ext"],
    );
    expect(seed).toEqual([]);
    expect(alreadyPresent).toBe(1);
  });

  it("leaves retired machines and anything outside the standard set alone", () => {
    const { seed } = standardSetSeed(
      [
        entry("m-a", "A", { status: "retired" }),
        entry("m-b", "B", { inStandardSet: false }),
        entry("m-c", "C"),
      ],
      [],
    );
    expect(seed.map((s) => s.id)).toEqual(["m-c"]);
  });

  it("keeps a studio's own machine distinct even when the name matches", () => {
    // sm-* ids are always their own canonical machine: two locations' bespoke
    // leg presses are genuinely different, and collapsing them would merge
    // their leaderboards.
    const { seed } = standardSetSeed(
      [entry("m-leg-press", "LEG PRESS"), entry("sm-solon-leg-press", "LEG PRESS")],
      [],
    );
    expect(seed).toHaveLength(2);
  });
});
