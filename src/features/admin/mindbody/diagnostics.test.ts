import { describe, expect, it } from "vitest";
import type { Studio, Trainer } from "../../../types";
import {
  DEFAULT_INTERVAL_MINUTES,
  auditStudios,
  formatAge,
  linkStateOf,
  minutesSince,
  normaliseLog,
  orderLogs,
  summariseEstate,
  summariseHealth,
  syncStateOf,
  type HealthInput,
  type LinkState,
} from "./diagnostics";

const NOW = new Date("2026-09-06T12:00:00.000Z").getTime();
const MIN = 60_000;

function studio(over: Partial<Studio> = {}): Studio {
  return {
    id: "s1",
    name: "Powell",
    ownerId: "o1",
    timezone: "America/New_York",
    ...over,
  } as Studio;
}

function trainer(over: Partial<Trainer> = {}): Trainer {
  return {
    id: "t1",
    fullName: "Sam Reed",
    initials: "SR",
    role: "Trainer",
    primaryHomeStudioId: "s1",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    ...over,
  } as Trainer;
}

function health(over: Partial<HealthInput> = {}): HealthInput {
  return {
    status: "healthy",
    lastSuccessfulEventAt: new Date(NOW - 5 * MIN),
    lastFailureAt: null,
    dlqDepth: 0,
    signatureFailures24h: 0,
    webhookSubscriptionActive: true,
    hasData: true,
    ...over,
  };
}

describe("linkStateOf", () => {
  it("a site id means linked", () => {
    expect(linkStateOf({ mindbodySiteId: "12345" })).toBe("linked");
  });

  it("offline mode wins even when a site id is left behind", () => {
    expect(
      linkStateOf({ mindbodySiteId: "12345", mindbodyMode: "offline" }),
    ).toBe("offline");
  });

  it("no site id and no mode is a blank field, not a decision", () => {
    expect(linkStateOf({})).toBe("misconfigured");
  });

  it("marked linked with no site id is the case the old screen could not see", () => {
    expect(linkStateOf({ mindbodyMode: "linked" })).toBe("misconfigured");
  });

  it("a site id of whitespace is not a site id", () => {
    expect(linkStateOf({ mindbodySiteId: "   " })).toBe("misconfigured");
  });
});

describe("syncStateOf", () => {
  const linked: LinkState = "linked";

  it("nothing to sync when there is no Mindbody", () => {
    expect(syncStateOf("offline", {}, NOW)).toBe("n/a");
    expect(syncStateOf("misconfigured", {}, NOW)).toBe("n/a");
  });

  it("auto-sync off is manual, not late", () => {
    expect(
      syncStateOf(linked, { autoSyncEnabled: false, lastScheduleSyncAt: 0 }, NOW),
    ).toBe("manual");
  });

  it("never synced is stalled", () => {
    expect(syncStateOf(linked, {}, NOW)).toBe("stalled");
  });

  it("inside the interval is current", () => {
    expect(
      syncStateOf(
        linked,
        { syncIntervalMinutes: 15, lastScheduleSyncAt: NOW - 10 * MIN },
        NOW,
      ),
    ).toBe("current");
  });

  it("exactly one interval old is still current, not lagging", () => {
    expect(
      syncStateOf(
        linked,
        { syncIntervalMinutes: 15, lastScheduleSyncAt: NOW - 15 * MIN },
        NOW,
      ),
    ).toBe("current");
  });

  it("between one and three intervals is lagging", () => {
    expect(
      syncStateOf(
        linked,
        { syncIntervalMinutes: 15, lastScheduleSyncAt: NOW - 30 * MIN },
        NOW,
      ),
    ).toBe("lagging");
  });

  it("beyond three intervals is stalled", () => {
    expect(
      syncStateOf(
        linked,
        { syncIntervalMinutes: 15, lastScheduleSyncAt: NOW - 50 * MIN },
        NOW,
      ),
    ).toBe("stalled");
  });

  it("staleness is judged against THIS studio's interval, not a fixed number", () => {
    // 90 minutes old. Stalled on a 15-minute interval, current on a 4-hour one.
    const at = { lastScheduleSyncAt: NOW - 90 * MIN };
    expect(syncStateOf(linked, { ...at, syncIntervalMinutes: 15 }, NOW)).toBe(
      "stalled",
    );
    expect(syncStateOf(linked, { ...at, syncIntervalMinutes: 240 }, NOW)).toBe(
      "current",
    );
  });

  it("falls back to the shared default interval when none is set", () => {
    expect(
      syncStateOf(
        linked,
        { lastScheduleSyncAt: NOW - (DEFAULT_INTERVAL_MINUTES - 1) * MIN },
        NOW,
      ),
    ).toBe("current");
  });
});

