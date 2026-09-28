import { describe, expect, it } from "vitest";
import type { Studio } from "../../../types";
import { agoWords, syncRowOf, syncRows, syncSummary, whenWords, type LeaseRead } from "./sync-check";

const tz = "America/New_York";
// Monday Sep 28 2026, 9:08 AM Eastern.
const now = Date.parse("2026-09-28T13:08:00Z");
const min = 60_000;

const studios = [
  { id: "westlake", name: "Westlake", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "3" },
  { id: "strongsville", name: "Strongsville", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "5" },
  { id: "willoughby", name: "Willoughby", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "4" },
  { id: "solon", name: "Solon", timezone: tz, mindbodySiteId: "5746957", mindbodyLocationId: "1" },
  { id: "avon", name: "Avon", timezone: tz, mindbodyMode: "offline" },
  { id: "mentor", name: "Mentor", timezone: tz },
  { id: "demo-studio", name: "Demo Studio", timezone: tz, isDemo: true, mindbodyMode: "offline" },
] as unknown as Studio[];

const leases: Record<string, LeaseRead> = {
  westlake: { state: "ok", lease: { lastScheduleSyncAt: now - 6 * min, scheduleSyncFailures: 0, lastDeepScheduleSyncAt: Date.parse("2026-09-28T09:02:00Z") } },
  strongsville: { state: "ok", lease: { lastScheduleSyncAt: Date.parse("2026-09-27T13:14:00Z"), scheduleSyncFailures: 3 } },
  willoughby: { state: "failed" },
  solon: { state: "none" },
};

describe("the words for time", () => {
  it("says how long ago, and when in the studio's own day", () => {
    expect(agoWords(now - 20_000, now)).toBe("just now");
    expect(agoWords(now - 6 * min, now)).toBe("6 min ago");
    expect(agoWords(now - 3 * 60 * min, now)).toBe("3 hours ago");
    expect(agoWords(now - 2 * 24 * 60 * min, now)).toBe("2 days ago");
    expect(whenWords(Date.parse("2026-09-27T13:14:00Z"), tz)).toBe("Sun, Sep 27, 9:14 AM");
  });
});

describe("one studio's pull", () => {
  it("is fine when the last pull is recent, and says when the month was read", () => {
    expect(syncRowOf(studios[0], studios, leases.westlake, now)).toMatchObject({
      kind: "fine",
      tone: "ok",
      word: "Last pull 6 min ago",
      detail: "The whole month was last read Mon, Sep 28, 5:02 AM.",
      where: "site 29068 · location 3",
    });
  });

  it("calls failures failures, and only failures", () => {
    const r = syncRowOf(studios[1], studios, leases.strongsville, now);
    expect(r).toMatchObject({ kind: "failing", tone: "watch", word: "The last 3 pulls failed", failures: 3 });
    expect(r.detail).toContain("The last one started Sun, Sep 27, 9:14 AM.");
  });

  it("says couldn't check for a record it couldn't read, never never pulled", () => {
    expect(syncRowOf(studios[2], studios, leases.willoughby, now)).toMatchObject({ kind: "unknown", tone: "unknown", word: "Couldn't check" });
    expect(syncRowOf(studios[2], studios, { state: "loading" }, now)).toMatchObject({ kind: "checking", word: "Checking…" });
  });

  it("reads the old fields on the studio before the lease has been written", () => {
    const old = { ...studios[3], lastScheduleSyncAt: now - 10 * min } as Studio;
    expect(syncRowOf(old, studios, leases.solon, now)).toMatchObject({ kind: "fine", word: "Last pull 10 min ago" });
    expect(syncRowOf(studios[3], studios, leases.solon, now)).toMatchObject({ kind: "never", word: "Hasn't pulled yet" });
  });

  it("says a long gap as the fact it is, not as a failure", () => {
    const quiet: LeaseRead = { state: "ok", lease: { lastScheduleSyncAt: Date.parse("2026-09-25T22:00:00Z"), scheduleSyncFailures: 0 } };
    const r = syncRowOf(studios[3], studios, quiet, now);
    expect(r).toMatchObject({ kind: "gap", tone: "idle", word: "No pull since Fri, Sep 25" });
    expect(r.detail).toContain("Nothing failed.");
  });

  it("names what a Mindbody link is missing, and leaves an offline studio be", () => {
    expect(syncRowOf(studios[5], studios, undefined, now)).toMatchObject({ kind: "no-site", word: "No Mindbody Site ID" });
    const shared = { id: "chardon", name: "Chardon", timezone: tz, mindbodySiteId: "29068" } as unknown as Studio;
    expect(syncRowOf(shared, [...studios, shared], undefined, now)).toMatchObject({ kind: "no-location", word: "No Mindbody location" });
    expect(syncRowOf(studios[4], studios, undefined, now)).toMatchObject({ kind: "offline", tone: "idle" });
    const manual = { ...studios[0], autoSyncEnabled: false } as Studio;
    expect(syncRowOf(manual, studios, leases.westlake, now)).toMatchObject({ kind: "manual", word: "Automatic pull switched off" });
  });
});

describe("every studio, worst first", () => {
  it("puts failures first and offline last, and leaves the practice studio out", () => {
    const rows = syncRows(studios, leases, now);
    expect(rows.map((r) => [r.name, r.kind])).toEqual([
      ["Strongsville", "failing"],
      ["Willoughby", "unknown"],
      ["Mentor", "no-site"],
      ["Solon", "never"],
      ["Westlake", "fine"],
      ["Avon", "offline"],
    ]);
  });

  it("says it in one sentence", () => {
    expect(syncSummary(syncRows(studios, leases, now))).toBe(
      "Strongsville is failing to pull; couldn't check Willoughby; Mentor can't pull until its Mindbody details are filled in. 1 studio pulled in the last two days.",
    );
    expect(syncSummary(syncRows([studios[0]], { westlake: leases.westlake }, now))).toBe("Nothing needs a look. 1 studio pulled in the last two days.");
    expect(syncSummary([])).toBe("No studios to check.");
  });
});
