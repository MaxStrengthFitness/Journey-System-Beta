import { describe, expect, it } from "vitest";
import { MINE_RULE, coachedByMeLately, isMine, mineDefinition, myLabel } from "./mine";

describe("one Mine everywhere", () => {
  const coached = { renewal: { coachIds: ["t-ana", "t-bo"] } };

  it("is booked with you", () => {
    expect(isMine({}, ["t-me"], { bookedWithMe: true })).toBe(true);
    expect(isMine(null, ["t-me"], { bookedWithMe: true })).toBe(true);
  });

  it("is coached by you in the last 60 days, under any of your ids", () => {
    expect(isMine(coached, ["t-old-id", "t-bo"])).toBe(true);
    expect(coachedByMeLately(coached, new Set(["t-ana"]))).toBe(true);
  });

  it("is nobody else's client, and never off an empty id or a missing record", () => {
    expect(isMine(coached, ["t-me"])).toBe(false);
    expect(isMine(coached, [""])).toBe(false);
    expect(isMine({}, ["t-ana"])).toBe(false);
    expect(isMine({ renewal: { coachIds: "t-ana" } }, ["t-ana"])).toBe(false);
    expect(isMine(undefined, ["t-ana"], { bookedWithMe: false })).toBe(false);
  });

  it("says the rule the same way on every screen, as My {thing}", () => {
    expect(MINE_RULE).toBe("booked with you, or coached by you in the last 60 days");
    expect(mineDefinition()).toBe("My clients: booked with you, or coached by you in the last 60 days.");
    expect(myLabel("day")).toBe("My day");
  });
});
