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
/** Every getDocs target, so a test can see what was read. */
let reads: any[] = [];
/** Client ids whose single read the "rules" refuse. */
let refusedClientIds = new Set<string>();
/** Client ids whose write the "rules" refuse (another studio's client). */
let refusedWrites = new Set<string>();
/** When true, a schedules query honours its startTime bounds, as Firestore does. */
let respectWindow = false;

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
    documentId: () => "__name__",
    getDocs: vi.fn(async (target: any) => {
      reads.push(target);
      const docs = snapshots[target.__collection] ?? [];
      // A by-id query answers with just those ids; the "rules" refuse a
      // batch holding one they would refuse on its own.
      const byId = (target.constraints ?? []).find((c: any) => c.field === "__name__");
      if (byId) {
        if (byId.value.some((id: string) => refusedClientIds.has(id))) {
          throw Object.assign(new Error("Missing or insufficient permissions."), {
            code: "permission-denied",
          });
        }
        return makeSnapshot(docs.filter((d) => byId.value.includes(d.id)));
      }
      if (respectWindow) {
        const bound = (op: string) =>
          (target.constraints ?? []).find((c: any) => c.field === "startTime" && c.op === op)?.value;
        const from = bound(">="), to = bound("<=");
        if (from || to) {
          return makeSnapshot(
            docs.filter((d) => {
              const ms = d.data().startTime?.toMillis?.();
              if (typeof ms !== "number") return false;
              return (!from || ms >= from.toMillis()) && (!to || ms <= to.toMillis());
            }),
          );
        }
      }
      return makeSnapshot(docs);
    }),
    getDoc: vi.fn(async (ref: any) => {
      if (refusedClientIds.has(ref.__id)) {
        throw Object.assign(new Error("Missing or insufficient permissions."), {
          code: "permission-denied",
        });
      }
      const hit = (snapshots[ref.__path] ?? []).find((d) => d.id === ref.__id);
      return { id: ref.__id, exists: () => !!hit, data: () => hit?.data() };
    }),
    setDoc: vi.fn(async (ref: any, data: any) => {
      if (ref.__path === "clients" && refusedWrites.has(ref.__id)) {
        throw Object.assign(new Error("Missing or insufficient permissions."), {
          code: "permission-denied",
        });
      }
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

import { getDocs } from "firebase/firestore";
import { resolveStudioId, syncMindbodySchedules, syncWindow, REFRESH_WINDOW_DAYS, DEEP_WINDOW_DAYS, NEAR_WINDOW_DAYS } from "./mindbody-api-sync";

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

function mockAppointments(appts: any[], extra: Record<string, unknown> = {}) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ appointments: appts, ...extra }),
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
  reads = [];
  refusedClientIds = new Set();
  refusedWrites = new Set();
  respectWindow = false;
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
          // Tomorrow: inside the window Mindbody was asked about.
          startTime: { toMillis: () => Date.now() + 24 * 60 * 60 * 1000 },
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

  it("never cancels a booking outside the window Mindbody was asked about", async () => {
    // The sync asks for today..+30 days. Yesterday's session and one two
    // months out are simply not in the answer — that is not a cancellation.
    mockAppointments([appointment({ Id: 1, LocationId: 1 })]);
    const DAY = 24 * 60 * 60 * 1000;
    const row = (id: string, offsetDays: number) => ({
      id,
      data: () => ({
        mindbodyAppointmentId: id,
        studioId: "studio-westlake",
        status: "Scheduled",
        startTime: { toMillis: () => Date.now() + offsetDays * DAY },
      }),
    });
    snapshots.schedules = [row("past", -1), row("far", 60), row("soon", 3)];

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
    expect(cancelled.map((op) => op.id)).toEqual(["soon"]);

    // And the read itself is bounded to the window, not the studio's history.
    const scheduleRead = reads.find((r) => r.__collection === "schedules");
    const fields = scheduleRead.constraints.map((c: any) => `${c.field}${c.op}`);
    expect(fields).toEqual(["studioId==", "startTime>=", "startTime<="]);
  });
});

