import { describe, expect, it } from "vitest";
import type { LimboEntry, Studio } from "../../../types";
import { limboGroups, suggestedStudio } from "./limbo-groups";

const studios = [
  { id: "westlake", name: "Westlake", mindbodySiteId: "29068", mindbodyLocationId: "3" },
  { id: "strongsville", name: "Strongsville", mindbodySiteId: "29068", mindbodyLocationId: "5" },
  { id: "solon", name: "Solon", mindbodySiteId: "5746957" },
  { id: "avon", name: "Avon", mindbodySiteId: "7120334", mindbodyMode: "offline" },
  { id: "demo-studio", name: "Demo Studio", isDemo: true, mindbodySiteId: "999" },
] as unknown as Studio[];

const entry = (id: string, siteId: string | null, locationId: string | null, kind: LimboEntry["kind"] = "booking"): LimboEntry =>
  ({ id, eventId: id, eventType: "x", kind, siteId, locationId, clientId: null, reason: "No studio claims it" }) as LimboEntry;

describe("the registry's suggestion", () => {
  it("names the studio that claims the site and location", () => {
    expect(suggestedStudio(entry("a", "29068", "5"), studios)?.name).toBe("Strongsville");
  });

  it("gives a one-studio site its studio when it claims no location, or the event names none", () => {
    expect(suggestedStudio(entry("b", "5746957", "1"), studios)?.name).toBe("Solon");
    expect(suggestedStudio(entry("c", "5746957", null), studios)?.name).toBe("Solon");
  });

  it("suggests nothing it can't stand behind", () => {
    expect(suggestedStudio(entry("d", "29068", "9"), studios)).toBeNull();
    expect(suggestedStudio(entry("e", "29068", null), studios)).toBeNull();
    expect(suggestedStudio(entry("f", null, null), studios)).toBeNull();
    // Offline studios and the practice studio never take a booking.
    expect(suggestedStudio(entry("g", "7120334", null), studios)).toBeNull();
    expect(suggestedStudio(entry("h", "999", null), studios)).toBeNull();
  });
});

describe("Limbo's groups", () => {
  it("groups by site and location, biggest first, each with its count and its studio", () => {
    const groups = limboGroups(
      [entry("1", "29068", "5"), entry("2", "29068", "5"), entry("3", "29068", "5", "client"), entry("4", "5746957", null, "client"), entry("5", null, null)],
      studios,
    );
    expect(groups.map((g) => [g.heading, g.note])).toEqual([
      ["Site 29068 · location 5", "2 bookings and 1 client record. The registry says this is Strongsville."],
      ["Site 5746957 · no location given", "1 client record. The registry says this is Solon."],
      ["No Mindbody site on the event", "1 booking. Choose a studio for each."],
    ]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });

  it("says when no studio claims a site yet", () => {
    const [g] = limboGroups([entry("1", "29068", "9")], studios);
    expect(g.suggestion).toBeNull();
    expect(g.note).toBe("1 booking. No studio claims it yet: add the Site ID and location on the studio's page, or choose a studio for each.");
  });
});
