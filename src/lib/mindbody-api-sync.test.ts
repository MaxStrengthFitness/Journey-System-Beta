import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Studio, Trainer, Client } from "../types";

// The module pulls in the real Firebase app at import time; stub it out.
vi.mock("../firebase", () => ({ db: { __fake: true } }));

/** Every batch.set / batch.update issued during a run, in order. */
type BatchOp = {
  kind: "set" | "update" | "delete";
  path: string;
  id: string;
  data: Record<string, any>;
};
let batchOps: BatchOp[] = [];
let commits = 0;
/** Direct setDoc() writes — used by the Limbo parking path. */
let setDocOps: Array<{ path: string; id: string; data: any }> = [];

/** Snapshots keyed by collection path, set per test. */
let snapshots: Record<string, Array<{ id: string; data: () => any }>> = {};

function makeSnapshot(docs: Array<{ id: string; data: () => any }>) {
  return {
    empty: docs.length === 0,
    docs,
    forEach: (cb: (d: any) => void) => docs.forEach(cb),
  };
}

vi.mock("firebase/firestore", () => {
  let autoId = 0;
  return {
    collection: (_db: unknown, path: string) => ({ __collection: path }),
    // doc(collectionRef) mints an id; doc(db, path, id) addresses an existing doc.
    doc: (a: any, path?: string, id?: string) =>
      a && a.__collection
        ? { __path: a.__collection, __id: `auto-${++autoId}` }
        : { __path: path!, __id: id! },
    query: (coll: any, ...constraints: any[]) => ({ ...coll, constraints }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    getDocs: vi.fn(async (target: any) =>
      makeSnapshot(snapshots[target.__collection] ?? []),
    ),
    setDoc: vi.fn(async (ref: any, data: any) => {
      setDocOps.push({ path: ref.__path, id: ref.__id, data });
    }),
    writeBatch: () => ({
      set: (ref: any, data: any) =>
        batchOps.push({ kind: "set", path: ref.__path, id: ref.__id, data }),
      update: (ref: any, data: any) =>
        batchOps.push({ kind: "update", path: ref.__path, id: ref.__id, data }),
      delete: (ref: any) =>
        batchOps.push({
          kind: "delete",
          path: ref.__path,
          id: ref.__id,
          data: {},
        }),
      commit: async () => {
        commits++;
      },
    }),
    Timestamp: {
      fromDate: (d: Date) => ({ __ms: d.getTime(), toMillis: () => d.getTime() }),
      now: () => ({ __ms: 0, toMillis: () => 0 }),
    },
  };
});

import { resolveStudioId, syncMindbodySchedules } from "./mindbody-api-sync";

const SITE = "29068";

/**
 * Solon is listed FIRST and Westlake LAST on purpose. The bug this suite guards
 * resolved a studio by site alone, which returns whichever entry the array
 * happens to yield first — so expectations that name Solon fail against that bug
 * instead of matching it by accident.
 */
const SHARED_SITE_STUDIOS: Studio[] = [
  {
    id: "studio-solon",
    name: "Solon",
    ownerId: "o1",
    timezone: "America/New_York",
    mindbodySiteId: SITE,
    mindbodyLocationId: "2",
  },
  {
    id: "studio-westlake",
    name: "Westlake",
    ownerId: "o1",
    timezone: "America/New_York",
    mindbodySiteId: SITE,
    mindbodyLocationId: "1",
  },
];

function appointment(overrides: Record<string, any> = {}) {
  return {
    Id: 5001,
    StaffId: 77,
    StaffFirstName: "Marina",
    StaffLastName: "K",
    ClientId: "mb-client-1",
    ClientFirstName: "Alice",
    ClientLastName: "Smith",
    ClientPhone: "555-0100",
    StartDateTime: "2026-01-13T10:00:00Z",
    EndDateTime: "2026-01-13T11:00:00Z",
    Status: "Booked",
    SessionTypeName: "Training Session",
    LocationId: 2,
    ...overrides,
  };
}

function mockAppointments(appts: any[]) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ appointments: appts }),
  })) as any;
}

const TRAINERS: Trainer[] = [
  {
    id: "trainer-1",
    fullName: "Marina K",
    initials: "MK",
    role: "LifeTransformer",
    primaryHomeStudioId: "studio-solon",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    mindbodyStaffId: "77",
  },
];

const CLIENTS: Client[] = [
  {
    id: "client-alice",
    firstName: "Alice",
    lastName: "Smith",
    homeStudioId: "studio-solon",
    height: "5'6\"",
    isActive: true,
    remainingSessions: 10,
  },
];