describe("minutesSince / formatAge", () => {
  it("counts whole minutes", () => {
    expect(minutesSince(NOW - 4.9 * MIN, NOW)).toBe(4);
  });

  it("never goes negative when a clock runs ahead", () => {
    expect(minutesSince(NOW + 10 * MIN, NOW)).toBe(0);
  });

  it("is null for a time that never happened", () => {
    expect(minutesSince(null, NOW)).toBe(null);
    expect(minutesSince(0, NOW)).toBe(null);
  });

  it("reads as English at every scale", () => {
    expect(formatAge(null)).toBe("never");
    expect(formatAge(0)).toBe("under a minute");
    expect(formatAge(1)).toBe("1 minute");
    expect(formatAge(42)).toBe("42 minutes");
    expect(formatAge(60)).toBe("1 hour");
    expect(formatAge(200)).toBe("3 hours");
    expect(formatAge(60 * 24)).toBe("1 day");
    expect(formatAge(60 * 24 * 9)).toBe("9 days");
  });
});

describe("auditStudios", () => {
  it("counts linked staff at a studio, home and guest alike", () => {
    const [row] = auditStudios(
      [studio({ mindbodySiteId: "1", lastScheduleSyncAt: NOW })],
      [
        trainer({ id: "a", mindbodyStaffId: "100" }),
        trainer({ id: "b" }),
        trainer({
          id: "c",
          primaryHomeStudioId: "elsewhere",
          accessibleStudioIds: ["s1"],
          mindbodyStaffId: "300",
        }),
        trainer({ id: "d", primaryHomeStudioId: "elsewhere" }),
      ],
      NOW,
    );
    expect(row.staffTotal).toBe(3);
    expect(row.linkedStaff).toBe(2);
  });

  it("reports the blank Site ID as the fault, not the staleness it causes", () => {
    const [row] = auditStudios([studio({ mindbodyMode: "linked" })], [], NOW);
    expect(row.link).toBe("misconfigured");
    expect(row.problem).toContain("No Mindbody Site ID");
    // Not "never synced" — that is the symptom, and it would send someone
    // to look at the sync settings instead of the blank field.
    expect(row.problem).not.toContain("never synced");
  });

  it("says nothing about a studio deliberately offline", () => {
    const [row] = auditStudios(
      [studio({ mindbodyMode: "offline" })],
      [trainer()],
      NOW,
    );
    expect(row.problem).toBeNull();
    expect(row.sync).toBe("n/a");
  });

  it("says nothing about a healthy linked studio", () => {
    const [row] = auditStudios(
      [
        studio({
          mindbodySiteId: "1",
          syncIntervalMinutes: 15,
          lastScheduleSyncAt: NOW - 2 * MIN,
        }),
      ],
      [trainer({ mindbodyStaffId: "9" })],
      NOW,
    );
    expect(row.problem).toBeNull();
  });

  it("reports repeated failures ahead of staleness", () => {
    const [row] = auditStudios(
      [
        studio({
          mindbodySiteId: "1",
          scheduleSyncFailures: 4,
          lastScheduleSyncAt: NOW - 300 * MIN,
        }),
      ],
      [],
      NOW,
    );
    expect(row.problem).toContain("4 syncs in a row");
  });

  it("names how stale a stalled studio is, in its own interval's terms", () => {
    const [row] = auditStudios(
      [
        studio({
          mindbodySiteId: "1",
          syncIntervalMinutes: 15,
          lastScheduleSyncAt: NOW - 180 * MIN,
        }),
      ],
      [],
      NOW,
    );
    expect(row.problem).toContain("3 hours");
    expect(row.problem).toContain("15-minute interval");
  });

  it("flags a linked studio whose staff are all unlinked", () => {
    const [row] = auditStudios(
      [studio({ mindbodySiteId: "1", lastScheduleSyncAt: NOW })],
      [trainer({ id: "a" }), trainer({ id: "b" })],
      NOW,
    );
    expect(row.problem).toContain("No trainer here is linked");
  });

  it("does not flag unlinked staff at a studio that has no staff", () => {
    const [row] = auditStudios(
      [studio({ mindbodySiteId: "1", lastScheduleSyncAt: NOW })],
      [],
      NOW,
    );
    expect(row.problem).toBeNull();
  });

  it("normalises a numeric location id to a string", () => {
    const [row] = auditStudios(
      [studio({ mindbodySiteId: "1", mindbodyLocationId: 3 })],
      [],
      NOW,
    );
    expect(row.locationId).toBe("3");
  });

  it("keeps location id 0 rather than losing it to a falsy check", () => {
    const [row] = auditStudios(
      [studio({ mindbodySiteId: "1", mindbodyLocationId: 0 })],
      [],
      NOW,
    );
    expect(row.locationId).toBe("0");
  });

  it("sorts problems first: broken, then stalled, then fine, then offline", () => {
    const rows = auditStudios(
      [
        studio({ id: "ok", name: "Fine", mindbodySiteId: "1", lastScheduleSyncAt: NOW }),
        studio({ id: "off", name: "Offline", mindbodyMode: "offline" }),
        studio({ id: "bad", name: "Broken" }),
        studio({
          id: "old",
          name: "Stalled",
          mindbodySiteId: "2",
          syncIntervalMinutes: 15,
          lastScheduleSyncAt: NOW - 300 * MIN,
        }),
      ],
      [],
      NOW,
    );
    expect(rows.map((r) => r.studioId)).toEqual(["bad", "old", "ok", "off"]);
  });

  it("breaks a tie by name so the list does not shuffle between renders", () => {
    const rows = auditStudios(
      [
        studio({ id: "z", name: "Zeta" }),
        studio({ id: "a", name: "Alpha" }),
      ],
      [],
      NOW,
    );
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("summariseEstate", () => {
  it("counts each state and collects only the rows with something to say", () => {
    const rows = auditStudios(
      [
        studio({ id: "ok", name: "Fine", mindbodySiteId: "1", lastScheduleSyncAt: NOW }),
        studio({ id: "off", name: "Offline", mindbodyMode: "offline" }),
        studio({ id: "bad", name: "Broken" }),
        studio({
          id: "old",
          name: "Stalled",
          mindbodySiteId: "2",
          syncIntervalMinutes: 15,
          lastScheduleSyncAt: NOW - 300 * MIN,
        }),
      ],
      [],
      NOW,
    );
    const sum = summariseEstate(rows);
    expect(sum).toMatchObject({
      total: 4,
      linked: 2,
      offline: 1,
      misconfigured: 1,
      stalled: 1,
    });
    expect(sum.needsAttention.map((r) => r.studioId)).toEqual(["bad", "old"]);
  });

  it("a healthy estate needs no attention at all", () => {
    const rows = auditStudios(
      [studio({ mindbodySiteId: "1", lastScheduleSyncAt: NOW })],
      [],
      NOW,
    );
    expect(summariseEstate(rows).needsAttention).toEqual([]);
  });
});

describe("summariseHealth", () => {
  it("says how long ago the last event was when all is well", () => {
    const s = summariseHealth(health(), NOW);
    expect(s.status).toBe("healthy");
    expect(s.headline).toBe("Connected. Last event 5 minutes ago.");
    expect(s.faults).toEqual([]);
  });

  it("a missing health document reads as offline, never as green", () => {
    const s = summariseHealth(health({ hasData: false, status: "healthy" }), NOW);
    expect(s.status).toBe("offline");
    expect(s.headline).toContain("No health record");
  });

  it("an inactive webhook subscription is named as a fault", () => {
    const s = summariseHealth(
      health({ status: "degraded", webhookSubscriptionActive: false }),
      NOW,
    );
    expect(s.faults[0]).toContain("webhook subscription is not active");
    expect(s.headline).toBe(s.faults[0]);
  });

  it("counts parked events and signature failures", () => {
    const s = summariseHealth(
      health({ status: "degraded", dlqDepth: 3, signatureFailures24h: 1 }),
      NOW,
    );
    expect(s.faults.some((f) => f.includes("3 events failed"))).toBe(true);
    expect(s.faults.some((f) => f.includes("1 webhook in the last 24"))).toBe(
      true,
    );
  });

  it("does not claim a fault it cannot name", () => {
    const s = summariseHealth(health({ status: "degraded" }), NOW);
    expect(s.faults).toEqual([]);
    expect(s.headline).toContain("no specific fault recorded");
  });

  it("says so plainly when nothing has ever arrived", () => {
    const s = summariseHealth(health({ lastSuccessfulEventAt: null }), NOW);
    expect(s.headline).toBe("Connected, but no event has arrived yet.");
    expect(s.minutesSinceLastEvent).toBeNull();
  });

  it("offline gets its own headline rather than a fault list", () => {
    const s = summariseHealth(
      health({ status: "offline", webhookSubscriptionActive: false }),
      NOW,
    );
    expect(s.headline).toBe("Not connected to Mindbody.");
  });
});

describe("normaliseLog", () => {
  it("reads a level field", () => {
    expect(normaliseLog({ level: "ERROR", message: "x" }, 0).level).toBe("error");
  });

  it("reads a type field, which older writers used instead", () => {
    expect(normaliseLog({ type: "warning", message: "x" }, 0).level).toBe("warn");
  });

  it("treats a failure type as an error", () => {
    expect(normaliseLog({ type: "sync_failed" }, 0).level).toBe("error");
  });

  it("defaults an unrecognised shape to info, not to red", () => {
    expect(normaliseLog({ type: "banana" }, 0).level).toBe("info");
    expect(normaliseLog({}, 0).level).toBe("info");
  });

  it("reads a Firestore timestamp", () => {
    expect(normaliseLog({ timestamp: { toMillis: () => 500 } }, 0).at).toBe(500);
  });

  it("reads createdAt when timestamp is absent", () => {
    expect(normaliseLog({ createdAt: { toDate: () => new Date(700) } }, 0).at).toBe(
      700,
    );
  });

  it("reads an ISO string", () => {
    expect(normaliseLog({ timestamp: "2026-09-06T12:00:00.000Z" }, 0).at).toBe(
      NOW,
    );
  });

  it("does not invent a time from an unparseable string", () => {
    expect(normaliseLog({ timestamp: "yesterday-ish" }, 0).at).toBeNull();
  });

  it("gives a blank message a visible placeholder", () => {
    expect(normaliseLog({ message: "   " }, 0).message).toBe("(no message)");
  });

  it("falls back to the index for an id so keys stay stable", () => {
    expect(normaliseLog({}, 7).id).toBe("log-7");
  });

  it("reads the shape mindbodyEventLog actually writes", () => {
    const line = normaliseLog(
      {
        id: "e1",
        status: "error",
        eventType: "appointmentUpdated",
        processedAt: { toDate: () => new Date(NOW) },
      },
      0,
    );
    expect(line).toEqual({
      id: "e1",
      level: "error",
      message: "Mindbody event: appointmentUpdated",
      at: NOW,
    });
  });

  it("a successful event log entry is not an error", () => {
    expect(normaliseLog({ status: "success", eventType: "x" }, 0).level).toBe(
      "info",
    );
  });
});

describe("orderLogs", () => {
  it("puts the newest first", () => {
    const out = orderLogs([
      { id: "a", level: "info", message: "", at: 100 },
      { id: "b", level: "info", message: "", at: 300 },
      { id: "c", level: "info", message: "", at: 200 },
    ]);
    expect(out.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("sends undated lines to the bottom rather than the top", () => {
    const out = orderLogs([
      { id: "none", level: "info", message: "", at: null },
      { id: "old", level: "info", message: "", at: 100 },
    ]);
    expect(out.map((l) => l.id)).toEqual(["old", "none"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [
      { id: "a", level: "info" as const, message: "", at: 1 },
      { id: "b", level: "info" as const, message: "", at: 2 },
    ];
    orderLogs(input);
    expect(input.map((l) => l.id)).toEqual(["a", "b"]);
  });
});
