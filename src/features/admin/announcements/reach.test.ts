import { describe, expect, it } from "vitest";
import { addressedTo, announcementReach } from "./reach";

const solon = { id: "solon", name: "Solon" };
const westlake = { id: "westlake", name: "Westlake" };
const demo = { id: "demo-studio", name: "Demo Mode", isDemo: true };
const all = [solon, westlake, demo];

describe("announcementReach — the realm rule (Oct 1 2026)", () => {
  it("REGRESSION: an administrator inside Demo Mode may address Demo Mode alone, fixed", () => {
    const r = announcementReach({ isAdmin: true, isOwnerTier: true, allStudios: all, readable: [demo], activeStudioId: "demo-studio" });
    expect(r.studios.map((s) => s.id)).toEqual(["demo-studio"]);
    expect(r.scopes).toEqual(["studio"]);
    expect(r.networks).toBe(false);
    expect(r.fixedStudioId).toBe("demo-studio");
  });

  it("an owner or a leader inside Demo Mode gets the same one audience", () => {
    for (const [isAdmin, isOwnerTier] of [[false, true], [false, false]] as const) {
      const r = announcementReach({ isAdmin, isOwnerTier, allStudios: all, readable: [demo], activeStudioId: "demo-studio" });
      expect(r.scopes).toEqual(["studio"]);
      expect(r.studios.map((s) => s.id)).toEqual(["demo-studio"]);
    }
  });

  it("outside Demo Mode keeps each tier's reach, and never offers Demo Mode", () => {
    const admin = announcementReach({ isAdmin: true, isOwnerTier: true, allStudios: all, readable: [solon], activeStudioId: "solon" });
    expect(admin.scopes).toEqual(["universal", "network", "studio"]);
    expect(admin.studios.map((s) => s.id)).toEqual(["solon", "westlake"]);
    expect(admin.fixedStudioId).toBeUndefined();
    const owner = announcementReach({ isAdmin: false, isOwnerTier: true, allStudios: all, readable: [solon, westlake], activeStudioId: "solon" });
    expect(owner.scopes).toEqual(["network", "studio"]);
    const lead = announcementReach({ isAdmin: false, isOwnerTier: false, allStudios: all, readable: [solon, demo], activeStudioId: "solon" });
    expect(lead.scopes).toEqual(["studio"]);
    expect(lead.studios.map((s) => s.id)).toEqual(["solon"]);
  });
});

describe("addressedTo", () => {
  it("is a notice to that one studio by name, in either spelling", () => {
    expect(addressedTo({ targetScope: "studio", targetStudioIds: ["demo-studio"] }, "demo-studio")).toBe(true);
    expect(addressedTo({ targetScope: "studio", targetId: "demo-studio" }, "demo-studio")).toBe(true);
    expect(addressedTo({ studioId: "demo-studio" }, "demo-studio")).toBe(true);
  });

  it("never a notice to everyone, a network, or another studio", () => {
    expect(addressedTo({ targetScope: "universal", studioId: "all" }, "demo-studio")).toBe(false);
    expect(addressedTo({ targetScope: "network", targetStudioIds: ["demo-studio"] }, "demo-studio")).toBe(false);
    expect(addressedTo({ targetScope: "studio", targetStudioIds: ["solon"] }, "demo-studio")).toBe(false);
  });
});
