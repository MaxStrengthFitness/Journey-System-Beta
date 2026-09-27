import { describe, expect, it } from "vitest";
import type { FranchiseNetwork } from "../../../types";
import {
  focusableNetworks,
  focusFields,
  focusSetLine,
  focusWrite,
  launchOutcome,
  launchRequest,
  mayActForNetwork,
  noFocusReason,
  studioList,
} from "./network-actions";

/**
 * The network's two actions, moved from Relay → Network to Operations → All
 * my studios (voice-review round, Sep 27 2026), and the ranking dropped.
 */

const net = (id: string, name: string, studioIds: string[], owner?: string, owners?: string[]): FranchiseNetwork => ({
  id,
  name,
  studioIds,
  ...(owner ? { ownerId: owner } : {}),
  ...(owners ? { ownerIds: owners } : {}),
});

const NETWORKS = [
  net("n-ohio", "Ohio", ["westlake", "strongsville", "willoughby"], "t-own"),
  net("n-east", "East", ["solon"], undefined, ["t-co", "t-own2"]),
  net("n-west", "West", ["denver"], "t-someone"),
];

describe("mayActForNetwork", () => {
  it("is the franchise owners and the company, as Relay → Network was", () => {
    for (const role of ["Admin", "Founder", "Overseer", "Owner", "FranchiseOwner"]) expect(mayActForNetwork({ role } as never), role).toBe(true);
    for (const role of ["StudioLeader", "HeadTrainer", "StudioOwner", "LifeTransformer", "Trainer"]) expect(mayActForNetwork({ role } as never), role).toBe(false);
    expect(mayActForNetwork(null)).toBe(false);
  });
});

describe("focusableNetworks", () => {
  const all = ["westlake", "strongsville", "willoughby", "solon", "denver"];

  it("gives the company every network that holds a studio in scope, by name", () => {
    expect(focusableNetworks({ id: "t-admin", role: "Admin" }, NETWORKS, all).map((n) => n.id)).toEqual(["n-east", "n-ohio", "n-west"]);
    expect(focusableNetworks({ id: "t-admin", role: "Founder" }, NETWORKS, ["solon"]).map((n) => n.id)).toEqual(["n-east"]);
  });

  it("gives an owner, like the company, every network that holds a studio in their scope (AJ, Sep 27 2026)", () => {
    expect(focusableNetworks({ id: "t-own", role: "FranchiseOwner" }, NETWORKS, ["westlake", "strongsville"]).map((n) => n.id)).toEqual(["n-ohio"]);
    expect(focusableNetworks({ id: "t-own2", role: "Owner" }, NETWORKS, all).map((n) => n.id)).toEqual(["n-east", "n-ohio", "n-west"]);
  });

  it("offers an owner a network that holds their studio even when the network does not list them", () => {
    // "Choose later" makes a network with no owner, and nothing lists one afterwards.
    const ownerless = [net("n-lake", "Lake", ["willoughby"])];
    expect(focusableNetworks({ id: "t-new", role: "FranchiseOwner" }, ownerless, ["willoughby"]).map((n) => n.id)).toEqual(["n-lake"]);
    // ...and not a network that holds none of the studios in scope.
    expect(focusableNetworks({ id: "t-own", role: "FranchiseOwner" }, NETWORKS, ["solon"]).map((n) => n.id)).toEqual(["n-east"]);
  });

  it("offers nothing from inside Demo Mode, whose scope is the practice studio alone", () => {
    expect(focusableNetworks({ id: "t-own", role: "FranchiseOwner" }, NETWORKS, ["demo-studio"])).toEqual([]);
    expect(focusableNetworks({ id: "t-admin", role: "Admin" }, NETWORKS, ["demo-studio"])).toEqual([]);
    // Even a network that somehow listed the practice studio stays out of reach from it.
    const mixed = [net("n-mixed", "Mixed", ["demo-studio", "westlake"], "t-own")];
    expect(focusableNetworks({ id: "t-own", role: "FranchiseOwner" }, mixed, ["demo-studio"])).toEqual([]);
  });

  it("gives a studio leader none", () => {
    expect(focusableNetworks({ id: "t-own", role: "StudioLeader" }, NETWORKS, all)).toEqual([]);
  });
});

describe("noFocusReason", () => {
  const solon = { id: "solon" };
  const westlake = { id: "westlake", networkId: "n-ohio" };

  it("cannot tell while the networks have not come through: an empty list is loading, failed or none, and the hook says which of those never", () => {
    expect(noFocusReason([solon], [])).toBe("cannot-tell");
    expect(noFocusReason([solon, westlake], [])).toBe("cannot-tell");
  });

  it("cannot tell when a studio's own record names a network the list does not hold", () => {
    expect(noFocusReason([westlake], [{ id: "n-east" }])).toBe("cannot-tell");
  });

  it("says not in a network only once the list came back and no studio points past it", () => {
    expect(noFocusReason([solon], [{ id: "n-east" }])).toBe("not-in-network");
    expect(noFocusReason([{ id: "solon", networkId: null }], [{ id: "n-east" }])).toBe("not-in-network");
  });

  it("knows the practice studio is not in one, whatever the list holds (the realm rule)", () => {
    expect(noFocusReason([{ id: "demo-studio" }], [])).toBe("not-in-network");
    expect(noFocusReason([{ id: "demo-studio", networkId: "n-ohio" }], [{ id: "n-east" }])).toBe("not-in-network");
  });
});

