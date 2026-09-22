import { describe, it, expect } from "vitest";
import { coverageOfClient, cutoverOf } from "./client-coverage";

/*
 * The direction of failure is the thing under test.
 *
 * Every case that is not provably complete must come back "partial" or
 * "unknown", because those two produce "Nothing recorded" on screen and
 * "complete" produces "Never attempted". A client who trained here for
 * twelve years reading as "Never attempted" is the bug this module exists
 * to prevent, and it is silent - nobody notices a wrong word.
 */
describe("coverageOfClient", () => {
  it("is unknown with no client at all", () => {
    expect(coverageOfClient(null, "2026-09-01")).toBe("unknown");
    expect(coverageOfClient(undefined, "2026-09-01")).toBe("unknown");
  });

  it("is unknown when nobody has set the studio's cutover day", () => {
    expect(coverageOfClient({ firstSessionDate: "2026-09-10" }, null)).toBe("unknown");
    expect(coverageOfClient({ firstSessionDate: "2026-09-10" })).toBe("unknown");
  });

  it("is partial when a prior record still has sessions Journey cannot see", () => {
    expect(
      coverageOfClient(
        { priorHistory: { sessions: 312, importedCount: 0, through: "2026-08-31", source: "filemaker" } },
        "2026-09-01",
      ),
    ).toBe("partial");
  });

  it("is complete once every prior session has been imported as a real row", () => {
    expect(
      coverageOfClient(
        { priorHistory: { sessions: 312, importedCount: 312, through: "2026-08-31", source: "filemaker" } },
        "2026-09-01",
      ),
    ).toBe("complete");
  });

  it("honours an explicit historyIsComplete", () => {
    expect(coverageOfClient({ historyIsComplete: true }, null)).toBe("complete");
  });

  it("is partial for a client whose first session predates the cutover", () => {
    expect(coverageOfClient({ firstSessionDate: "2026-08-14" }, "2026-09-01")).toBe("partial");
  });

  it("is complete for a client who started after their studio moved over", () => {
    expect(coverageOfClient({ firstSessionDate: "2026-09-01" }, "2026-09-01")).toBe("complete");
    expect(coverageOfClient({ firstSessionDate: "2026-09-12" }, "2026-09-01")).toBe("complete");
  });

  it("is unknown for a client with no first session and no prior record", () => {
    // The booked-but-never-trained case. Nothing is known, so nothing is claimed.
    expect(coverageOfClient({}, "2026-09-01")).toBe("unknown");
  });
});

describe("cutoverOf", () => {
  const studios = [
    { id: "westlake", journeyCutoverDate: "2026-09-01" },
    { id: "solon" },
  ];

  it("finds the active studio's day", () => {
    expect(cutoverOf(studios, "westlake")).toBe("2026-09-01");
  });

  it("is null for a studio that has not set one", () => {
    expect(cutoverOf(studios, "solon")).toBeNull();
  });

  it("never falls back to another studio's day", () => {
    // The rollout is staggered. Borrowing Westlake's date would tell Solon's
    // trainers their clients are fully recorded when they are not.
    expect(cutoverOf(studios, "strongsville")).toBeNull();
    expect(cutoverOf(studios, null)).toBeNull();
    expect(cutoverOf(null, "westlake")).toBeNull();
  });
});
