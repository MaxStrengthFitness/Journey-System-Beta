import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Client, Studio } from "../types";
import type { MasterSyncFound } from "./mindbody-master-sync";
import type { MindbodyDemographics } from "./mindbody-demographics-map";

// The real module initializes a Firebase app on import.
vi.mock("../firebase", () => ({ db: {} }));

const setDocMock = vi.fn();
const updateDocMock = vi.fn();
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
    setDoc: (...args: unknown[]) => setDocMock(...args),
    updateDoc: (...args: unknown[]) => updateDocMock(...args),
    serverTimestamp: () => "SERVER_TS",
  };
});

const { buildMasterSyncPatch, runMasterSync } = await import("./mindbody-master-sync");
const { buildCommercialWrites } = await import("./mindbody-commercial-sync");

const NOW = new Date("2026-09-15T14:00:00Z");
const STAMP = "STAMP";

const base: Client = {
  id: "100045",
  homeStudioId: "solon",
  firstName: "Jane",
  lastName: "Doe",
  height: "",
  isActive: true,
  remainingSessions: 0,
};

function demographics(over: Partial<MindbodyDemographics> = {}): MindbodyDemographics {
  return {
    mindbodyClientId: "100045",
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    dateOfBirth: null,
    gender: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    status: null,
    active: null,
    isProspect: null,
    createdAt: null,
    firstAppointmentDate: null,
    liability: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    photoUrl: null,
    notes: null,
    homeLocationId: null,
    ...over,
  };
}

function found(over: Partial<MasterSyncFound> = {}, demo: Partial<MindbodyDemographics> = {}): MasterSyncFound {
  return {
    found: true,
    mindbodyClientId: "100045",
    siteId: "5746957",
    demographics: demographics(demo),
    commercial: { contracts: [], memberships: [], services: [], partial: false },
    visits: null,
    partial: false,
    failed: [],
    fetchedAt: NOW.toISOString(),
    ...over,
  };
}

const build = (client: Client, res: MasterSyncFound) => buildMasterSyncPatch(client, res, NOW, STAMP);

