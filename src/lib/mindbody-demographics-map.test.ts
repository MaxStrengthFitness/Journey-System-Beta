import { describe, expect, it } from "vitest";
import {
  demographicsFromApi,
  joinAddress,
  pickRequestedClient,
  visitsTotalFrom,
} from "./mindbody-demographics-map";

/** A Public API v6 `Client`, trimmed to what Master Sync reads. */
const apiClient = {
  Id: "100045",
  UniqueId: 77045,
  FirstName: " Jane ",
  LastName: "Doe",
  Email: "jane@example.com",
  MobilePhone: null,
  HomePhone: "2165550100",
  WorkPhone: "2165550199",
  BirthDate: "1970-05-12T00:00:00",
  Gender: "Female",
  AddressLine1: "12 Main St",
  AddressLine2: "Apt 4",
  City: "Solon",
  State: "OH",
  PostalCode: "44139",
  Country: "US",
  Status: "Active",
  Active: true,
  IsProspect: false,
  CreationDate: "2014-03-02T09:15:00",
  FirstAppointmentDate: "2014-03-05T10:00:00",
  Liability: { IsReleased: true, AgreementDate: "2014-03-02T09:20:00", ReleasedBy: null },
  LiabilityRelease: true,
  EmergencyContactInfoName: "John Doe",
  EmergencyContactInfoPhone: "2165550111",
  EmergencyContactInfoRelationship: "Spouse",
  PhotoUrl: "https://clients.mindbodyonline.com/photo.jpg",
  Notes: "Prefers mornings",
  HomeLocation: { Id: 1, Name: "Solon" },
};

describe("demographicsFromApi", () => {
  it("reads every field Master Sync needs", () => {
    const d = demographicsFromApi(apiClient);
    expect(d).toEqual({
      mindbodyClientId: "100045",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "2165550100",
      dateOfBirth: "1970-05-12",
      gender: "Female",
      addressLine1: "12 Main St",
      addressLine2: "Apt 4",
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
      emergencyContactName: "John Doe",
      emergencyContactPhone: "2165550111",
      emergencyContactRelationship: "Spouse",
      photoUrl: "https://clients.mindbodyonline.com/photo.jpg",
      notes: "Prefers mornings",
      homeLocationId: 1,
    });
  });

  it("reads zoneless Mindbody dates as UTC, whatever the machine's zone", () => {
    const d = demographicsFromApi({ ...apiClient, CreationDate: "2014-03-02T00:00:00" });
    expect(d.createdAt).toBe("2014-03-02T00:00:00.000Z");
    // A date that already carries a zone is kept as that instant.
    expect(demographicsFromApi({ ...apiClient, CreationDate: "2014-03-02T00:00:00-05:00" }).createdAt).toBe(
      "2014-03-02T05:00:00.000Z",
    );
  });

  it("turns empties, placeholders and junk into null — never a blank", () => {
    const d = demographicsFromApi({
      Id: 100046,
      FirstName: "",
      LastName: "   ",
      Email: "",
      MobilePhone: "",
      HomePhone: null,
      BirthDate: "0001-01-01T00:00:00",
      Gender: "None",
      City: "",
      Notes: "",
      PhotoUrl: "http://insecure.example/photo.jpg",
      CreationDate: "0001-01-01T00:00:00",
      FirstAppointmentDate: null,
      Status: "",
      Active: "yes",
    });
    expect(d.mindbodyClientId).toBe("100046");
    for (const key of [
      "firstName",
      "lastName",
      "email",
      "phone",
      "dateOfBirth",
      "gender",
      "city",
      "notes",
      "photoUrl",
      "createdAt",
      "firstAppointmentDate",
      "status",
      "active",
      "isProspect",
      "liability",
      "homeLocationId",
    ] as const) {
      expect(d[key], key).toBeNull();
    }
  });

  it("tolerates a missing or non-object client", () => {
    expect(demographicsFromApi(undefined).mindbodyClientId).toBe("");
    expect(demographicsFromApi(null).liability).toBeNull();
  });

  it("refuses a name the rules would refuse (50 characters or more)", () => {
    const d = demographicsFromApi({ ...apiClient, FirstName: "x".repeat(50), LastName: "y".repeat(49) });
    expect(d.firstName).toBeNull();
    expect(d.lastName).toBe("y".repeat(49));
  });

  it("clips Mindbody's account notes to 1,000 characters", () => {
    expect(demographicsFromApi({ ...apiClient, Notes: "n".repeat(1500) }).notes).toHaveLength(1000);
  });

  describe("the waiver", () => {
    it("is released with its agreement date", () => {
      expect(demographicsFromApi(apiClient).liability).toEqual({
        isReleased: true,
        agreementDate: "2014-03-02T09:20:00.000Z",
      });
    });

    it("is not released — and a stray date is dropped", () => {
      const d = demographicsFromApi({
        ...apiClient,
        Liability: { IsReleased: false, AgreementDate: "2014-03-02T09:20:00" },
        LiabilityRelease: false,
      });
      expect(d.liability).toEqual({ isReleased: false, agreementDate: null });
    });

    it("falls back to the older LiabilityRelease boolean", () => {
      const { Liability: _ignored, ...rest } = apiClient;
      expect(demographicsFromApi({ ...rest, LiabilityRelease: true }).liability).toEqual({
        isReleased: true,
        agreementDate: null,
      });
    });

    it("is unknown (null) when Mindbody sent nothing about it", () => {
      const { Liability: _a, LiabilityRelease: _b, ...rest } = apiClient;
      expect(demographicsFromApi(rest).liability).toBeNull();
      expect(demographicsFromApi({ ...rest, Liability: {} }).liability).toBeNull();
      expect(demographicsFromApi({ ...rest, Liability: null }).liability).toBeNull();
    });
  });

  it("uses the first phone Mindbody has: mobile, home, then work", () => {
    expect(demographicsFromApi({ MobilePhone: "1", HomePhone: "2" }).phone).toBe("1");
    expect(demographicsFromApi({ MobilePhone: "", HomePhone: "", WorkPhone: "3" }).phone).toBe("3");
  });

  it("reads a home location id given as a string", () => {
    expect(demographicsFromApi({ HomeLocation: { Id: " 4 " } }).homeLocationId).toBe("4");
    expect(demographicsFromApi({ HomeLocation: null }).homeLocationId).toBeNull();
  });
});