beforeEach(() => {
  batchOps = [];
  setDocOps = [];
  commits = 0;
  snapshots = { clients: [], schedules: [] };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveStudioId", () => {
  it("prefers the studio owning the location over array order", () => {
    expect(resolveStudioId(2, SITE, SHARED_SITE_STUDIOS)).toBe("studio-solon");
    expect(resolveStudioId(1, SITE, SHARED_SITE_STUDIOS)).toBe("studio-westlake");
  });

  it("matches numeric and string location ids interchangeably", () => {
    expect(resolveStudioId("2", SITE, SHARED_SITE_STUDIOS)).toBe("studio-solon");
    expect(resolveStudioId(" 2 ", SITE, SHARED_SITE_STUDIOS)).toBe("studio-solon");
  });

  it("returns null for a location no studio on the site claims", () => {
    expect(resolveStudioId(9, SITE, SHARED_SITE_STUDIOS)).toBeNull();
  });

  it("does not match a location belonging to a different site", () => {
    const otherSite: Studio[] = [
      {
        id: "studio-elsewhere",
        name: "Elsewhere",
        ownerId: "o2",
        timezone: "America/New_York",
        mindbodySiteId: "99999",
        mindbodyLocationId: "2",
      },
    ];
    expect(resolveStudioId(2, SITE, otherSite)).toBeNull();
  });

  it("falls back to the site only when exactly one studio claims it", () => {
    const single: Studio[] = [
      {
        id: "studio-only",
        name: "Only",
        ownerId: "o1",
        timezone: "America/New_York",
        mindbodySiteId: SITE,
      },
    ];
    expect(resolveStudioId(undefined, SITE, single)).toBe("studio-only");
    // Ambiguous: two studios, no location to disambiguate.
    expect(resolveStudioId(undefined, SITE, SHARED_SITE_STUDIOS)).toBeNull();
  });
});