describe("buildMasterSyncPatch", () => {
  it("fills the address parts and joins the two address lines", () => {
    const { patch, changedFields } = build(
      base,
      found({}, {
        addressLine1: "12 Main St",
        addressLine2: "Apt 4",
        city: "Solon",
        state: "OH",
        postalCode: "44139",
        country: "US",
      }),
    );
    expect(patch).toMatchObject({
      address: "12 Main St, Apt 4",
      city: "Solon",
      addressState: "OH",
      postalCode: "44139",
      country: "US",
    });
    expect(changedFields).toEqual(
      expect.arrayContaining(["address", "city", "addressState", "postalCode", "country"]),
    );
  });

  describe("the waiver", () => {
    it("writes signed, with the agreement date as a Timestamp", () => {
      const { patch } = build(
        base,
        found({}, { liability: { isReleased: true, agreementDate: "2014-03-02T09:20:00.000Z" } }),
      );
      expect(patch.isLiabilityReleased).toBe(true);
      expect(patch.liabilityAgreementDate).toEqual(Timestamp.fromDate(new Date("2014-03-02T09:20:00Z")));
    });

    it("writes not-signed over a stale 'signed', and leaves the old date alone", () => {
      const stored = Timestamp.fromDate(new Date("2014-03-02T09:20:00Z"));
      const { patch, changedFields } = build(
        { ...base, isLiabilityReleased: true, liabilityAgreementDate: stored },
        found({}, { liability: { isReleased: false, agreementDate: null } }),
      );
      expect(patch.isLiabilityReleased).toBe(false);
      expect(patch).not.toHaveProperty("liabilityAgreementDate");
      expect(changedFields).toContain("isLiabilityReleased");
    });

    it("leaves the waiver as it is when Mindbody said nothing about it", () => {
      const { patch } = build({ ...base, isLiabilityReleased: true }, found({}, { liability: null }));
      expect(patch).not.toHaveProperty("isLiabilityReleased");
      expect(patch).not.toHaveProperty("liabilityAgreementDate");
      const fresh = build(base, found({}, { liability: null })).patch;
      expect(fresh).not.toHaveProperty("isLiabilityReleased");
    });

    it("doesn't rewrite a signed waiver whose date is the same instant", () => {
      const stored = Timestamp.fromDate(new Date("2014-03-02T09:20:00Z"));
      const { patch, changedFields } = build(
        { ...base, isLiabilityReleased: true, liabilityAgreementDate: stored },
        found({}, { liability: { isReleased: true, agreementDate: "2014-03-02T09:20:00.000Z" } }),
      );
      expect(patch).not.toHaveProperty("isLiabilityReleased");
      expect(patch).not.toHaveProperty("liabilityAgreementDate");
      expect(changedFields).not.toContain("isLiabilityReleased");
      expect(changedFields).not.toContain("liabilityAgreementDate");
    });
  });

  it("writes status, prospect and Mindbody's active flag — never the app's isActive", () => {
    const { patch, changedFields } = build(
      { ...base, isActive: true, mindbodyStatus: "Non-Member", isProspect: true },
      found({}, { status: "Active", isProspect: false, active: false }),
    );
    expect(patch).toMatchObject({ mindbodyStatus: "Active", isProspect: false, mindbodyActive: false });
    expect(patch).not.toHaveProperty("isActive");
    expect(changedFields).toEqual(expect.arrayContaining(["mindbodyStatus", "isProspect", "mindbodyActive"]));
  });

  it("never blanks a field because Mindbody sent nothing", () => {
    const client: Client = {
      ...base,
      email: "jane@example.com",
      phone: "2165550100",
      address: "12 Main St",
      city: "Solon",
      mindbodyStatus: "Active",
      mindbodyNotes: "Prefers mornings",
      photoUrl: "https://x/p.jpg",
      clientsNumberOfVisitsAtSite: 400,
      isProspect: false,
    };
    const { patch, changedFields } = build(
      client,
      found({ visits: null }, { firstName: "", lastName: "  ", email: "", phone: "", city: "", notes: "" }),
    );
    expect(Object.keys(patch).sort()).toEqual(
      ["mindbodyClientId", "mindbodyId", "mindbodyMasterSyncedAt", "mindbodyServices", "mindbodyServicesSyncedAt"].sort(),
    );
    for (const value of Object.values(patch)) expect(value).not.toBeUndefined();
    expect(changedFields).toEqual(["mindbodyClientId", "mindbodyId"]);
  });

  it("leaves out values that haven't changed", () => {
    const client: Client = {
      ...base,
      mindbodyClientId: "100045",
      mindbodyId: "100045",
      email: "jane@example.com",
      city: "Solon",
      mindbodyCreatedAt: Timestamp.fromDate(new Date("2014-03-02T09:15:00Z")),
      clientsNumberOfVisitsAtSite: 412,
    };
    const { patch, changedFields } = build(
      client,
      found(
        { visits: 412, commercial: { contracts: null, memberships: null, services: null, partial: true } },
        {
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          city: "Solon",
          createdAt: "2014-03-02T09:15:00.000Z",
        },
      ),
    );
    expect(patch).toEqual({ mindbodyMasterSyncedAt: NOW.toISOString() });
    expect(changedFields).toEqual([]);
  });

  it("writes the visit count only when Mindbody gave one", () => {
    expect(build(base, found({ visits: 412 })).patch.clientsNumberOfVisitsAtSite).toBe(412);
    expect(build(base, found({ visits: 0 })).patch.clientsNumberOfVisitsAtSite).toBe(0);
    expect(build({ ...base, clientsNumberOfVisitsAtSite: 9 }, found({ visits: null })).patch).not.toHaveProperty(
      "clientsNumberOfVisitsAtSite",
    );
  });

  describe("pricing options", () => {
    it("replaces the map when that call worked", () => {
      const client: Client = {
        ...base,
        mindbodyServices: { "1": { serviceId: 1, name: "Old", count: 8, remaining: 0 } as any },
      };
      const { patch, replaceServices, changedFields } = build(
        client,
        found({
          commercial: {
            contracts: [],
            memberships: [],
            services: [{ serviceId: 555, name: "144 PIF", count: 144, remaining: 109 } as any],
            partial: false,
          },
        }),
      );
      expect(Object.keys(patch.mindbodyServices as object)).toEqual(["555"]);
      expect(patch.mindbodyServicesSyncedAt).toBe(STAMP);
      expect(replaceServices).toBe(patch.mindbodyServices);
      expect(changedFields).toContain("mindbodyServices");
    });

    it("writes nothing when that call failed — unknown, not empty", () => {
      const client: Client = {
        ...base,
        mindbodyServices: { "555": { serviceId: 555, name: "144 PIF", count: 144, remaining: 109 } as any },
      };
      const { patch, replaceServices, changedFields } = build(
        client,
        found({
          partial: true,
          failed: ["services"],
          commercial: { contracts: [], memberships: [], services: null, partial: true },
        }),
      );
      expect(replaceServices).toBeNull();
      expect(patch).not.toHaveProperty("mindbodyServices");
      expect(patch).not.toHaveProperty("mindbodyServicesSyncedAt");
      expect(changedFields).not.toContain("mindbodyServices");
    });

    it("doesn't count an identical map as a change", () => {
      const client: Client = {
        ...base,
        mindbodyServices: {
          "555": { serviceId: 555, name: "144 PIF", count: 144, remaining: 109, lastPullSyncAt: "earlier" } as any,
        },
      };
      const { changedFields } = build(
        client,
        found({
          commercial: {
            contracts: [],
            memberships: [],
            services: [{ serviceId: 555, name: "144 PIF", count: 144, remaining: 109 } as any],
            partial: false,
          },
        }),
      );
      expect(changedFields).not.toContain("mindbodyServices");
    });
  });

  it("merges contracts and memberships, and stamps the contract pull only when contracts were read", () => {
    const withContracts = build(
      base,
      found({
        commercial: {
          contracts: [{ clientContractId: 117, contractName: "Gold", endDate: "2027-03-20T00:00:00" } as any],
          memberships: null,
          services: null,
          partial: true,
        },
      }),
    );
    expect(withContracts.mergeMaps).toMatchObject({
      mindbodyCommercialSyncedAt: STAMP,
      mindbodyContracts: { "117": { contractName: "Gold", status: "Active" } },
    });
    expect((withContracts.mergeMaps as any).mindbodyContracts["117"].endDate).toEqual(
      Timestamp.fromDate(new Date("2027-03-20T00:00:00Z")),
    );
    expect(withContracts.changedFields).toContain("mindbodyContracts");

    const contractsFailed = build(
      base,
      found({
        commercial: {
          contracts: null,
          memberships: [{ membershipId: 12, membershipName: "Gold Level" } as any],
          services: null,
          partial: true,
        },
      }),
    );
    expect(contractsFailed.mergeMaps).not.toHaveProperty("mindbodyCommercialSyncedAt");
    expect(contractsFailed.mergeMaps).toHaveProperty("mindbodyMemberships");

    const nothingRead = build(
      base,
      found({ commercial: { contracts: null, memberships: null, services: null, partial: true } }),
    );
    expect(nothingRead.mergeMaps).toBeNull();
  });

  it("doesn't count a contract that is unchanged (webhook fields and stamps aside)", () => {
    const client: Client = {
      ...base,
      mindbodyContracts: {
        "117": {
          clientContractId: 117,
          contractName: "Gold",
          status: "Active",
          isAutoRenewing: true,
          endDate: Timestamp.fromDate(new Date("2027-03-20T00:00:00Z")),
          lastPullSyncAt: "earlier",
        } as any,
      },
    };
    const { changedFields, mergeMaps } = build(
      client,
      found({
        commercial: {
          contracts: [{ clientContractId: 117, contractName: "Gold", endDate: "2027-03-20T00:00:00" } as any],
          memberships: [],
          services: null,
          partial: true,
        },
      }),
    );
    expect(changedFields).not.toContain("mindbodyContracts");
    // Still refreshed, so the pull stamp moves on.
    expect(mergeMaps).toHaveProperty("mindbodyContracts");
  });

  it("sets both Mindbody id fields, for a webhook-made client that had only one", () => {
    const { patch, changedFields } = build({ ...base, mindbodyClientId: "100045" }, found());
    expect(patch.mindbodyId).toBe("100045");
    expect(patch).not.toHaveProperty("mindbodyClientId");
    expect(changedFields).toEqual(["mindbodyId"]);
  });

  it("refuses a first or last name the rules would refuse", () => {
    const { patch } = build(
      base,
      found({}, { firstName: "x".repeat(50), lastName: "Smith-Jones" }),
    );
    expect(patch).not.toHaveProperty("firstName");
    expect(patch.lastName).toBe("Smith-Jones");
  });

  it("writes Mindbody's own dates as Timestamps and marks first appointment as Mindbody's", () => {
    const { patch, changedFields } = build(
      { ...base, firstAppointmentDateSource: "pull-sync:earliest-in-window" },
      found({}, { createdAt: "2014-03-02T09:15:00.000Z", firstAppointmentDate: "2014-03-05T10:00:00.000Z" }),
    );
    expect(patch.mindbodyCreatedAt).toEqual(Timestamp.fromDate(new Date("2014-03-02T09:15:00Z")));
    expect(patch.firstAppointmentDate).toEqual(Timestamp.fromDate(new Date("2014-03-05T10:00:00Z")));
    expect(patch.firstAppointmentDateSource).toBe("mindbody");
    expect(changedFields).toEqual(expect.arrayContaining(["mindbodyCreatedAt", "firstAppointmentDate"]));
    expect(changedFields).not.toContain("firstAppointmentDateSource");
  });

  it("confirms an inferred first appointment even when the date matches", () => {
    const stored = Timestamp.fromDate(new Date("2014-03-05T10:00:00Z"));
    const inferred = build(
      { ...base, firstAppointmentDate: stored, firstAppointmentDateSource: "backfill:earliest-session" },
      found({}, { firstAppointmentDate: "2014-03-05T10:00:00.000Z" }),
    );
    expect(inferred.patch).not.toHaveProperty("firstAppointmentDate");
    expect(inferred.patch.firstAppointmentDateSource).toBe("mindbody");

    // Absent source = the webhook wrote it: nothing to do.
    const webhook = build(
      { ...base, firstAppointmentDate: stored },
      found({}, { firstAppointmentDate: "2014-03-05T10:00:00.000Z" }),
    );
    expect(webhook.patch).not.toHaveProperty("firstAppointmentDateSource");

    // No date from Mindbody: the inference stays as it is.
    const silent = build(
      { ...base, firstAppointmentDate: stored, firstAppointmentDateSource: "backfill:x" },
      found({}, { firstAppointmentDate: null }),
    );
    expect(silent.patch).not.toHaveProperty("firstAppointmentDateSource");
  });

  it("never touches coach-owned fields or the renewal snapshot", () => {
    const { patch } = build(
      { ...base, notes: "coach", occupation: "Nurse", goals: "Strength", renewal: {} as any },
      found(
        { visits: 5 },
        {
          firstName: "Janet",
          lastName: "Doe",
          email: "j@x.com",
          phone: "1",
          dateOfBirth: "1970-05-12",
          gender: "Female",
          addressLine1: "1 A St",
          city: "Solon",
          state: "OH",
          postalCode: "44139",
          country: "US",
          status: "Active",
          active: true,
          isProspect: false,
          createdAt: "2014-03-02T09:15:00.000Z",
          firstAppointmentDate: "2014-03-05T10:00:00.000Z",
          liability: { isReleased: true, agreementDate: "2014-03-02T09:20:00.000Z" },
          emergencyContactName: "John",
          emergencyContactPhone: "2",
          emergencyContactRelationship: "Spouse",
          photoUrl: "https://x/p.jpg",
          notes: "Mindbody note",
          homeLocationId: 1,
        },
      ),
    );
    for (const key of ["notes", "occupation", "goals", "renewal", "isActive", "homeStudioId", "nickname"]) {
      expect(patch, key).not.toHaveProperty(key);
    }
    expect(patch.mindbodyNotes).toBe("Mindbody note");
    expect(patch.emergencyContactRelationship).toBe("Spouse");
    expect(patch.mindbodyHomeLocationId).toBe(1);
    for (const value of Object.values(patch)) expect(value).not.toBeUndefined();
  });

  it("refuses an insecure photo and a malformed birthday", () => {
    const { patch } = build(base, found({}, { photoUrl: "http://x/p.jpg", dateOfBirth: "May 12" }));
    expect(patch).not.toHaveProperty("photoUrl");
    expect(patch).not.toHaveProperty("dateOfBirth");
  });
});