describe("syncMindbodySchedules — the change stamps (Operations overhaul, Sep 2026)", () => {
  // An existing row for the appointment the mock reports, keyed the canonical
  // way (doc id = Mindbody appointment id) so the sync takes the update path.
  const existingRow = (data: Record<string, unknown>) => ({
    id: "5001",
    data: () => ({
      mindbodyAppointmentId: "5001",
      studioId: "studio-solon",
      clientId: "mb-client-1",
      clientName: "Alice Smith",
      trainerId: "t-marina",
      status: "Scheduled",
      // Two days out: inside the window, so the sweep would otherwise act.
      startTime: { toMillis: () => Date.now() + 2 * 24 * 60 * 60 * 1000 },
      ...data,
    }),
  });

  const run = () =>
    syncMindbodySchedules(SITE, TRAINERS, CLIENTS, SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2");

  const updateOf = (id: string) => batchOps.find((op) => op.kind === "update" && op.id === id)?.data;

  it("stamps a moved booking with the day and start it left", async () => {
    mockAppointments([appointment({ Id: 5001, LocationId: 2 })]);
    const oldStart = { toMillis: () => Date.now() + 2 * 24 * 60 * 60 * 1000 };
    snapshots.schedules = [existingRow({ startTime: oldStart })];

    await run();

    const update = updateOf("5001");
    expect(update).toBeTruthy();
    expect(update.movedFromStart).toBe(oldStart);
    expect(update.movedFromDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(update.movedAt).toBeTruthy();
    // Not a cancellation.
    expect(update.cancelledAt).toBeUndefined();
  });

  it("stamps a booking Mindbody now reports cancelled, and says Mindbody said so", async () => {
    mockAppointments([appointment({ Id: 5001, LocationId: 2, Status: "Cancelled" })]);
    // Same start as the sync will compute, so nothing reads as a move — only
    // the status differs.
    snapshots.schedules = [existingRow({})];

    await run();

    const update = updateOf("5001");
    expect(update.status).toBe("Cancelled");
    expect(update.cancelledAt).toBeTruthy();
    expect(update.cancelSource).toBe("mindbody");
  });

  it("clears the cancellation when a cancelled booking comes back as booked", async () => {
    mockAppointments([appointment({ Id: 5001, LocationId: 2 })]);
    snapshots.schedules = [existingRow({ status: "Cancelled", cancelledAt: { __ms: 1 }, cancelSource: "sweep" })];

    await run();

    const update = updateOf("5001");
    expect(update.status).toBe("Scheduled");
    expect(update.cancelledAt).toBeNull();
    expect(update.cancelSource).toBeNull();
    // A cancelled row that is re-booked at a new time is a fresh booking,
    // not a move: nothing to say about where it came from.
    expect(update.movedFromDay).toBeUndefined();
  });

  it("the sweep stamps what vanished from Mindbody's answer as its own finding", async () => {
    mockAppointments([appointment({ Id: 1, LocationId: 2 })]);
    snapshots.schedules = [
      {
        id: "gone",
        data: () => ({
          mindbodyAppointmentId: "999",
          studioId: "studio-solon",
          status: "Scheduled",
          startTime: { toMillis: () => Date.now() + 24 * 60 * 60 * 1000 },
        }),
      },
    ];

    await run();

    const update = updateOf("gone");
    expect(update.status).toBe("Cancelled");
    expect(update.cancelledAt).toBeTruthy();
    expect(update.cancelSource).toBe("sweep");
  });
});

describe("syncMindbodySchedules — phase 1 never overwrites an existing client", () => {
  it("does not read the whole clients collection", async () => {
    mockAppointments([appointment({ ClientId: "mb-new", LocationId: 2 })]);
    await syncMindbodySchedules(
      SITE, TRAINERS, [], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2",
    );
    const clientReads = reads.filter((r) => r.__collection === "clients");
    expect(clientReads.length).toBeGreaterThan(0);
    // Every clients read names the ids it wants.
    expect(
      clientReads.every((r) => (r.constraints ?? []).some((c: any) => c.field === "__name__")),
    ).toBe(true);
  });

  it("skips a client the caller's roster lacks but Firestore has", async () => {
    // The trainer's roster did not hold her; the old code "created" her again
    // and reset her session count, height and createdAt.
    mockAppointments([appointment({ ClientId: "mb-known", LocationId: 2 })]);
    snapshots.clients = [
      {
        id: "mb-known",
        data: () => ({ firstName: "Known", homeStudioId: "studio-solon", sessionCount: 42, height: "5'4\"" }),
      },
    ];

    const result = await syncMindbodySchedules(
      SITE, TRAINERS, [], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2",
    );

    expect(result.clientsCreated ?? 0).toBe(0);
    const clientSets = batchOps.filter((op) => op.path === "clients" && op.kind === "set");
    expect(clientSets).toHaveLength(0);
    expect(setDocOps.filter((op) => op.path === "clients")).toHaveLength(0);
    // The booking still links to her.
    const [row] = batchOps.filter((op) => op.path === "schedules");
    expect(row.data.clientId).toBe("mb-known");
  });

  it("creates a client the rules won't describe on its own, and leaves another studio's alone", async () => {
    // A trainer can't read a document that isn't there, nor another studio's.
    mockAppointments([
      appointment({ Id: 7001, ClientId: "mb-brand-new", LocationId: 2 }),
      appointment({ Id: 7002, ClientId: "mb-elsewhere", LocationId: 2 }),
    ]);
    refusedClientIds = new Set(["mb-brand-new", "mb-elsewhere"]);
    refusedWrites = new Set(["mb-elsewhere"]);

    const result = await syncMindbodySchedules(
      SITE, TRAINERS, [], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2",
    );

    expect(result.clientsCreated).toBe(1);
    expect(setDocOps.filter((op) => op.path === "clients").map((op) => op.id)).toEqual(["mb-brand-new"]);
    expect(batchOps.filter((op) => op.path === "clients")).toHaveLength(0);
    const rows = batchOps.filter((op) => op.path === "schedules");
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.data.clientId]));
    expect(byId["7001"]).toBe("mb-brand-new");
    // Someone this trainer cannot read, and cannot place on a site: a sibling
    // studio's client or the other site's, nothing here can tell. Linking by
    // id alone is how a stranger's bookings landed on Solon's records, so a
    // NEW booking is not linked (client-identity round, Sep 23 2026)...
    expect(byId["7002"]).toBeNull();
    // ...and it is not reported as a failure on every sync either.
    expect(result.errors.join(" ")).not.toMatch(/mb-elsewhere/);
  });

  it("keeps a link a sync that COULD read the record already made", async () => {
    // A leader's sync linked it; a trainer's must not undo that every pass.
    mockAppointments([appointment({ Id: 7002, ClientId: "mb-elsewhere", LocationId: 2 })]);
    refusedClientIds = new Set(["mb-elsewhere"]);
    refusedWrites = new Set(["mb-elsewhere"]);
    snapshots.schedules = [
      {
        id: "7002",
        data: () => ({
          mindbodyAppointmentId: "7002",
          studioId: "studio-solon",
          clientId: "mb-elsewhere",
          clientName: "Alice Smith",
          trainerId: "trainer-1",
          status: "Scheduled",
          startTime: { toMillis: () => new Date("2026-01-13T10:00:00Z").getTime() },
        }),
      },
    ];

    await syncMindbodySchedules(
      SITE, TRAINERS, [], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2",
    );

    const update = batchOps.find((op) => op.path === "schedules" && op.id === "7002");
    // Either untouched, or rewritten with the same link — never unlinked.
    if (update) expect(update.data.clientId).toBe("mb-elsewhere");
  });

  it("does not fill in a visitor's record from this studio's booking", async () => {
    mockAppointments([appointment({ ClientId: "mb-visitor", LocationId: 2, ClientEmail: "v@example.com" })]);
    const visitor = {
      id: "mb-visitor",
      firstName: "Vi",
      lastName: "Sitor",
      homeStudioId: "studio-westlake",
      height: "",
      isActive: true,
      remainingSessions: 0,
    } as Client;

    await syncMindbodySchedules(
      SITE, TRAINERS, [visitor], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2",
    );

    expect(batchOps.filter((op) => op.path === "clients")).toHaveLength(0);
    const [row] = batchOps.filter((op) => op.path === "schedules");
    expect(row.data.clientId).toBe("mb-visitor");
  });
});

