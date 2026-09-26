import { describe, it, expect } from "vitest";
import { coverageOfClient, cutoverOf, homeCutoverOf } from "./client-coverage";
import { NEW_CLIENT_MAX_VISITS } from "./prior-history";

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

  it("is unknown for a never-synced client who started after their studio moved over (the cost plan, A6)", () => {
    // Launch day: a long-time client nobody has synced yet has her first
    // Journey session. The date alone used to call her complete - "New", "#1".
    expect(coverageOfClient({ firstSessionDate: "2026-09-01" }, "2026-09-01")).toBe("unknown");
    expect(coverageOfClient({ firstSessionDate: "2026-09-12" }, "2026-09-01")).toBe("unknown");
  });

  it("is complete for a client who started after their studio moved over once her sync says she is new", () => {
    expect(
      coverageOfClient({ firstSessionDate: "2026-09-12", clientsNumberOfVisitsAtSite: 1 }, "2026-09-01"),
    ).toBe("complete");
  });

  it("is unknown for a client with no first session and no prior record", () => {
    // The booked-but-never-trained case. Nothing is known, so nothing is claimed.
    expect(coverageOfClient({}, "2026-09-01")).toBe("unknown");
  });
});

/*
 * Mindbody's own visit count, which arrives with a Master Sync and on the
 * webhook's client.updated (not on the schedule pull - the Sep 22 sync plan).
 */
describe("coverageOfClient and Mindbody's visit count", () => {
  it("treats five visits or fewer as genuinely new", () => {
    // A consultation and an intro session already put a new client at two.
    // AJ raised the line to five on Sep 22, when the number went back on the
    // Hub card: it is the same constant the card uses to say "New", so the
    // card and the gate cannot disagree about who is new.
    expect(coverageOfClient({ clientsNumberOfVisitsAtSite: 0 }, null)).toBe("complete");
    expect(coverageOfClient({ clientsNumberOfVisitsAtSite: NEW_CLIENT_MAX_VISITS }, null)).toBe("complete");
  });

  it("treats anything above that as a story Journey cannot hold", () => {
    expect(coverageOfClient({ clientsNumberOfVisitsAtSite: NEW_CLIENT_MAX_VISITS + 1 }, null)).toBe("partial");
    expect(coverageOfClient({ clientsNumberOfVisitsAtSite: 412 }, null)).toBe("partial");
  });

  it("beats the cutover date in the direction the cutover gets wrong", () => {
    // Her first Journey session is the week AFTER the studio moved over, so
    // the date rule called her complete - and she has 412 visits behind her.
    // This is the case the whole round exists for.
    expect(
      coverageOfClient({ firstSessionDate: "2026-09-08", clientsNumberOfVisitsAtSite: 412 }, "2026-09-01"),
    ).toBe("partial");
  });

  it("still defers to the cutover when it says she predates Journey", () => {
    // The date rule IS reliable in that direction, and a low count at this
    // site can just mean she cross-trains from the other one.
    expect(
      coverageOfClient({ firstSessionDate: "2026-08-14", clientsNumberOfVisitsAtSite: 2 }, "2026-09-01"),
    ).toBe("partial");
  });

  it("still defers to a total a person wrote down", () => {
    const stated = {
      priorHistory: { sessions: 312, importedCount: 312, through: "2026-08-31", source: "filemaker" },
      clientsNumberOfVisitsAtSite: 400,
    };
    expect(coverageOfClient(stated, null)).toBe("complete");
  });

  it("ignores a count Mindbody did not really give", () => {
    expect(coverageOfClient({ clientsNumberOfVisitsAtSite: -1 as number }, null)).toBe("unknown");
    expect(coverageOfClient({ clientsNumberOfVisitsAtSite: 4.5 }, null)).toBe("unknown");
    expect(coverageOfClient({ clientsNumberOfVisitsAtSite: undefined }, null)).toBe("unknown");
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

describe("homeCutoverOf", () => {
  const studios = [
    { id: "westlake", journeyCutoverDate: "2026-09-01" },
    { id: "strongsville", journeyCutoverDate: "2027-01-10" },
  ];

  it("reads the client's HOME studio, whichever iPad is open", () => {
    // A Strongsville client on a Westlake iPad is judged by Strongsville's day.
    expect(homeCutoverOf(studios, { homeStudioId: "strongsville" })).toBe("2027-01-10");
  });

  it("falls back to the older studioId the way the rules do", () => {
    expect(homeCutoverOf(studios, { studioId: "westlake" })).toBe("2026-09-01");
    expect(homeCutoverOf(studios, { homeStudioId: "", studioId: "westlake" })).toBe("2026-09-01");
  });

  it("is null - unknown - with no home, no studios or no client", () => {
    expect(homeCutoverOf(studios, {})).toBeNull();
    expect(homeCutoverOf(studios, null)).toBeNull();
    expect(homeCutoverOf(undefined, { homeStudioId: "westlake" })).toBeNull();
  });
});
