import { describe, expect, it } from "vitest";
import { chooseClientDoc, otherSiteOf, siteOfClient, siteQualifiedClientId } from "./mindbody-site";
import { mindbodyIdConflict, mindbodyIdOf } from "./mindbody-id";

const studios = [
  { id: "solon", mindbodySiteId: "5746957" },
  { id: "strongsville", mindbodySiteId: 29068 },
  { id: "westlake", mindbodySiteId: "29068" },
  { id: "new-studio" },
];

describe("siteOfClient / otherSiteOf", () => {
  it("names the other site when the home studio sits on a different one", () => {
    expect(otherSiteOf({ homeStudioId: "solon" }, "29068", studios)).toBe("5746957");
    expect(otherSiteOf({ homeStudioId: "strongsville" }, 5746957, studios)).toBe("29068");
  });

  it("a sibling studio on the same site is the same person (a visitor)", () => {
    expect(otherSiteOf({ homeStudioId: "westlake" }, 29068, studios)).toBeNull();
    expect(otherSiteOf({ homeStudioId: "strongsville" }, " 29068 ", studios)).toBeNull();
  });

  it("unknown is not wrong: no home, an unknown studio, or no site on either side", () => {
    expect(otherSiteOf({}, "29068", studios)).toBeNull();
    expect(otherSiteOf({ homeStudioId: "" }, "29068", studios)).toBeNull();
    expect(otherSiteOf({ homeStudioId: "gone" }, "29068", studios)).toBeNull();
    expect(otherSiteOf({ homeStudioId: "new-studio" }, "29068", studios)).toBeNull();
    expect(otherSiteOf({ homeStudioId: "solon" }, null, studios)).toBeNull();
    expect(otherSiteOf(null, "29068", studios)).toBeNull();
  });

  it("a record's own mindbodySiteId outranks its home studio", () => {
    // A client who moves home studio does not change which Mindbody account is theirs.
    expect(siteOfClient({ mindbodySiteId: 29068, homeStudioId: "solon" }, studios)).toBe("29068");
  });
});

describe("chooseClientDoc — which record is Mindbody client X on site S", () => {
  const base = { mindbodyClientId: "100000310", site: "29068", studios };

  it("1. the second person's record, once it exists, is always them", () => {
    expect(chooseClientDoc({ ...base, qualifiedExists: true, plain: { homeStudioId: "solon" } })).toEqual({
      docId: "29068-100000310",
      create: false,
    });
  });

  it("2. the plain number on the same site is them; so is a sibling studio's", () => {
    expect(chooseClientDoc({ ...base, qualifiedExists: false, plain: { homeStudioId: "strongsville" } })).toEqual({
      docId: "100000310",
      create: false,
    });
    expect(chooseClientDoc({ ...base, qualifiedExists: false, plain: { homeStudioId: "westlake" } }).docId).toBe(
      "100000310",
    );
  });

  it("2. a plain record with no home to place is adopted, as before", () => {
    expect(chooseClientDoc({ ...base, qualifiedExists: false, plain: {} })).toEqual({
      docId: "100000310",
      create: false,
    });
  });

  it("3. the plain number on the OTHER site is someone else: make theirs", () => {
    expect(chooseClientDoc({ ...base, qualifiedExists: false, plain: { homeStudioId: "solon" } })).toEqual({
      docId: "29068-100000310",
      create: true,
    });
  });

  it("4. nobody holds the number: a new client keeps the plain id", () => {
    expect(chooseClientDoc({ ...base, qualifiedExists: false, plain: null })).toEqual({
      docId: "100000310",
      create: true,
    });
  });

  it("the qualified id is never mistaken for a Mindbody number", () => {
    const id = siteQualifiedClientId(29068, "100000310");
    expect(id).toBe("29068-100000310");
    // The Mindbody id is the field; the doc id is not read as one.
    expect(mindbodyIdOf({ id, mindbodyClientId: "100000310" })).toBe("100000310");
    expect(mindbodyIdOf({ id })).toBeNull();
    expect(mindbodyIdConflict({ id, mindbodyClientId: "100000310" })).toBeNull();
  });
});
