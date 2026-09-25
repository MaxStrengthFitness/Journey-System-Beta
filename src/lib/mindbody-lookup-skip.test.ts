import { describe, it, expect } from "vitest";
import { idsToLookUp, MAX_SKIP_IDS, parseSkipIds, skipForOwnBookings } from "./mindbody-lookup-skip";

describe("parseSkipIds", () => {
  it("keeps plain string and number ids, trimmed", () => {
    expect([...parseSkipIds(["100000001", 100000002, " 100000003 "])]).toEqual([
      "100000001",
      "100000002",
      "100000003",
    ]);
  });

  it("ignores anything that is not a list", () => {
    expect(parseSkipIds(undefined).size).toBe(0);
    expect(parseSkipIds("100000001").size).toBe(0);
    expect(parseSkipIds({ 0: "100000001" }).size).toBe(0);
  });

  it("drops entries that are not plain ids, so they are looked up as before", () => {
    const skip = parseSkipIds(["100000001", "", "a b", "../x", { id: 1 }, null, "x".repeat(65)]);
    expect([...skip]).toEqual(["100000001"]);
  });

  it("stops at the ceiling", () => {
    const many = Array.from({ length: MAX_SKIP_IDS + 50 }, (_, i) => String(100000000 + i));
    expect(parseSkipIds(many).size).toBe(MAX_SKIP_IDS);
  });
});

describe("idsToLookUp", () => {
  it("leaves out only the skipped ids, keeping order", () => {
    const skip = parseSkipIds(["2", "4"]);
    expect(idsToLookUp(["1", "2", "3", "4", "5"], skip)).toEqual(["1", "3", "5"]);
  });

  it("looks everyone up when nothing is skipped", () => {
    const ids = ["1", "2"];
    expect(idsToLookUp(ids, new Set())).toBe(ids);
  });
});

describe("skipForOwnBookings", () => {
  const skip = parseSkipIds(["a", "b", "c"]);

  it("keeps looking up a client with a booking at another location", () => {
    const out = skipForOwnBookings(
      skip,
      [
        { clientId: "a", location: "1" },
        { clientId: "b", location: "6" }, // a location no studio claims yet
        { clientId: "c", location: "" }, // no location at all
      ],
      "1",
    );
    expect([...out]).toEqual(["a"]);
  });

  it("applies the list as sent when the studio has no own location", () => {
    expect(skipForOwnBookings(skip, [{ clientId: "b", location: "6" }], null)).toBe(skip);
  });
});