describe("syncMindbodySchedules — half an answer must not cancel anything", () => {
  /*
   * The proxy fetches the window in pages. When one of them fails, the
   * bookings on it are UNSEEN, not gone -- but the sweep cannot tell the
   * difference on its own: absent from the answer and inside the window is
   * exactly what it cancels on. Left alone that turns a transient 500 into
   * real sessions disappearing off trainers' schedules, which is the Aug 30
   * storm's second cause repeating.
   *
   * So the proxy says whether its answer was whole, and these lock that in.
   */
  const run = () =>
    syncMindbodySchedules(SITE, TRAINERS, CLIENTS, SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2");

  const vanishedRow = () => [
    {
      id: "gone",
      data: () => ({
        mindbodyAppointmentId: "999",
        studioId: "studio-solon",
        status: "Scheduled",
        startTime: { toMillis: () => Date.now() + 24 * 60 * 60 * 1000 },
      }),
    },
  ];

  it("sweeps when the proxy says the answer was whole", async () => {
    mockAppointments([appointment({ Id: 1, LocationId: 2 })], { complete: true });
    snapshots.schedules = vanishedRow();

    await run();

    const update = batchOps.find((op) => op.kind === "update" && op.id === "gone");
    expect(update?.data.status).toBe("Cancelled");
  });

  it("does NOT sweep when a page failed", async () => {
    mockAppointments([appointment({ Id: 1, LocationId: 2 })], { complete: false });
    snapshots.schedules = vanishedRow();

    await run();

    expect(batchOps.find((op) => op.id === "gone")).toBeUndefined();
  });

  it("says why it did not sweep, rather than reporting a clean run", async () => {
    mockAppointments([appointment({ Id: 1, LocationId: 2 })], { complete: false });
    snapshots.schedules = vanishedRow();

    const res = await run();

    expect(res.errors.join(" ")).toMatch(/only part of the window/i);
  });

  it("still saves the bookings that DID arrive", async () => {
    mockAppointments([appointment({ Id: 1, LocationId: 2 })], { complete: false });
    snapshots.schedules = vanishedRow();

    await run();

    expect(batchOps.filter((op) => op.path === "schedules").length).toBeGreaterThan(0);
  });

  it("an older proxy that sends no `complete` at all still sweeps", async () => {
    mockAppointments([appointment({ Id: 1, LocationId: 2 })]);
    snapshots.schedules = vanishedRow();

    await run();

    const update = batchOps.find((op) => op.kind === "update" && op.id === "gone");
    expect(update?.data.status).toBe("Cancelled");
  });
});

describe("syncWindow — how far ahead a sync reaches", () => {
  const NOON = new Date("2026-09-22T16:00:00Z"); // midday in New York

  it("starts today and runs the number of days it was given", () => {
    const w = syncWindow("America/New_York", 8, NOON);
    expect(w.start).toBe("2026-09-22");
    expect(w.end).toBe("2026-09-30");
  });

  it("the button's window is the week the app can actually display", () => {
    expect(REFRESH_WINDOW_DAYS).toBe(8);
  });

  it("the background sync still reaches a month out, for the calendar", () => {
    const w = syncWindow("America/New_York", DEEP_WINDOW_DAYS, NOON);
    expect(w.start).toBe("2026-09-22");
    expect(w.end).toBe("2026-10-22");
  });

  it("asking for today alone gives a single day, not an empty window", () => {
    const w = syncWindow("America/New_York", 0, NOON);
    expect(w.start).toBe("2026-09-22");
    expect(w.end).toBe("2026-09-22");
  });

  it("reads the day in the STUDIO's zone, not the browser's", () => {
    // 01:00 UTC on the 23rd is still the evening of the 22nd in New York.
    const lateUtc = new Date("2026-09-23T01:00:00Z");
    expect(syncWindow("America/New_York", 1, lateUtc).start).toBe("2026-09-22");
  });

  it("a nonsense day count falls back rather than producing a backwards window", () => {
    const w = syncWindow("America/New_York", Number.NaN, NOON);
    expect(w.start).toBe("2026-09-22");
    expect(w.end).toBe("2026-09-30");
  });
});

describe("syncMindbodySchedules — one Mindbody id, two different people", () => {
  /*
   * MSF's two Mindbody sites both numbered their clients from 100000001, so
   * the ranges overlap: on Sep 23 2026 the collision check found 43 ids that
   * name a DIFFERENT person at each site, and the damage check found two of
   * them already had someone else's standing schedule filed on their record.
   *
   * `clients/{mindbodyClientId}` has no site in it. Phases 26–27 stopped the
   * sync filing a Westlake booking for client 100000271 on SOLON's client
   * 100000271, by leaving it unlinked. The client-identity round gives the
   * Westlake person a record of their own, `clients/29068-100000271`
   * (lib/mindbody-site.ts), and files their bookings there.
   */
  const OTHER_SITE = "5746957";
  const QUALIFIED = `${SITE}-100000271`;

  const STUDIOS_ON_TWO_SITES: Studio[] = [
    ...SHARED_SITE_STUDIOS,
    {
      id: "studio-elsewhere",
      name: "Solon (other site)",
      ownerId: "o1",
      timezone: "America/New_York",
      mindbodySiteId: OTHER_SITE,
      mindbodyLocationId: "1",
    },
  ];

  const run = (studios: Studio[] = STUDIOS_ON_TWO_SITES) =>
    syncMindbodySchedules(SITE, TRAINERS, [], studios, null, undefined, undefined, "studio-solon", "2");

  /** A client document that exists, but belongs to a studio on the OTHER site. */
  const strangerAt = (homeStudioId: string) => [
    {
      id: "100000271",
      data: () => ({
        firstName: "Aydin",
        lastName: "Kara",
        homeStudioId,
      }),
    },
  ];

  const barjesh = () =>
    appointment({ Id: 7001, LocationId: 2, ClientId: "100000271", ClientFirstName: "Barjesh", ClientLastName: "Walters" });

  const scheduleWrites = () => batchOps.filter((op) => op.path === "schedules");
  const clientCreates = () => batchOps.filter((op) => op.path === "clients" && op.kind === "set");

  it("never links a booking to the client document from the other site", async () => {
    mockAppointments([barjesh()]);
    snapshots.clients = strangerAt("studio-elsewhere");

    await run();

    const [row] = scheduleWrites();
    expect(row.data.clientId).not.toBe("100000271");
  });

  it("gives the second person a record of their own, and files the booking there", async () => {
    mockAppointments([barjesh()]);
    snapshots.clients = strangerAt("studio-elsewhere");

    const res = await run();

    const [created] = clientCreates();
    expect(created.id).toBe(QUALIFIED);
    expect(created.data).toMatchObject({
      firstName: "Barjesh",
      lastName: "Walters",
      mindbodyClientId: "100000271",
      mindbodySiteId: SITE,
      homeStudioId: "studio-solon",
    });
    const [row] = scheduleWrites();
    expect(row.data.clientId).toBe(QUALIFIED);
    expect(row.data.mindbodyClientId).toBe("100000271");
    expect(row.data.clientName).toBe("Barjesh Walters");
    // Nothing is written to Solon's Aydin Kara, and nothing is reported as wrong.
    expect(batchOps.filter((op) => op.path === "clients" && op.id === "100000271")).toHaveLength(0);
    expect(res.errors).toEqual([]);
  });

  it("uses the second person's record once it exists, without making another", async () => {
    mockAppointments([barjesh()]);
    snapshots.clients = [
      ...strangerAt("studio-elsewhere"),
      { id: QUALIFIED, data: () => ({ firstName: "Barjesh", lastName: "Walters", homeStudioId: "studio-solon" }) },
    ];

    await run();

    expect(clientCreates()).toHaveLength(0);
    expect(scheduleWrites()[0].data.clientId).toBe(QUALIFIED);
  });

  it("finds the second person in the roster before asking Firestore anything", async () => {
    mockAppointments([barjesh()]);
    const roster = [
      { id: QUALIFIED, firstName: "Barjesh", lastName: "Walters", homeStudioId: "studio-solon", mindbodyClientId: "100000271" },
    ] as unknown as Client[];

    await syncMindbodySchedules(SITE, TRAINERS, roster, STUDIOS_ON_TWO_SITES, null, undefined, undefined, "studio-solon", "2");

    expect(reads.filter((r) => r.__collection === "clients")).toHaveLength(0);
    expect(scheduleWrites()[0].data.clientId).toBe(QUALIFIED);
  });

  it("DOES link a client whose home is a sibling studio on the SAME site", async () => {
    // A Solon client visiting Westlake is not a collision — it is a visitor.
    mockAppointments([appointment({ Id: 7001, LocationId: 2, ClientId: "100000271" })]);
    snapshots.clients = strangerAt("studio-westlake");

    await run();

    expect(clientCreates()).toHaveLength(0);
    expect(scheduleWrites()[0].data.clientId).toBe("100000271");
  });

  it("adopts as before when the document has no home studio to place", async () => {
    // Unknown is unknown, not wrong. Refusing here would break every client
    // who simply has no home studio set yet.
    mockAppointments([appointment({ Id: 7001, LocationId: 2, ClientId: "100000271" })]);
    snapshots.clients = [{ id: "100000271", data: () => ({ firstName: "Aydin", lastName: "Kara" }) }];

    await run();

    expect(scheduleWrites()[0].data.clientId).toBe("100000271");
  });

  /*
   * THE LOOP PHASE 26 MISSED. The Hub's roster fetches every client a booking
   * points at, as a "visitor". Once a booking was filed on the wrong person,
   * that wrong person came back in the ROSTER the sync is handed — and the id
   * lookup found them there. Phase 27 drops other-site clients from the
   * roster on the way in; that still holds.
   */
  const strangerInRoster = (homeStudioId: string) =>
    [{ id: "100000271", firstName: "Aydin", lastName: "Kara", homeStudioId }] as unknown as Parameters<
      typeof syncMindbodySchedules
    >[2];

  const runWithRoster = (roster: Parameters<typeof syncMindbodySchedules>[2]) =>
    syncMindbodySchedules(SITE, TRAINERS, roster, STUDIOS_ON_TWO_SITES, null, undefined, undefined, "studio-solon", "2");

  it("does NOT link to a stranger the caller's roster hands in", async () => {
    mockAppointments([barjesh()]);
    snapshots.clients = strangerAt("studio-elsewhere");

    await runWithRoster(strangerInRoster("studio-elsewhere"));

    expect(scheduleWrites()[0].data.clientId).toBe(QUALIFIED);
  });

  it("MOVES a booking already filed on the stranger onto the right person", async () => {
    mockAppointments([barjesh()]);
    snapshots.clients = strangerAt("studio-elsewhere");
    snapshots.schedules = [
      {
        id: "7001",
        data: () => ({
          mindbodyAppointmentId: "7001",
          studioId: "studio-solon",
          clientId: "100000271",
          clientName: "Barjesh Walters",
          status: "Scheduled",
          startTime: { toMillis: () => Date.now() + 2 * 24 * 60 * 60 * 1000 },
        }),
      },
    ];

    await runWithRoster(strangerInRoster("studio-elsewhere"));

    const fix = batchOps.find((op) => op.kind === "update" && op.id === "7001");
    expect(fix).toBeTruthy();
    expect(fix!.data.clientId).toBe(QUALIFIED);
  });

  it("still links a same-site visitor the roster hands in", async () => {
    mockAppointments([appointment({ Id: 7001, LocationId: 2, ClientId: "100000271" })]);
    snapshots.clients = strangerAt("studio-westlake");

    await runWithRoster(strangerInRoster("studio-westlake"));

    expect(scheduleWrites()[0].data.clientId).toBe("100000271");
  });

  it("a trainer who cannot read the other site's client still gets the second person's record", async () => {
    // The plain record is Solon's and unreadable here; the second person's
    // does not exist yet, which a trainer's read is also refused for — so it
    // is created on its own, as any new client is.
    mockAppointments([barjesh()]);
    snapshots.clients = strangerAt("studio-elsewhere");
    refusedClientIds = new Set([QUALIFIED]);

    await run();

    expect(setDocOps.filter((op) => op.path === "clients").map((op) => op.id)).toEqual([QUALIFIED]);
    expect(scheduleWrites()[0].data.clientId).toBe(QUALIFIED);
  });
});

describe("syncMindbodySchedules — the lean pull (Sep 25 2026)", () => {
  const FAR_STUDIO: Studio = {
    id: "studio-far",
    name: "Far",
    ownerId: "o1",
    timezone: "America/New_York",
    mindbodySiteId: "5746957",
    mindbodyLocationId: "1",
  };
  const STUDIOS = [...SHARED_SITE_STUDIOS, FAR_STUDIO];
  const person = (over: Record<string, unknown>) =>
    ({ height: "", isActive: true, remainingSessions: 0, ...over }) as unknown as Client;
  // Found by the id rule and named: the only one the lookup may skip.
  const ANN = person({ id: "mb-a", mindbodyClientId: "mb-a", firstName: "Ann", lastName: "Lee", homeStudioId: "studio-solon" });
  // Carries the id at a doc the rule does not use: would be CREATED from the lookup's answer.
  const LEGACY = person({ id: "legacy-7", mindbodyClientId: "mb-l", firstName: "Lou", lastName: "Legacy", homeStudioId: "studio-solon" });
  // Found, but has no name to lend a booking.
  const NAMELESS = person({ id: "mb-n", mindbodyClientId: "mb-n", firstName: "", lastName: "", homeStudioId: "studio-solon" });
  // Another Mindbody site's person: never this site's client.
  const FAR = person({ id: "mb-f", mindbodyClientId: "mb-f", firstName: "Fay", lastName: "Far", homeStudioId: "studio-far" });
  const ROSTER = [ANN, LEGACY, NAMELESS, FAR];

  const run = (skip: boolean) =>
    syncMindbodySchedules(SITE, TRAINERS, ROSTER, STUDIOS, null, undefined, undefined, "studio-solon", "2", {
      skipKnownClientLookups: skip,
    });
  const bodyOf = () => JSON.parse((global.fetch as any).mock.calls[0][1].body);
  const scheduleOp = (id: string) => batchOps.find((op) => op.path === "schedules" && op.id === id);

  it("asks the server to skip only clients it will certainly find and can name", async () => {
    mockAppointments([appointment({ Id: 9001, ClientId: "mb-a", LocationId: 2 })]);
    await run(true);
    expect(bodyOf().skipClientLookupIds).toEqual(["mb-a"]);
  });

  it("sends no skip list unless asked, so the whole-month pull still looks everyone up", async () => {
    mockAppointments([appointment({ Id: 9001, ClientId: "mb-a", LocationId: 2 })]);
    await run(false);
    expect(bodyOf().skipClientLookupIds).toBeUndefined();
  });

  it("names a new booking for a known client from Journey's record when Mindbody sends no name", async () => {
    mockAppointments([
      appointment({ Id: 9002, ClientId: "mb-a", ClientFirstName: "", ClientLastName: "", LocationId: 2 }),
    ]);
    await run(true);
    const op = scheduleOp("9002");
    expect(op?.kind).toBe("set");
    expect(op?.data.clientId).toBe("mb-a");
    expect(op?.data.clientName).toBe("Ann Lee");
  });

  it("keeps the name a row already carries and does not rewrite the row", async () => {
    // First pull: Mindbody names her, and the row is written with that name.
    mockAppointments([
      appointment({ Id: 9003, ClientId: "mb-a", ClientFirstName: "Ann", ClientLastName: "Lee-Smith", LocationId: 2 }),
    ]);
    await run(false);
    const written = scheduleOp("9003")?.data;
    expect(written?.clientName).toBe("Ann Lee-Smith");

    // A near pull skips her lookup: no name comes back, and nothing else moved.
    batchOps = [];
    snapshots.schedules = [{ id: "9003", data: () => ({ ...written }) }];
    mockAppointments([
      appointment({ Id: 9003, ClientId: "mb-a", ClientFirstName: "", ClientLastName: "", LocationId: 2 }),
    ]);
    const result = await run(true);
    expect(scheduleOp("9003")).toBeUndefined();
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("still calls a booking for a client it cannot place 'Unknown Client'", async () => {
    mockAppointments([
      appointment({ Id: 9004, ClientId: null, ClientFirstName: "", ClientLastName: "", LocationId: 2 }),
    ]);
    await run(true);
    expect(scheduleOp("9004")?.data.clientName).toBe("Unknown Client");
  });
});

describe("syncMindbodySchedules — moves across the near window (phase 1's review)", () => {
  const NY = "America/New_York";
  const DAY = 24 * 60 * 60 * 1000;
  const person = (over: Record<string, unknown>) =>
    ({ height: "", isActive: true, remainingSessions: 0, ...over }) as unknown as Client;
  const ANN = person({ id: "mb-a", mindbodyClientId: "mb-a", firstName: "Ann", lastName: "Lee", homeStudioId: "studio-solon" });
  const at = (ms: number) => ({ toMillis: () => ms });
  const row = (id: string, startMs: number, over: Record<string, unknown> = {}) => ({
    id,
    data: () => ({
      mindbodyAppointmentId: id,
      studioId: "studio-solon",
      clientId: "mb-a",
      clientName: "Ann Lee",
      trainerId: "trainer-1",
      status: "Scheduled",
      startTime: at(startMs),
      ...over,
    }),
  });
  const iso = (ms: number) => new Date(ms).toISOString();
  function mockAnswerSequence(...answers: any[][]) {
    let i = 0;
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ appointments: answers[Math.min(i++, answers.length - 1)] }),
    })) as any;
  }
  const opsFor = (id: string) => batchOps.filter((o) => o.path === "schedules" && o.id === id);

  it("updates a booking moved INTO today or tomorrow in place, with its move stamps", async () => {
    respectWindow = true;
    const oldMs = Date.now() + 4 * DAY;
    snapshots.schedules = [row("7001", oldMs)];
    const newMs = Date.now() + DAY;
    mockAppointments([
      appointment({ Id: 7001, ClientId: "mb-a", LocationId: 2, StartDateTime: iso(newMs), EndDateTime: iso(newMs + 1800000) }),
    ]);
    const near = syncWindow(NY, NEAR_WINDOW_DAYS);

    await syncMindbodySchedules(SITE, TRAINERS, [ANN], SHARED_SITE_STUDIOS, null, near.start, near.end, "studio-solon", "2", {
      skipKnownClientLookups: true,
    });

    const [op] = opsFor("7001");
    expect(op.kind).toBe("update");
    expect(op.data.movedFromStart.toMillis()).toBe(oldMs);
    expect(op.data.movedAt).toBeTruthy();
  });

  it("checks the month before calling a booking that left today or tomorrow cancelled", async () => {
    respectWindow = true;
    const tomorrowMs = Date.now() + DAY;
    snapshots.schedules = [row("7002", tomorrowMs), row("7003", Date.now() + 2 * 3600000)];
    const movedToMs = Date.now() + 3 * DAY;
    const stays = appointment({ Id: 7003, ClientId: "mb-a", LocationId: 2, StartDateTime: iso(Date.now() + 2 * 3600000), EndDateTime: iso(Date.now() + 3 * 3600000) });
    const moved = appointment({ Id: 7002, ClientId: "mb-a", LocationId: 2, StartDateTime: iso(movedToMs), EndDateTime: iso(movedToMs + 1800000) });
    // The near answer no longer has 7002; the month answer has it three days out.
    mockAnswerSequence([stays], [stays, moved]);
    const near = syncWindow(NY, NEAR_WINDOW_DAYS);
    const month = syncWindow(NY, DEEP_WINDOW_DAYS);

    const res = await syncMindbodySchedules(SITE, TRAINERS, [ANN], SHARED_SITE_STUDIOS, null, near.start, near.end, "studio-solon", "2", {
      skipKnownClientLookups: true,
      settleSweepWith: month,
    });

    // The near pull cancelled nothing: it handed the one booking that left to the month.
    expect(res.sweepDeferred).toBe(1);
    expect(res.settledWithMonth).toBe(true);
    expect(opsFor("7002").some((o) => o.data.status === "Cancelled")).toBe(false);
    const bodies = (global.fetch as any).mock.calls.map((c: any[]) => JSON.parse(c[1].body));
    expect(bodies).toHaveLength(2);
    expect(bodies[1].startDate).toBe(month.start);
    expect(bodies[1].endDate).toBe(month.end);
    // Filed on its new day as a move.
    const last = opsFor("7002").at(-1)!;
    expect(last.data.status).toBe("Scheduled");
    expect(last.data.movedFromStart.toMillis()).toBe(tomorrowMs);
  });

  it("does not ask for the month when nothing left the window", async () => {
    respectWindow = true;
    snapshots.schedules = [row("7003", Date.now() + 2 * 3600000)];
    const stays = appointment({ Id: 7003, ClientId: "mb-a", LocationId: 2, StartDateTime: iso(Date.now() + 2 * 3600000), EndDateTime: iso(Date.now() + 3 * 3600000) });
    mockAnswerSequence([stays]);
    const near = syncWindow(NY, NEAR_WINDOW_DAYS);

    const res = await syncMindbodySchedules(SITE, TRAINERS, [ANN], SHARED_SITE_STUDIOS, null, near.start, near.end, "studio-solon", "2", {
      settleSweepWith: syncWindow(NY, DEEP_WINDOW_DAYS),
    });

    expect((global.fetch as any).mock.calls).toHaveLength(1);
    expect(res.settledWithMonth).toBeUndefined();
    expect(res.windowComplete).toBe(true);
  });

  it("keeps looking up clients whose record holds only a placeholder name or a webhook stub", async () => {
    const placeholder = person({ id: "mb-p", mindbodyClientId: "mb-p", firstName: "Mindbody", lastName: "Client mb-p", homeStudioId: "studio-solon" });
    const stub = person({ id: "mb-s", mindbodyClientId: "mb-s", firstName: "Sam", lastName: "Stub", isMindbodyStub: true, homeStudioId: "studio-solon" });
    mockAppointments([appointment({ Id: 7004, ClientId: "mb-a", LocationId: 2 })]);

    await syncMindbodySchedules(SITE, TRAINERS, [ANN, placeholder, stub], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2", {
      skipKnownClientLookups: true,
    });

    expect(JSON.parse((global.fetch as any).mock.calls[0][1].body).skipClientLookupIds).toEqual(["mb-a"]);
  });

  it("parks a known client's booking at an unclaimed location under her name, not Unknown Client", async () => {
    mockAppointments([
      appointment({ Id: 7005, ClientId: "mb-a", ClientFirstName: "", ClientLastName: "", LocationId: 9 }),
    ]);

    await syncMindbodySchedules(SITE, TRAINERS, [ANN], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2", {
      skipKnownClientLookups: true,
    });

    const parked = setDocOps.find((op) => JSON.stringify(op.data).includes("7005"));
    expect(parked).toBeTruthy();
    expect(JSON.stringify(parked!.data)).toContain("Ann Lee");
    expect(JSON.stringify(parked!.data)).not.toContain("Unknown Client");
  });

  it("says when Mindbody's answer was short, so the month is not recorded as read", async () => {
    mockAppointments([appointment({ Id: 7006, ClientId: "mb-a", LocationId: 2 })], { complete: false });
    const res = await syncMindbodySchedules(SITE, TRAINERS, [ANN], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2");
    expect(res.windowComplete).toBe(false);
  });
});

