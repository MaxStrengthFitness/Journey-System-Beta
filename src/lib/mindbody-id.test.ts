import { describe, expect, it } from "vitest";
import { mindbodyIdOf } from "./mindbody-id";
import { mindbodyIdOf as fromJobPlan } from "../features/renewals/job-plan";

describe("mindbodyIdOf", () => {
  it("prefers the webhook's field, then the app's older one", () => {
    expect(mindbodyIdOf({ id: "abc", mindbodyClientId: "100045", mindbodyId: "999" })).toBe("100045");
    expect(mindbodyIdOf({ id: "abc", mindbodyId: "100046" })).toBe("100046");
  });

  it("finds the id on a webhook-created client that has only mindbodyClientId", () => {
    // The screen that read only `mindbodyId` showed these clients blank.
    expect(mindbodyIdOf({ id: "100047", mindbodyClientId: "100047" })).toBe("100047");
  });

  it("accepts a number and trims whitespace", () => {
    expect(mindbodyIdOf({ mindbodyClientId: 100048 })).toBe("100048");
    expect(mindbodyIdOf({ mindbodyId: "  100049 " })).toBe("100049");
  });

  it("falls back to a numeric document id only", () => {
    expect(mindbodyIdOf({ id: "100050" })).toBe("100050");
    expect(mindbodyIdOf({ id: "Xk3pQ9aB2cD4eF6gH8iJ" })).toBeNull();
    expect(mindbodyIdOf({ id: "" })).toBeNull();
  });

  it("accepts Mindbody's alphanumeric ids but refuses anything that isn't a plain id", () => {
    expect(mindbodyIdOf({ mindbodyClientId: "A-77" })).toBe("A-77");
    expect(mindbodyIdOf({ mindbodyClientId: "12/../34" })).toBeNull();
    expect(mindbodyIdOf({ mindbodyClientId: "Jane Smith" })).toBeNull();
  });

  it("has no id for a temporary or merged-away profile", () => {
    expect(mindbodyIdOf({ id: "100051", provisional: true })).toBeNull();
    expect(mindbodyIdOf({ mindbodyClientId: "100052", supersededById: "x" })).toBeNull();
    expect(mindbodyIdOf({ mindbodyClientId: "100053", migratedTo: "y" })).toBeNull();
  });

  it("tolerates a missing client", () => {
    expect(mindbodyIdOf(null)).toBeNull();
    expect(mindbodyIdOf(undefined)).toBeNull();
  });

  it("is the same function the nightly job uses", () => {
    expect(fromJobPlan).toBe(mindbodyIdOf);
  });
});