describe("joinAddress", () => {
  it("joins the two lines, skipping a repeat or a blank", () => {
    expect(joinAddress("12 Main St", "Apt 4")).toBe("12 Main St, Apt 4");
    expect(joinAddress("12 Main St Apt 4", "apt 4")).toBe("12 Main St Apt 4");
    expect(joinAddress("12 Main St", null)).toBe("12 Main St");
    expect(joinAddress(null, "Apt 4")).toBe("Apt 4");
    expect(joinAddress("", "  ")).toBeNull();
  });
});

describe("pickRequestedClient", () => {
  it("takes only the record whose id is the one asked for", () => {
    const other = { Id: "100099", FirstName: "Jane" };
    expect(pickRequestedClient([other, apiClient], "100045")).toBe(apiClient);
    expect(pickRequestedClient([{ Id: 100045 }], " 100045 ")).toEqual({ Id: 100045 });
  });

  it("never falls back to the first result or a name", () => {
    expect(pickRequestedClient([{ Id: "100099", FirstName: "Jane", LastName: "Doe" }], "100045")).toBeNull();
    expect(pickRequestedClient([{ FirstName: "Jane" }], "100045")).toBeNull();
    expect(pickRequestedClient([], "100045")).toBeNull();
    expect(pickRequestedClient(undefined, "100045")).toBeNull();
    expect(pickRequestedClient([apiClient], "")).toBeNull();
  });
});

describe("visitsTotalFrom", () => {
  it("reads the pagination total", () => {
    expect(visitsTotalFrom({ PaginationResponse: { TotalResults: 412 }, Visits: [{}] })).toBe(412);
    expect(visitsTotalFrom({ PaginationResponse: { TotalResults: 0 }, Visits: [] })).toBe(0);
  });

  it("is unknown when the answer has no usable total", () => {
    expect(visitsTotalFrom({ Visits: [] })).toBeNull();
    expect(visitsTotalFrom({ PaginationResponse: { TotalResults: "412" } })).toBeNull();
    expect(visitsTotalFrom({ PaginationResponse: { TotalResults: -1 } })).toBeNull();
    expect(visitsTotalFrom(null)).toBeNull();
  });
});
