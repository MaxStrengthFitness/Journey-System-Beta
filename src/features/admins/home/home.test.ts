import { describe, expect, it } from "vitest";
import type { FranchiseNetwork, LimboEntry, Studio } from "../../../types";
import type { ReportView } from "../../admin/bugs/reportView";
import { syncRows, type LeaseRead } from "../machinery/sync-check";
import { MAX_NEEDS, needItems, needsHeadline, type NeedInputs } from "./needs";
import { networkSentence, standardSentence } from "./sentences";

const tz = "America/New_York";
// Monday Sep 28 2026, 9:08 AM Eastern.
const nowDate = new Date("2026-09-28T13:08:00Z");
const now = nowDate.getTime();
const min = 60_000;

const studios = [
  { id: "westlake", name: "Westlake", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "3", journeyCutoverDate: "2026-09-14" },
  { id: "strongsville", name: "Strongsville", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "5" },
  { id: "willoughby", name: "Willoughby", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "4" },
  { id: "solon", name: "Solon", timezone: tz, mindbodySiteId: "5746957", mindbodyLocationId: "1" },
  { id: "mentor", name: "Mentor", timezone: tz },
  { id: "demo-studio", name: "Demo Studio", timezone: tz, isDemo: true, mindbodyMode: "offline" },
] as unknown as Studio[];

const leases: Record<string, LeaseRead> = {
  westlake: { state: "ok", lease: { lastScheduleSyncAt: now - 6 * min, scheduleSyncFailures: 0 } },
  strongsville: { state: "ok", lease: { lastScheduleSyncAt: now - 90 * min, scheduleSyncFailures: 3 } },
  willoughby: { state: "failed" },
  solon: { state: "ok", lease: { lastScheduleSyncAt: now - 12 * min, scheduleSyncFailures: 1 } },
};

const limbo = [
  { id: "l1", kind: "booking", siteId: "29068", locationId: "5" },
  { id: "l2", kind: "booking", siteId: "29068", locationId: "5" },
  { id: "l3", kind: "client", siteId: "29068", locationId: "9" },
] as unknown as LimboEntry[];

const report = (id: string, status: ReportView["status"], createdAt: number, description: string, reporter = "Ioreth"): ReportView =>
  ({ id, status, createdAt, description, reporter, studioName: "Westlake" }) as ReportView;

const base = (): NeedInputs => ({
  studios,
  networks: [],
  sync: syncRows(studios, leases, now),
  limbo: { state: "ok", entries: limbo },
  bugs: {
    state: "ok",
    reports: [report("b1", "open", now - 2 * 86_400_000, "Timer froze after the Wrap-up"), report("b2", "open", now - 86_400_000, "Leg Press seat setting missing on the briefing", "Idril"), report("b3", "fixed", now, "Old one")],
  },
  offers: { state: "ok", pending: [{ id: "o1", machineName: "Hip Thrust (Nautilus)", studioName: "Solon", submittedAt: now - 3 * 86_400_000 }] },
  now,
});

describe("what needs you", () => {
  it("lists one item per kind, worst first, each with its proof, its door and when it clears", () => {
    const { items, more } = needItems(base());
    expect(items.map((i) => [i.id, i.say])).toEqual([
      ["sync-failing", "Strongsville's last 3 pulls from Mindbody failed."],
      ["mindbody-setup", "Mentor can't pull from Mindbody: it has no Site ID."],
      ["limbo", "3 Mindbody events couldn't be matched to a studio."],
      ["offers", "Solon offered Hip Thrust (Nautilus) to the MSF catalog."],
      ["bugs", "2 new bug reports."],
      ["unknown", "Couldn't check Willoughby's sync."],
    ]);
    expect(more).toEqual([]);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId.limbo.proof).toBe("2 look like Strongsville's; 1 names no studio yet. They're held in Limbo, never dropped.");
    expect(byId.offers.proof).toBe("Read it, correct it if need be, then publish or pass (waiting 3 days).");
    expect(byId.bugs.proof).toBe("The newest, from Idril at Westlake: “Leg Press seat setting missing on the briefing”");
    expect(byId["mindbody-setup"].door).toEqual({ label: "Open Mentor's setup", page: "studio", studioId: "mentor", tab: "setup" });
    expect(byId.unknown.door).toEqual({ label: "Check again", action: "check-again" });
    expect(byId.unknown.tone).toBe("unknown");
    for (const i of items) expect(i.clears).toMatch(/^Clears itself/);
  });

  it("waits for two failed pulls in a row before saying so", () => {
    const { items } = needItems(base());
    // Solon's one failed pull is on the sync page, not on Home.
    expect(items.find((i) => i.id === "sync-failing")!.say).not.toContain("Solon");
  });

  it("says a read that failed as couldn't check, never as nothing waiting", () => {
    const input = { ...base(), limbo: { state: "failed" as const, entries: [] }, bugs: { state: "failed" as const, reports: [] } };
    const { items } = needItems(input);
    expect(items.find((i) => i.id === "limbo")).toBeUndefined();
    expect(items.find((i) => i.id === "unknown")!.say).toBe("Couldn't check Willoughby's sync, Limbo and the bug reports.");
  });

  it("clears an item when its condition ends", () => {
    const calm: NeedInputs = {
      studios: [studios[0]],
      networks: [],
      sync: syncRows([studios[0]], leases, now),
      limbo: { state: "ok", entries: [] },
      bugs: { state: "ok", reports: [report("b3", "fixed", now, "Old one")] },
      offers: { state: "ok", pending: [] },
      now,
    };
    expect(needItems(calm).items).toEqual([]);
    expect(needsHeadline(0)).toBe("Nothing needs you right now.");
    expect(needsHeadline(1)).toBe("1 thing needs you.");
    expect(needsHeadline(3)).toBe("3 things need you.");
  });

  it("flags franchise listings that disagree with the studios", () => {
    const networks = [{ id: "ohio", name: "Max Strength Ohio", studioIds: ["gone"] }] as unknown as FranchiseNetwork[];
    const { items } = needItems({ ...base(), networks });
    expect(items.find((i) => i.id === "registry")!.say).toBe("The franchise listings and the studios disagree in 1 place.");
  });

  it("never shows more than seven", () => {
    expect(MAX_NEEDS).toBe(7);
  });
});

describe("the network and the standard", () => {
  it("says where every studio stands and how the pulls go, in one sentence", () => {
    expect(networkSentence(studios, [], syncRows(studios, leases, now), nowDate)).toBe(
      "5 studios. Mindbody not set up: Mentor. No cutover date yet: Solon, Strongsville and Willoughby. On Journey: Westlake. 1 studio pulled from Mindbody in the last two days; Strongsville and Solon failing to pull; couldn't check Willoughby.",
    );
    expect(networkSentence([], [], [], nowDate)).toBe("No studios yet.");
  });

  it("says what the standard holds and what waits on corporate", () => {
    const machines = [
      { id: "m1", status: "active" },
      { id: "m2", status: "active", inStandardSet: false },
      { id: "m3", status: "retired" },
    ];
    expect(standardSentence({ loading: false, failed: false, machines }, base().offers)).toBe(
      "1 machine in the standard set, of 2 in the MSF catalog. 1 machine a studio offered waits for a decision. Where studios set their own house defaults shows on Machines.",
    );
    expect(standardSentence({ loading: true, failed: false, machines: [] }, base().offers)).toBe("Reading the machine catalog…");
    expect(standardSentence({ loading: false, failed: true, machines: [] }, base().offers)).toBe("The machine catalog couldn't be read just now.");
  });
});
