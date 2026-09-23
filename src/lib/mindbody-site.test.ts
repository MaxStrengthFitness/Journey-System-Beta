import { describe, expect, it } from "vitest";
import { otherSiteOf } from "./mindbody-site";

const studios = [
  { id: "solon", mindbodySiteId: "5746957" },
  { id: "strongsville", mindbodySiteId: 29068 },
  { id: "westlake", mindbodySiteId: "29068" },
  { id: "new-studio" },
];

describe("otherSiteOf", () => {
  it("names the other site when the home studio sits on a different one", () => {
    expect(otherSiteOf("solon", "29068", studios)).toBe("5746957");
    expect(otherSiteOf("strongsville", 5746957, studios)).toBe("29068");
  });

  it("a sibling studio on the same site is the same person (a visitor)", () => {
    expect(otherSiteOf("westlake", 29068, studios)).toBeNull();
    expect(otherSiteOf("strongsville", " 29068 ", studios)).toBeNull();
  });

  it("unknown is not wrong: no home, an unknown studio, or no site on either side", () => {
    expect(otherSiteOf(undefined, "29068", studios)).toBeNull();
    expect(otherSiteOf("", "29068", studios)).toBeNull();
    expect(otherSiteOf("gone", "29068", studios)).toBeNull();
    expect(otherSiteOf("new-studio", "29068", studios)).toBeNull();
    expect(otherSiteOf("solon", null, studios)).toBeNull();
    expect(otherSiteOf("solon", "", studios)).toBeNull();
  });
});
