import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Timestamp } from "firebase/firestore";

// The real module initializes a Firebase app on import.
vi.mock("../firebase", () => ({ db: {} }));

const setDocMock = vi.fn();
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
    setDoc: (...args: unknown[]) => setDocMock(...args),
    serverTimestamp: () => "SERVER_TS",
  };
});

const {
  mapContracts,
  mapMemberships,
  syncClientCommercialData,
} = await import("./mindbody-commercial-sync");

describe("mapContracts", () => {
  it("maps a Mindbody ClientContract onto the webhook's record shape", () => {
    const out = mapContracts(
      [
        {
          clientContractId: 117,
          contractName: "Gold Membership Contract",
          agreementDate: "2026-03-20T10:29:42",
          startDate: "2026-03-20T00:00:00",
          endDate: "2027-03-20T00:00:00",
          autopayStatus: "Active",
          originationLocationId: 1,
          siteId: 5746957,
        },
      ],
      "SERVER_TS",
    );

    // Keyed on clientContractId so a later webhook lands on the same entry.
    expect(Object.keys(out)).toEqual(["117"]);
    expect(out["117"]).toMatchObject({
      clientContractId: 117,
      contractName: "Gold Membership Contract",
      status: "Active",
      autopayStatus: "Active",
      originationLocationId: 1,
      siteId: 5746957,
      lastPullSyncAt: "SERVER_TS",
    });
    // Zoneless Mindbody dates are read as UTC, not as the browser's clock.
    expect(out["117"].endDate).toEqual(
      Timestamp.fromDate(new Date("2027-03-20T00:00:00Z")),
    );
  });

  it("never writes the webhook-owned isAutoRenewing or empty values", () => {
    const out = mapContracts(
      [{ clientContractId: 117, contractName: "", autopayStatus: "", endDate: null }],
      "SERVER_TS",
    );
    const record = out["117"];
    expect(record).not.toHaveProperty("isAutoRenewing");
    expect(record).not.toHaveProperty("contractName");
    expect(record).not.toHaveProperty("autopayStatus");
    expect(record).not.toHaveProperty("endDate");
  });

  it("skips rows with no usable id", () => {
    expect(mapContracts([{ contractName: "Orphan" }], "SERVER_TS")).toEqual({});
    expect(mapContracts(undefined, "SERVER_TS")).toEqual({});
  });
});

describe("mapMemberships", () => {
  it("maps an active membership including its session counts", () => {
    const out = mapMemberships(
      [
        {
          membershipId: 12,
          membershipName: "Gold Level Member",
          programName: "Personal Training",
          activeDate: "2026-01-01T00:00:00",
          expirationDate: "2026-12-31T00:00:00",
          count: 24,
          remaining: 10,
          siteId: 5746957,
        },
      ],
      "SERVER_TS",
    );

    expect(out["12"]).toMatchObject({
      membershipId: 12,
      membershipName: "Gold Level Member",
      programName: "Personal Training",
      status: "Active",
      sessionCount: 24,
      sessionsRemaining: 10,
    });
    // The endpoint only returns active memberships, so a stale cancellation
    // must be cleared rather than left standing.
    expect(out["12"].cancelledAt).toBeNull();
  });

  it("keeps a zero session balance instead of dropping it as falsy", () => {
    const out = mapMemberships(
      [{ membershipId: 12, remaining: 0, count: 0 }],
      "SERVER_TS",
    );
    expect(out["12"].sessionsRemaining).toBe(0);
    expect(out["12"].sessionCount).toBe(0);
  });
});

describe("syncClientCommercialData", () => {
  beforeEach(() => {
    setDocMock.mockReset();
    setDocMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = (ok: boolean, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok, json: async () => body }),
    );

  it("writes both maps with merge:true and reports the counts", async () => {
    stubFetch(true, {
      contracts: [{ clientContractId: 117, contractName: "Gold" }],
      memberships: [{ membershipId: 12, membershipName: "Gold Level Member" }],
      partial: false,
    });

    const result = await syncClientCommercialData({
      clientDocId: "abc123",
      siteId: 5746957,
      mindbodyClientId: "100000009",
    });

    expect(result).toEqual({ memberships: 1, contracts: 1, partial: false });
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [ref, updates, options] = setDocMock.mock.calls[0];
    // Writes to the app's own doc id, not to clients/{mindbodyClientId}.
    expect(ref).toEqual({ path: "clients/abc123" });
    expect(options).toEqual({ merge: true });
    expect(updates.mindbodyContracts["117"].contractName).toBe("Gold");
    expect(updates.mindbodyMemberships["12"].membershipName).toBe(
      "Gold Level Member",
    );
  });

  it("omits an empty map rather than writing one that would look authoritative", async () => {
    stubFetch(true, { contracts: [], memberships: [{ membershipId: 12 }] });

    await syncClientCommercialData({
      clientDocId: "abc123",
      siteId: 5746957,
      mindbodyClientId: "100000009",
    });

    const [, updates] = setDocMock.mock.calls[0];
    expect(updates).not.toHaveProperty("mindbodyContracts");
    expect(updates).toHaveProperty("mindbodyMemberships");
  });

  it("throws the API's message and writes nothing when the route fails", async () => {
    stubFetch(false, { error: "Client not found in MindBody Site ID 5746957" });

    await expect(
      syncClientCommercialData({
        clientDocId: "abc123",
        siteId: 5746957,
        mindbodyClientId: "nope",
      }),
    ).rejects.toThrow("Client not found in MindBody Site ID 5746957");

    expect(setDocMock).not.toHaveBeenCalled();
  });
});
