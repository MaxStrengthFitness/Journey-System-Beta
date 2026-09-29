/**
 * A STUDIO OPENING WITH OVERDUE SETUP ITEMS ON HOME — the third wave (Sep 29
 * 2026): the item's sentence, its proof, its door, its condition, and where
 * it sits among the others.
 */
import { describe, expect, it } from "vitest";
import type { Studio } from "../../../types";
import { syncRows, type LeaseRead } from "../machinery/sync-check";
import { needItems, type NeedInputs } from "./needs";
import { NO_LAUNCHES, type OverdueRead } from "./overdue-setup";

const tz = "America/New_York";
const now = Date.parse("2026-09-29T13:00:00Z");
const studios = [
  { id: "westlake", name: "Westlake", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "3" },
  { id: "mentor", name: "Mentor", timezone: tz },
] as unknown as Studio[];
const leases: Record<string, LeaseRead> = {
  westlake: { state: "ok", lease: { lastScheduleSyncAt: now - 6_000_000, scheduleSyncFailures: 3 } },
};

const base = (launches: OverdueRead = NO_LAUNCHES): NeedInputs => ({
  studios,
  networks: [],
  sync: syncRows(studios, leases, now),
  limbo: { state: "ok", entries: [] },
  bugs: { state: "ok", reports: [] },
  offers: { state: "ok", pending: [] },
  launches,
  now,
});

const mentor = { studioId: "mentor", name: "Mentor", leaders: ["Aragorn"], items: [{ id: "floor-names", title: "Each unit's name and starting settings checked", dueOn: "2026-09-21" }] };
const rivendell = {
  studioId: "rivendell",
  name: "Rivendell",
  leaders: [],
  items: [
    { id: "contact", title: "Business email, phone and address", dueOn: "2026-09-14" },
    { id: "cutover", title: "Journey cutover date set", dueOn: "2026-09-25" },
  ],
};

describe("a studio opening with overdue setup items", () => {
  it("names the studio, the item, its due day and who leads it, with a door to the studio's setup", () => {
    const item = needItems(base({ state: "ok", studios: [mentor], unread: [] })).items.find((i) => i.id === "launch-overdue")!;
    expect(item.say).toBe("Mentor's setup item “Each unit's name and starting settings checked” was due Mon, Sep 21, 2026.");
    expect(item.proof).toBe("Aragorn leads Mentor. Tick it, skip it with a reason, or move the opening day.");
    expect(item.door).toEqual({ label: "Open Mentor's setup", page: "studio", studioId: "mentor", tab: "setup" });
    expect(item.tone).toBe("watch");
    expect(item.kind).toBe("Launches");
    expect(item.condition).toBe("mentor:floor-names");
  });

  it("counts a studio's items, and sends several studios to Launches", () => {
    const one = needItems(base({ state: "ok", studios: [rivendell], unread: [] })).items.find((i) => i.id === "launch-overdue")!;
    expect(one.say).toBe("Rivendell has 2 setup items overdue; the oldest, “Business email, phone and address”, was due Mon, Sep 14, 2026.");
    expect(one.proof).toBe("Nobody leads Rivendell yet. Tick it, skip it with a reason, or move the opening day.");
    const two = needItems(base({ state: "ok", studios: [rivendell, mentor], unread: [] })).items.find((i) => i.id === "launch-overdue")!;
    expect(two.say).toBe("2 studios opening have setup items overdue: Rivendell and Mentor.");
    expect(two.proof).toBe("The oldest is Rivendell's “Business email, phone and address”, due Mon, Sep 14, 2026. Nobody leads Rivendell yet.");
    expect(two.door).toEqual({ label: "Open Launches", page: "launches" });
    expect(two.condition).toBe("mentor:floor-names,rivendell:contact,rivendell:cutover");
  });

  it("sits after the Mindbody items, and is absent while still reading or when nothing is late", () => {
    const ids = needItems(base({ state: "ok", studios: [mentor], unread: [] })).items.map((i) => i.id);
    expect(ids.slice(0, 3)).toEqual(["sync-failing", "mindbody-setup", "launch-overdue"]);
    expect(needItems(base({ state: "loading", studios: [], unread: [] })).items.find((i) => i.id === "launch-overdue")).toBeUndefined();
    expect(needItems(base()).items.find((i) => i.id === "launch-overdue")).toBeUndefined();
  });

  it("names a checklist that couldn't be read under Couldn't check, never as on time", () => {
    const { items } = needItems(base({ state: "ok", studios: [], unread: ["Rivendell"] }));
    expect(items.find((i) => i.id === "launch-overdue")).toBeUndefined();
    expect(items.find((i) => i.id === "unknown")!.say).toBe("Couldn't check Rivendell's setup checklist.");
  });
});