describe("buildCommercialWrites", () => {
  it("treats a null list as unread and an empty one as read", () => {
    expect(buildCommercialWrites({ contracts: null, memberships: null, services: null }, STAMP)).toMatchObject({
      merge: null,
      services: null,
    });
    expect(buildCommercialWrites({ contracts: [], memberships: [], services: [] }, STAMP)).toMatchObject({
      merge: { mindbodyCommercialSyncedAt: STAMP },
      services: {},
    });
  });
});

describe("runMasterSync", () => {
  const studios = [{ id: "solon", name: "Solon", mindbodySiteId: "5746957" } as Studio];

  beforeEach(() => {
    setDocMock.mockReset();
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockReset();
    updateDocMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = (ok: boolean, body: unknown) => {
    const fn = vi.fn().mockResolvedValue({ ok, json: async () => body });
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  it("asks the home studio's site by id, writes twice at most, and says how many fields changed", async () => {
    const fetchMock = stubFetch(
      true,
      found(
        {
          visits: 412,
          commercial: {
            contracts: [{ clientContractId: 117, contractName: "Gold" } as any],
            memberships: [],
            services: [],
            partial: false,
          },
        },
        { city: "Solon", status: "Active" },
      ),
    );

    const result = await runMasterSync({ client: { ...base, mindbodyClientId: "100045" }, studios, now: NOW });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mindbody/client-master-sync");
    expect(JSON.parse(init.body)).toEqual({ siteId: "5746957", mindbodyClientId: "100045" });
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0][0]).toEqual({ path: "clients/100045" });
    expect(setDocMock.mock.calls[0][2]).toEqual({ merge: true });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const patch = updateDocMock.mock.calls[0][1];
    expect(patch).toMatchObject({ city: "Solon", mindbodyStatus: "Active", clientsNumberOfVisitsAtSite: 412 });
    expect(patch).not.toHaveProperty("renewal");

    expect(result.status).toBe("ok");
    // mindbodyId, city, mindbodyStatus, visits, contracts, services (was absent)
    expect(result.changedFields).toEqual(
      expect.arrayContaining(["mindbodyId", "city", "mindbodyStatus", "clientsNumberOfVisitsAtSite", "mindbodyContracts"]),
    );
    expect(result.message).toBe(`Up to date with Mindbody — ${result.changedFields.length} fields refreshed.`);
  });

  it("says so when Mindbody has no such client, and writes nothing", async () => {
    stubFetch(true, { found: false, mindbodyClientId: "12345", siteId: "5746957", fetchedAt: "" });
    const result = await runMasterSync({ client: { ...base, id: "12345" }, studios });
    expect(result).toMatchObject({
      status: "not-found",
      message: "Mindbody has no client with ID 12345 at Solon.",
    });
    expect(setDocMock).not.toHaveBeenCalled();
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("needs a Mindbody id, and never asks by name", async () => {
    const fetchMock = stubFetch(true, {});
    const result = await runMasterSync({
      client: { ...base, id: "Xk3pQ9aB2cD4eF6gH8iJ", firstName: "Jane", lastName: "Doe" },
      studios,
    });
    expect(result.status).toBe("no-id");
    expect(fetchMock).not.toHaveBeenCalled();

    const temp = await runMasterSync({ client: { ...base, provisional: true }, studios });
    expect(temp.status).toBe("no-id");
    expect(temp.message).toMatch(/temporary profile/);
  });

  it("refuses a home studio with no Mindbody site", async () => {
    const fetchMock = stubFetch(true, {});
    const result = await runMasterSync({ client: base, studios: [{ id: "solon", name: "Solon" } as Studio] });
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/Solon has no Mindbody Site ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a partial sync in plain English, and still saves what it read", async () => {
    stubFetch(
      true,
      found(
        {
          partial: true,
          failed: ["contracts", "services"],
          commercial: { contracts: null, memberships: [], services: null, partial: true },
        },
        { city: "Solon" },
      ),
    );
    const result = await runMasterSync({ client: base, studios });
    expect(result.status).toBe("partial");
    expect(result.message).toBe("Synced, but contracts and pricing options couldn't be read — try again later.");
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).not.toHaveProperty("mindbodyServices");
  });

  it("stays ok when only the visit count couldn't be read", async () => {
    stubFetch(true, found({ visits: null, failed: ["visits"] }));
    const result = await runMasterSync({ client: base, studios });
    expect(result.status).toBe("ok");
    expect(result.failed).toEqual(["visits"]);
  });

  it("passes the route's error through and writes nothing", async () => {
    stubFetch(false, { error: "MindBody didn't answer the client lookup (HTTP 500): boom" });
    const result = await runMasterSync({ client: base, studios });
    expect(result).toMatchObject({ status: "error", message: "MindBody didn't answer the client lookup (HTTP 500): boom" });
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("says when the network failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await runMasterSync({ client: base, studios });
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/Couldn't reach Mindbody/);
  });

  it("says when the save failed", async () => {
    stubFetch(true, found({}, { city: "Solon" }));
    updateDocMock.mockRejectedValueOnce(new Error("Missing or insufficient permissions."));
    const result = await runMasterSync({ client: base, studios });
    expect(result.status).toBe("error");
    expect(result.message).toBe(
      "Mindbody answered, but Journey couldn't save it (Missing or insufficient permissions.).",
    );
  });

  it("says nothing changed when nothing did", async () => {
    stubFetch(
      true,
      found({ commercial: { contracts: null, memberships: null, services: null, partial: false } }),
    );
    const result = await runMasterSync({
      client: { ...base, mindbodyClientId: "100045", mindbodyId: "100045" },
      studios,
    });
    expect(result.status).toBe("ok");
    expect(result.message).toBe("Up to date with Mindbody — nothing had changed.");
    expect(setDocMock).not.toHaveBeenCalled();
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });
});