describe("syncMindbodySchedules — the second review's fixes", () => {
  const NY = "America/New_York";
  const DAY = 24 * 60 * 60 * 1000;
  const ANN = { id: "mb-a", mindbodyClientId: "mb-a", firstName: "Ann", lastName: "Lee", homeStudioId: "studio-solon", height: "", isActive: true, remainingSessions: 0 } as unknown as Client;
  const FAR: Studio = { id: "studio-far", name: "Far", ownerId: "o1", timezone: NY, mindbodySiteId: "5746957", mindbodyLocationId: "1" };
  const row = (id: string, startMs: number, over: Record<string, unknown> = {}) => ({
    id,
    data: () => ({ mindbodyAppointmentId: id, studioId: "studio-solon", clientId: "mb-a", clientName: "Ann Lee", trainerId: "trainer-1", status: "Scheduled", startTime: { toMillis: () => startMs }, ...over }),
  });
  const iso = (ms: number) => new Date(ms).toISOString();
  const appt = (id: number, ms: number) =>
    appointment({ Id: id, ClientId: "mb-a", LocationId: 2, StartDateTime: iso(ms), EndDateTime: iso(ms + 1800000) });
  function mockAnswerSequence(...answers: any[][]) {
    let i = 0;
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ appointments: answers[Math.min(i++, answers.length - 1)] }),
    })) as any;
  }
  const opsFor = (id: string) => batchOps.filter((o) => o.path === "schedules" && o.id === id);

  it("hands an empty two-day answer to the month when Journey still holds a booking in it", async () => {
    respectWindow = true;
    const todayMs = Date.now() + 2 * 3600000;
    snapshots.schedules = [row("7011", todayMs)];
    // Today and tomorrow come back empty; the month holds another booking, not 7011.
    mockAnswerSequence([], [appt(7012, Date.now() + 5 * DAY)]);
    const near = syncWindow(NY, NEAR_WINDOW_DAYS);
    const month = syncWindow(NY, DEEP_WINDOW_DAYS);

    const res = await syncMindbodySchedules(SITE, TRAINERS, [ANN], SHARED_SITE_STUDIOS, null, near.start, near.end, "studio-solon", "2", {
      settleSweepWith: month,
    });

    expect(res.sweepDeferred).toBe(1);
    expect(JSON.parse((global.fetch as any).mock.calls[1][1].body).startDate).toBe(month.start);
    const cancel = opsFor("7011").find((o) => o.data.status === "Cancelled");
    expect(cancel?.data.cancelSource).toBe("sweep");
  });

  it("does not ask for the month on an empty answer when nothing live is held", async () => {
    respectWindow = true;
    snapshots.schedules = [row("7013", Date.now() + 2 * 3600000, { status: "Cancelled" })];
    mockAnswerSequence([]);
    const near = syncWindow(NY, NEAR_WINDOW_DAYS);

    const res = await syncMindbodySchedules(SITE, TRAINERS, [ANN], SHARED_SITE_STUDIOS, null, near.start, near.end, "studio-solon", "2", {
      settleSweepWith: syncWindow(NY, DEEP_WINDOW_DAYS),
    });

    expect((global.fetch as any).mock.calls).toHaveLength(1);
    expect(res.sweepDeferred).toBeUndefined();
  });

  it("does not count a month as read when Journey could not take the answer in", async () => {
    mockAppointments([appt(7014, Date.now() + DAY)]);
    vi.mocked(getDocs).mockRejectedValueOnce(Object.assign(new Error("Quota exceeded."), { code: "resource-exhausted" }));

    const res = await syncMindbodySchedules(SITE, TRAINERS, [ANN], SHARED_SITE_STUDIOS, null, undefined, undefined, "studio-solon", "2");

    expect(res.windowComplete).toBe(false);
    expect(res.errors.join(" ")).toContain("Quota exceeded");
  });

  it("never takes another Mindbody site's booking for this one's history", async () => {
    respectWindow = true;
    // The same appointment id, held by a studio on the other site, four days out.
    snapshots.schedules = [row("7015", Date.now() + 4 * DAY, { studioId: "studio-far" })];
    mockAppointments([appt(7015, Date.now() + DAY)]);
    const near = syncWindow(NY, NEAR_WINDOW_DAYS);

    await syncMindbodySchedules(SITE, TRAINERS, [ANN], [...SHARED_SITE_STUDIOS, FAR], null, near.start, near.end, "studio-solon", "2");

    const [op] = opsFor("7015");
    expect(op.kind).toBe("set");
    expect(op.data.movedFromStart).toBeUndefined();
  });
});
