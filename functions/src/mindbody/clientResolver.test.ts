import { describe, it, expect, vi, beforeEach } from "vitest";
import { Firestore } from "firebase-admin/firestore";
import { ensureCanonicalClient, recordLimboEvent } from "./clientResolver";

/**
 * Mock harness: `docs` is the pretend clients collection keyed by doc id, and
 * `queryResults` is what a where()/limit() lookup would return. STRICT MODE
 * should never consult `queryResults` at all — several tests assert exactly
 * that, because a stale document must be ignored, not adopted.
 */
describe("ensureCanonicalClient (strict)", () => {
  let docs: Record<string, Record<string, unknown> | undefined>;
  let queryResults: Record<string, { id: string; data: () => any }[]>;
  let whereCalls: string[];
  let sets: { collection: string; id: string; data: any; options: any }[];
  let firestore: Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    docs = {};
    queryResults = {};
    whereCalls = [];
    sets = [];

    const makeDoc = (collectionName: string, id: string) => ({
      id,
      get: vi.fn().mockResolvedValue({
        exists: docs[id] !== undefined,
        data: () => docs[id],
      }),
      set: vi.fn(async (data: any, options: any) => {
        sets.push({ collection: collectionName, id, data, options });
      }),
    });

    firestore = {
      collection: vi.fn((collectionName: string) => ({
        doc: vi.fn((id: string) => makeDoc(collectionName, id)),
        where: vi.fn((field: string) => {
          whereCalls.push(field);
          return {
            limit: vi.fn(() => ({
              get: vi.fn().mockResolvedValue({
                docs: queryResults[field] || [],
              }),
            })),
          };
        }),
      })),
    } as unknown as Firestore;
  });

  const call = (overrides: Record<string, any> = {}) =>
    ensureCanonicalClient(firestore, {
      mindbodyClientId: "100045",
      profile: { firstName: "Judy", lastName: "Davis" },
      studioId: "solon",
      origin: "client-event",
      ...overrides,
    });

  const clientWrites = () => sets.filter((s) => s.collection === "clients");

  it("creates a COMPLETE profile at the canonical id", async () => {
    const result = await call();

    expect(result).toEqual({ clientDocId: "100045", created: true });
    const written = clientWrites()[0];
    expect(written.id).toBe("100045");
    // Every field the app's Client type marks required must be present.
    expect(written.data).toEqual(
      expect.objectContaining({
        firstName: "Judy",
        lastName: "Davis",
        mindbodyClientId: "100045",
        homeStudioId: "solon",
        isActive: true,
        height: "",
        remainingSessions: 0,
        sessionCount: 0,
      }),
    );
  });

  it("never runs a lookup query — the doc id IS the join key", async () => {
    await call();
    // A single where() here would mean strict mode had leaked back into
    // searching for documents by field.
    expect(whereCalls).toEqual([]);
  });

  it("IGNORES a stale document sitting at a legacy doc id", async () => {
    // Pre-strict this was adopted to avoid splitting history. Now it must be
    // passed over entirely and the canonical document written instead.
    queryResults.mindbodyClientId = [
      { id: "legacy-abc", data: () => ({ firstName: "Judy" }) },
    ];
    docs["legacy-abc"] = { firstName: "Judy" };

    const result = await call();

    expect(result.clientDocId).toBe("100045");
    expect(result.created).toBe(true);
    expect(clientWrites().some((w) => w.id === "legacy-abc")).toBe(false);
  });

  it("IGNORES an existing profile sharing the client's email", async () => {
    queryResults.email = [
      { id: "manual-1", data: () => ({ email: "j@x.com" }) },
    ];

    const result = await call({
      profile: { firstName: "Judy", email: "j@x.com" },
    });

    expect(result.clientDocId).toBe("100045");
    expect(clientWrites().some((w) => w.id === "manual-1")).toBe(false);
  });

  it("writes homeStudioId as null rather than guessing a default studio", async () => {
    await call({ studioId: null });
    expect(clientWrites()[0].data.homeStudioId).toBeNull();
  });

  it("marks booking-created records as stubs", async () => {
    await call({ origin: "booking-stub" });
    expect(clientWrites()[0].data.isMindbodyStub).toBe(true);
    expect(clientWrites()[0].data.createdBy).toBe("mindbody:booking-stub");
  });

  it("never overwrites trainer-entered values on an existing profile", async () => {
    docs["100045"] = {
      firstName: "Judith",
      lastName: "Davis",
      phone: "216-555-0000",
      homeStudioId: "solon",
    };

    const result = await call({
      profile: { firstName: "Judy", phone: "216-555-9999", email: "j@x.com" },
      enrichment: { membershipStatus: "Active" },
    });

    expect(result.created).toBe(false);
    const data = clientWrites()[0].data;
    expect(data.firstName).toBeUndefined(); // already set -> untouched
    expect(data.phone).toBeUndefined(); // already set -> untouched
    expect(data.email).toBe("j@x.com"); // was blank -> filled
    expect(data.membershipStatus).toBe("Active"); // Mindbody-owned -> always
    expect(clientWrites()[0].options).toEqual({ merge: true });
  });

  it("gives a first-name-only client an empty surname, not a placeholder", async () => {
    await call({ profile: { firstName: "Alice" } });
    const data = clientWrites()[0].data;
    expect(data.firstName).toBe("Alice");
    // "Client 100045" would read as Alice's actual last name across the app.
    expect(data.lastName).toBe("");
    expect(data.mindbody_name).toBe("Alice");
  });

  it("omits mindbody_name entirely when the payload carries no name", async () => {
    await call({ profile: {} });
    const data = clientWrites()[0].data;
    expect(data.firstName).toBe("Mindbody");
    expect(data.lastName).toBe("Client 100045");
    // A blank string looks like a real, empty value to every consumer.
    expect(data).not.toHaveProperty("mindbody_name");
  });

  it("rejects an empty Mindbody client id", async () => {
    await expect(call({ mindbodyClientId: "   " })).rejects.toThrow(TypeError);
  });

  describe("recordLimboEvent", () => {
    it("parks an event with everything an admin needs to act on it", async () => {
      await recordLimboEvent(firestore, {
        eventId: "evt-1",
        eventType: "appointmentBooking.created",
        kind: "booking",
        siteId: 99999,
        locationId: 7,
        clientId: "client-123",
        reason: "no studio has this site id",
        summary: { bookingId: "b-1", clientName: "Alice Smith" },
        payload: { eventData: { id: "b-1" } },
      });

      const [parked] = sets.filter((s) => s.collection === "mindbodyLimbo");
      // Doc id is the event id, so Mindbody's retries collapse onto one record.
      expect(parked.id).toBe("evt-1");
      expect(parked.data).toMatchObject({
        kind: "booking",
        siteId: "99999",
        locationId: "7",
        clientId: "client-123",
        resolvedAt: null,
        summary: { bookingId: "b-1", clientName: "Alice Smith" },
      });
    });
  });
});