describe("focusWrite", () => {
  const by = { id: "uid-ann", name: "Ann Owner" };

  it("writes only the lines that changed, trimmed, with who and when", () => {
    expect(focusWrite({ machine: "  Leg Curl " }, by, "AT")).toEqual({
      "relayFocus.machine": "Leg Curl",
      "relayFocus.setBy": by,
      "relayFocus.setAt": "AT",
    });
  });

  it("holds each line to its limit", () => {
    const out = focusWrite({ mastery: "x".repeat(200), note: "y".repeat(900) }, by, "AT");
    expect((out["relayFocus.mastery"] as string).length).toBe(120);
    expect((out["relayFocus.note"] as string).length).toBe(500);
  });

  it("writes nothing for an empty patch", () => {
    expect(focusWrite({}, by, "AT")).toEqual({});
  });

  it("says who set the focus and on which day, as the studio's Eastern day", () => {
    // 02:30 UTC on Sep 28 is still Sep 27 in Ohio.
    const at = new Date("2026-09-28T02:30:00Z");
    expect(focusSetLine({ setBy: { name: "Ann Owner" }, setAt: at }, "America/New_York")).toBe("Set by Ann Owner on Sep 27, 2026.");
    // A Firestore Timestamp, and one that lost its prototype in the cache.
    expect(focusSetLine({ setBy: { name: "Ann Owner" }, setAt: { toDate: () => at } }, "America/New_York")).toBe("Set by Ann Owner on Sep 27, 2026.");
    expect(focusSetLine({ setBy: { name: "Ann Owner" }, setAt: { seconds: at.getTime() / 1000, nanoseconds: 0 } }, "America/New_York")).toBe(
      "Set by Ann Owner on Sep 27, 2026.",
    );
  });

  it("says who only while the save's time is on its way, and the day only when nobody is named", () => {
    expect(focusSetLine({ setBy: { name: "Ann Owner" }, setAt: null })).toBe("Set by Ann Owner.");
    expect(focusSetLine({ setAt: new Date("2026-07-01T16:00:00Z") }, "America/New_York")).toBe("Set on Jul 1, 2026.");
    expect(focusSetLine({})).toBe("Set.");
    expect(focusSetLine(undefined)).toBe("Set.");
  });

  it("reads a network with no focus as three empty lines", () => {
    expect(focusFields({})).toEqual({ mastery: "", machine: "", note: "" });
    expect(focusFields({ relayFocus: { mastery: "Hip hinge" } })).toEqual({ mastery: "Hip hinge", machine: "", note: "" });
  });
});

describe("launchRequest", () => {
  const author = { id: "uid-ann", name: "Ann Owner" };

  it("posts an initiative with 'No date' and 'No number' as no blank at all", () => {
    const req = launchRequest({ title: " 50 InBody scans ", action: "inbody", perTrainer: 0, dueOn: null }, "solon", author);
    expect(req).toMatchObject({ studioId: "solon", kind: "initiative", title: "50 InBody scans", priority: "normal", expiry: "none" });
    expect(req.target).toEqual({ action: "inbody", perTrainer: 0 });
    expect(JSON.stringify(req)).not.toContain("undefined");
  });

  it("carries the count and the day when chosen", () => {
    expect(launchRequest({ title: "Pulse", action: "assessment", perTrainer: 5, dueOn: "2026-10-02" }, "solon", author).target).toEqual({
      action: "assessment",
      perTrainer: 5,
      dueOn: "2026-10-02",
    });
  });
});

describe("what the screen says", () => {
  it("lists studios in full", () => {
    expect(studioList(["Solon"])).toBe("Solon");
    expect(studioList(["Solon", "Westlake"])).toBe("Solon and Westlake");
    expect(studioList(["Solon", "Strongsville", "Westlake"])).toBe("Solon, Strongsville and Westlake");
  });

  it("says every studio, or which it missed and that Launch again posts only there", () => {
    expect(launchOutcome(4, [])).toEqual({ tone: "ok", text: "Posted at 4 studios. Each studio's Floor shows it with its requests." });
    expect(launchOutcome(1, [])).toMatchObject({ text: "Posted at 1 studio. Each studio's Floor shows it with its requests." });
    expect(launchOutcome(4, ["Solon"])).toEqual({
      tone: "warn",
      text: "Posted at 3 of 4 studios. Not posted at Solon — Launch again posts at that studio only.",
    });
  });
});
