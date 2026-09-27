import { describe, expect, it } from "vitest";
import type { FranchiseNetwork } from "../../../types";
import {
  focusableNetworks,
  focusFields,
  focusWrite,
  launchOutcome,
  launchRequest,
  mayActForNetwork,
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

  it("gives an owner the networks they own, by ownerId or ownerIds", () => {
    expect(focusableNetworks({ id: "t-own", role: "FranchiseOwner" }, NETWORKS, all).map((n) => n.id)).toEqual(["n-ohio"]);
    expect(focusableNetworks({ id: "t-own2", role: "Owner" }, NETWORKS, all).map((n) => n.id)).toEqual(["n-east"]);
  });

  it("gives a studio leader none", () => {
    expect(focusableNetworks({ id: "t-own", role: "StudioLeader" }, NETWORKS, all)).toEqual([]);
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