describe("syncMindbodySchedules — studio isolation", () => {
  // These sync WESTLAKE, which is deliberately the LAST entry in the studios
  // array. A site-first resolver returns Solon (the first entry), so expecting
  // Westlake fails against the old bug rather than matching it by accident.
  it("creates every missing client BEFORE writing any schedule row", async () => {
    // The ordering is the fix: a schedule row must never be written pointing at
    // a client document that does not exist yet, or the block renders
    // "Not synced" until someone syncs again.
    mockAppointments([
      appointment({ Id: 8001, ClientId: "mb-a", ClientFirstName: "Ann", LocationId: 2 }),
      appointment({ Id: 8002, ClientId: "mb-b", ClientFirstName: "Bob", LocationId: 2 }),
      // Same client as the first appointment — must not be created twice.
      appointment({ Id: 8003, ClientId: "mb-a", ClientFirstName: "Ann", LocationId: 2 }),
    ]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      [],
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      "2",
    );

    expect(result.clientsCreated).toBe(2);

    const clientWrites = batchOps.filter((op) => op.path === "clients");
    expect(clientWrites.map((w) => w.id).sort()).toEqual(["mb-a", "mb-b"]);
    expect(clientWrites[0].data.homeStudioId).toBe("studio-solon");

    // Every schedule row resolves to a real client id.
    const scheduleWrites = batchOps.filter((op) => op.path === "schedules");
    expect(scheduleWrites).toHaveLength(3);
    expect(scheduleWrites.every((w) => !!w.data.clientId)).toBe(true);
  });

  it("does NOT create clients for a sibling studio's appointments", async () => {
    // Location 1 is Westlake's. Creating its clients while syncing Solon would
    // stamp the wrong homeStudioId and put them on the wrong roster.
    mockAppointments([
      appointment({ Id: 8004, ClientId: "mb-west", LocationId: 1 }),
      appointment({ Id: 8005, ClientId: "mb-solon", LocationId: 2 }),
    ]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      [],
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      null,
    );

    expect(result.clientsCreated).toBe(1);
    const clientWrites = batchOps.filter((op) => op.path === "clients");
    expect(clientWrites.map((w) => w.id)).toEqual(["mb-solon"]);
  });

  it("parks an unmappable appointment in Limbo instead of only logging an error", async () => {
    // Location 9 belongs to no studio on this site. This used to survive only
    // as a line in the Refresh Schedule toast, which meant unmapped work could
    // hide in two places. It must now land in mindbodyLimbo, like the webhook.
    mockAppointments([appointment({ Id: 7002, LocationId: 9 })]);

    // NOTE the missing location argument. When a sync is scoped to a specific
    // location, appointments elsewhere are filtered out before the loop ever
    // sees them, so parking can only happen on a site-wide sync.
    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      null,
    );

    // Nothing reaches the live schedule.
    expect(batchOps.filter((op) => op.path === "schedules")).toHaveLength(0);
    expect(result.skipped).toBe(1);

    const [parked] = setDocOps.filter((op) => op.path === "mindbodyLimbo");
    // Deterministic id, so repeated Refresh Schedule presses update one row
    // rather than piling up duplicates.
    expect(parked.id).toBe(`pull:${SITE}:7002`);
    expect(parked.data).toMatchObject({
      kind: "booking",
      source: "pull-sync",
      locationId: "9",
      resolvedAt: null,
    });
    expect(parked.data.summary).toMatchObject({
      bookingId: "7002",
      clientName: "Alice Smith",
      staffName: "Marina K",
      // RAW and unconverted — no studio means no timezone to read them against.
      rawStartDateTime: "2026-01-13T10:00:00Z",
    });
  });

  it("does NOT park an appointment that simply belongs to another studio", async () => {
    // Location 1 is Westlake's. While syncing Solon this is correctly skipped —
    // it is someone else's booking, not an unmapped one, and parking it would
    // fill Limbo with noise on every sync.
    mockAppointments([appointment({ Id: 7003, LocationId: 1 })]);

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      null,
    );

    expect(setDocOps.filter((op) => op.path === "mindbodyLimbo")).toHaveLength(0);
  });

  it("writes pass and waitlist data to the schedule when the proxy provides it", async () => {
    mockAppointments([
      appointment({
        LocationId: 2,
        ClientPassId: "pass-9",
        ClientPassSessionsRemaining: 15,
        BookingOriginatedFromWaitlist: true,
        ClientsNumberOfVisitsAtSite: 87,
      }),
    ]);

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      "2",
    );

    const [written] = batchOps.filter((op) => op.path === "schedules");
    expect(written.data.mindbodyPass).toEqual({
      passId: "pass-9",
      sessionsRemaining: 15,
    });
    expect(written.data.bookingOriginatedFromWaitlist).toBe(true);
    // The visit count is the CLIENT's, not the booking's.
    expect(written.data).not.toHaveProperty("clientsNumberOfVisitsAtSite");
    // Clients are created in a BATCH up front now, not one setDoc at a time.
    const [client] = batchOps.filter((op) => op.path === "clients");
    expect(client.data.clientsNumberOfVisitsAtSite).toBe(87);
  });

  it("keys the schedule doc by the Mindbody appointment id, not a random id", async () => {
    mockAppointments([appointment({ Id: 5001, LocationId: 2 })]);

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      "2",
    );

    const [written] = batchOps.filter((op) => op.path === "schedules");
    // The webhook writes `schedules/{bookingId}`. If this importer minted its
    // own ids, the same appointment could exist as two docs and show twice.
    expect(written.id).toBe("5001");
  });

  it("folds a legacy random-id schedule row onto the canonical id and drops the stray", async () => {
    mockAppointments([appointment({ Id: 5001, LocationId: 2 })]);
    snapshots.schedules = [
      {
        id: "legacy-random-id",
        data: () => ({
          mindbodyAppointmentId: "5001",
          studioId: "studio-solon",
          clientName: "Alice Smith",
          status: "Scheduled",
          createdAt: { __ms: 123, toMillis: () => 123 },
        }),
      },
    ];

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      "2",
    );

    const scheduleOps = batchOps.filter((op) => op.path === "schedules");
    const canonical = scheduleOps.find((op) => op.id === "5001");
    const removed = scheduleOps.find((op) => op.id === "legacy-random-id");

    expect(canonical?.kind).toBe("set");
    // The original creation time survives the move.
    expect(canonical?.data.createdAt).toMatchObject({ __ms: 123 });
    expect(removed?.kind).toBe("delete");
  });

  it("links a client by Mindbody id even when the names do not match", async () => {
    // The old fuzzy matcher keyed on names; "Alice Smith" vs "Ali Smyth" would
    // have missed. The canonical doc id is the only join key now.
    mockAppointments([appointment({ ClientId: "mb-99", LocationId: 2 })]);

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      [
        {
          id: "mb-99",
          firstName: "Ali",
          lastName: "Smyth",
          mindbodyClientId: "mb-99",
          homeStudioId: "studio-solon",
          height: "",
          isActive: true,
          remainingSessions: 4,
        },
      ] as Client[],
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      "2",
    );

    const [written] = batchOps.filter((op) => op.path === "schedules");
    expect(written.data.clientId).toBe("mb-99");
    expect(written.data.mindbodyClientId).toBe("mb-99");
  });

  it("STRICT: ignores a client carrying the Mindbody id at a non-canonical doc id", async () => {
    // A stale document is passed over, not linked to — matching the webhook.
    // Linking here while the webhook wrote clients/mb-99 is exactly the split
    // this work exists to remove.
    mockAppointments([appointment({ ClientId: "mb-99", LocationId: 2 })]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      [
        {
          id: "legacy-doc-id",
          firstName: "Ali",
          lastName: "Smyth",
          mindbodyClientId: "mb-99",
          homeStudioId: "studio-solon",
          height: "",
          isActive: true,
          remainingSessions: 4,
        },
      ] as Client[],
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      "2",
    );

    expect(result.clientsCreated).toBe(1);
    const [written] = batchOps.filter((op) => op.path === "schedules");
    expect(written.data.clientId).toBe("mb-99");
  });

  it("does not link a same-named client who carries no Mindbody id", async () => {
    // CLIENTS holds "Alice Smith" with no mindbodyClientId. Under the old fuzzy
    // matcher this appointment would have attached to her record; now it must
    // create a canonical profile instead of guessing.
    mockAppointments([appointment({ ClientId: "mb-client-1", LocationId: 2 })]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-solon",
      "2",
    );

    expect(result.clientsCreated).toBe(1);
    const [written] = batchOps.filter((op) => op.path === "schedules");
    expect(written.data.clientId).toBe("mb-client-1");
    expect(written.data.clientId).not.toBe("client-alice");
  });

  it("files an appointment under the studio owning its location", async () => {
    mockAppointments([appointment({ LocationId: 1 })]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-westlake",
      "1",
    );

    expect(result.errors).toEqual([]);
    expect(result.added).toBe(1);

    const written = batchOps.filter((op) => op.path === "schedules");
    expect(written).toHaveLength(1);
    expect(written[0].data.studioId).toBe("studio-westlake");
    expect(commits).toBeGreaterThan(0);
  });

  it("keeps another location's appointments out of the active studio", async () => {
    // Both locations come back from the API; only Westlake's may be stored.
    mockAppointments([
      appointment({ Id: 1, LocationId: 1 }),
      appointment({ Id: 2, LocationId: 2, ClientFirstName: "Bob" }),
    ]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-westlake",
      "1",
    );

    const written = batchOps.filter((op) => op.path === "schedules");
    expect(written).toHaveLength(1);
    expect(written[0].data.mindbodyAppointmentId).toBe("1");
    expect(written.every((op) => op.data.studioId === "studio-westlake")).toBe(
      true,
    );
    expect(result.added).toBe(1);
  });

  it("refuses when the site is shared and the studio has no location", async () => {
    mockAppointments([appointment()]);

    // The studio being synced has no mindbodyLocationId, so nothing can
    // distinguish its bookings from its sibling's on the same site.
    const unmappedSolon: Studio[] = [
      { ...SHARED_SITE_STUDIOS[0], mindbodyLocationId: undefined },
      SHARED_SITE_STUDIOS[1],
    ];

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      unmappedSolon,
      null,
      undefined,
      undefined,
      "studio-solon",
      null,
    );

    expect(result.errors[0]).toMatch(/no Location ID/i);
    expect(result.added).toBe(0);
    expect(batchOps).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses when the target studio cannot be determined", async () => {
    mockAppointments([appointment()]);

    const result = await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      null, // no studio specified, and the site is claimed by two
      null,
    );

    expect(result.errors[0]).toMatch(/claimed by 2 studios/i);
    expect(batchOps).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not write client demographics for another location's appointments", async () => {
    // Alice is only seen at Solon's location; syncing Westlake must not enrich
    // her record from a booking that belongs to a different studio.
    mockAppointments([appointment({ Id: 3, LocationId: 2 })]);
    snapshots.clients = [
      { id: "client-alice", data: () => ({ ...CLIENTS[0], phone: undefined }) },
    ];

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-westlake",
      "1",
    );

    expect(batchOps.filter((op) => op.path === "clients")).toHaveLength(0);
  });

  it("only cancels stale schedules belonging to the studio being synced", async () => {
    mockAppointments([appointment({ Id: 1, LocationId: 1 })]);
    snapshots.schedules = [
      {
        id: "sched-gone",
        data: () => ({
          mindbodyAppointmentId: "999",
          studioId: "studio-westlake",
          status: "Scheduled",
        }),
      },
    ];

    await syncMindbodySchedules(
      SITE,
      TRAINERS,
      CLIENTS,
      SHARED_SITE_STUDIOS,
      null,
      undefined,
      undefined,
      "studio-westlake",
      "1",
    );

    const cancelled = batchOps.filter(
      (op) => op.kind === "update" && op.data.status === "Cancelled",
    );
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].id).toBe("sched-gone");
  });
});
