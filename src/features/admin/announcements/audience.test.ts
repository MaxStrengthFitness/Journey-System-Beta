import { describe, expect, it } from "vitest";
import type { HubAnnouncement, Trainer } from "../../../types";
import {
  EMPTY_DRAFT,
  SHORT_CONTENT_MAX,
  announcementBody,
  audienceLabel,
  expiryFor,
  isTargeted,
  millis,
  resolveAudience,
  trainerStudioIds,
  unreadFor,
  validateDraft,
  visibleAnnouncements,
  type AnnouncementDraft,
  type NetworkOption,
} from "./audience";

const NETWORKS: NetworkOption[] = [
  { id: "net-ohio", name: "Ohio", studioIds: ["s1", "s2", "s3"] },
  { id: "net-tx", name: "Texas", studioIds: ["s9"] },
  { id: "net-empty", name: "Nevada", studioIds: [] },
];

const STUDIOS = [
  { id: "s1", name: "Powell" },
  { id: "s2", name: "Dublin" },
  { id: "s3", name: "Hilliard" },
  { id: "s9", name: "Austin" },
];

function trainer(over: Partial<Trainer> = {}): Trainer {
  return {
    id: "t1",
    fullName: "Sam Reed",
    initials: "SR",
    role: "Trainer",
    primaryHomeStudioId: "s1",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    ...over,
  } as Trainer;
}

function draft(over: Partial<AnnouncementDraft> = {}): AnnouncementDraft {
  return { ...EMPTY_DRAFT, title: "Heads up", shortContent: "Read me", ...over };
}

describe("validateDraft", () => {
  it("accepts a filled-in universal notice", () => {
    expect(validateDraft(draft())).toEqual([]);
  });

  it("links a studio's own page only in an announcement to that one studio", () => {
    const link = { kind: "studio-page" as const, id: "p1", studioId: "s1", title: "Front desk" };
    const problem = "A studio's own page can only be linked in an announcement to that one studio.";
    expect(validateDraft(draft({ learningLink: link }))).toContain(problem);
    expect(validateDraft(draft({ scope: "studio", studioId: "s2", learningLink: link }))).toContain(problem);
    expect(validateDraft(draft({ scope: "studio", studioId: "s1", learningLink: link }))).toEqual([]);
    // Anything else in Learning can go to anyone.
    expect(validateDraft(draft({ learningLink: { kind: "machine", id: "m-leg-press" } }))).toEqual([]);
  });

  it("requires a headline that is not just whitespace", () => {
    expect(validateDraft(draft({ title: "   " }))).toContain(
      "A headline is required.",
    );
  });

  it("requires the short update, because that is what Alerts shows", () => {
    const problems = validateDraft(draft({ shortContent: "" }));
    expect(problems.some((p) => p.includes("short update is required"))).toBe(
      true,
    );
  });

  it("reports the actual length when the short update is too long", () => {
    const problems = validateDraft(
      draft({ shortContent: "x".repeat(SHORT_CONTENT_MAX + 5) }),
    );
    expect(problems[0]).toContain(String(SHORT_CONTENT_MAX + 5));
    expect(problems[0]).toContain(String(SHORT_CONTENT_MAX));
  });

  it("will not publish a studio notice with no studio picked", () => {
    expect(validateDraft(draft({ scope: "studio" }))).toContain(
      "Pick which studio this goes to.",
    );
  });

  it("will not publish a network notice with no network picked", () => {
    expect(validateDraft(draft({ scope: "network" }))).toContain(
      "Pick which network this goes to.",
    );
  });

  it("passes a fully specified studio notice", () => {
    expect(validateDraft(draft({ scope: "studio", studioId: "s2" }))).toEqual(
      [],
    );
  });
});

describe("resolveAudience", () => {
  it("marks universal with the legacy all sentinel and no studio list", () => {
    expect(resolveAudience(draft(), NETWORKS)).toEqual({
      targetScope: "universal",
      targetId: "",
      studioId: "all",
      targetStudioIds: [],
    });
  });

  it("puts a single studio in both the legacy field and the list", () => {
    expect(resolveAudience(draft({ scope: "studio", studioId: "s2" }), NETWORKS))
      .toEqual({
        targetScope: "studio",
        targetId: "s2",
        studioId: "s2",
        targetStudioIds: ["s2"],
      });
  });

  it("expands a network into its studios", () => {
    expect(
      resolveAudience(draft({ scope: "network", networkId: "net-ohio" }), NETWORKS),
    ).toEqual({
      targetScope: "network",
      targetId: "net-ohio",
      studioId: "",
      targetStudioIds: ["s1", "s2", "s3"],
    });
  });

  it("NEVER writes the all sentinel for a network - this is the leak", () => {
    const fields = resolveAudience(
      draft({ scope: "network", networkId: "net-ohio" }),
      NETWORKS,
    );
    expect(fields.studioId).not.toBe("all");
  });

  it("resolves an unknown network to nobody rather than to everybody", () => {
    const fields = resolveAudience(
      draft({ scope: "network", networkId: "net-gone" }),
      NETWORKS,
    );
    expect(fields.targetStudioIds).toEqual([]);
    expect(fields.studioId).toBe("");
  });

  it("de-duplicates a network whose studio list repeats an id", () => {
    const dupes: NetworkOption[] = [
      { id: "n", name: "N", studioIds: ["s1", "s1", "s2"] },
    ];
    expect(
      resolveAudience(draft({ scope: "network", networkId: "n" }), dupes)
        .targetStudioIds,
    ).toEqual(["s1", "s2"]);
  });
});

describe("expiryFor", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");

  it("adds a day", () => {
    expect(expiryFor("24h", now).toISOString()).toBe("2026-03-11T12:00:00.000Z");
  });

  it("adds a week", () => {
    expect(expiryFor("1w", now).toISOString()).toBe("2026-03-17T12:00:00.000Z");
  });

  it("adds a month", () => {
    expect(expiryFor("1m", now).toISOString()).toBe("2026-04-10T12:00:00.000Z");
  });

  it("does not mutate the date it was handed", () => {
    const copy = new Date(now.getTime());
    expiryFor("1m", copy);
    expect(copy.toISOString()).toBe(now.toISOString());
  });
});

describe("announcementBody", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");
  const author = { id: "admin-1", fullName: "Austin J" };

  it("trims the text so a stray space does not change the record", () => {
    const body = announcementBody(
      draft({ title: "  Q3 rollout  ", shortContent: " ticker ", longContent: " body " }),
      author,
      NETWORKS,
      "24h",
      now,
    );
    expect(body.title).toBe("Q3 rollout");
    expect(body.shortContent).toBe("ticker");
    expect(body.longContent).toBe("body");
  });

  it("stamps the author and starts the read list empty", () => {
    const body = announcementBody(draft(), author, NETWORKS, "24h", now);
    expect(body.authorId).toBe("admin-1");
    expect(body.authorName).toBe("Austin J");
    expect(body.readBy).toEqual([]);
    expect(body.isActive).toBe(true);
  });

  it("carries a Learning link only when there is one", () => {
    const withLink = announcementBody(
      draft({ learningLink: { kind: "machine", id: "m-leg-press", title: "Leg Press" } }),
      author,
      NETWORKS,
      "24h",
      now,
    );
    expect(withLink.learningLink).toEqual({ kind: "machine", id: "m-leg-press", title: "Leg Press" });
    const without = announcementBody(draft({ learningLink: null }), author, NETWORKS, "24h", now);
    expect("learningLink" in without).toBe(false);
  });

  it("carries the resolved audience into the document", () => {
    const body = announcementBody(
      draft({ scope: "network", networkId: "net-tx" }),
      author,
      NETWORKS,
      "1w",
      now,
    );
    expect(body.targetScope).toBe("network");
    expect(body.targetStudioIds).toEqual(["s9"]);
    expect(body.expiresAt.toISOString()).toBe("2026-03-17T12:00:00.000Z");
  });
});

describe("millis", () => {
  it("reads a Firestore Timestamp", () => {
    expect(millis({ toMillis: () => 1234 })).toBe(1234);
  });

  it("reads a Timestamp that only offers toDate", () => {
    expect(millis({ toDate: () => new Date(5000) })).toBe(5000);
  });

  it("reads a plain Date", () => {
    expect(millis(new Date(77))).toBe(77);
  });

  it("reads a raw number", () => {
    expect(millis(99)).toBe(99);
  });

  it("treats missing as zero, which callers read as no expiry", () => {
    expect(millis(undefined)).toBe(0);
    expect(millis(null)).toBe(0);
  });
});

describe("trainerStudioIds", () => {
  it("gathers home, accessible, guest and owned", () => {
    expect(
      trainerStudioIds(
        trainer({
          primaryHomeStudioId: "s1",
          accessibleStudioIds: ["s2"],
          activeGuestStudioIds: ["s3"],
          ownedStudioIds: ["s9"],
        }),
      ),
    ).toEqual(["s1", "s2", "s3", "s9"]);
  });

  it("drops empties rather than matching an announcement with a blank id", () => {
    expect(
      trainerStudioIds(
        trainer({ primaryHomeStudioId: "", accessibleStudioIds: ["s2"] }),
      ),
    ).toEqual(["s2"]);
  });
});

describe("isTargeted", () => {
  it("universal reaches everyone", () => {
    expect(
      isTargeted(
        { targetScope: "universal", studioId: "all" } as HubAnnouncement,
        trainer({ primaryHomeStudioId: "s-elsewhere" }),
      ),
    ).toBe(true);
  });

  it("studio scope reaches a trainer at that studio", () => {
    expect(
      isTargeted(
        {
          targetScope: "studio",
          studioId: "s2",
          targetId: "s2",
          targetStudioIds: ["s2"],
        } as never,
        trainer({ primaryHomeStudioId: "s2" }),
      ),
    ).toBe(true);
  });

  it("studio scope reaches a trainer with guest access there", () => {
    expect(
      isTargeted(
        { targetScope: "studio", studioId: "s3", targetStudioIds: ["s3"] } as never,
        trainer({ primaryHomeStudioId: "s1", activeGuestStudioIds: ["s3"] }),
      ),
    ).toBe(true);
  });

  it("studio scope misses a trainer somewhere else", () => {
    expect(
      isTargeted(
        { targetScope: "studio", studioId: "s2", targetStudioIds: ["s2"] } as never,
        trainer({ primaryHomeStudioId: "s1" }),
      ),
    ).toBe(false);
  });

  it("a network notice reaches a trainer inside the network", () => {
    expect(
      isTargeted(
        {
          targetScope: "network",
          targetId: "net-ohio",
          studioId: "",
          targetStudioIds: ["s1", "s2", "s3"],
        } as never,
        trainer({ primaryHomeStudioId: "s2" }),
      ),
    ).toBe(true);
  });

  it("a network notice does NOT reach a trainer in another network", () => {
    expect(
      isTargeted(
        {
          targetScope: "network",
          targetId: "net-ohio",
          studioId: "",
          targetStudioIds: ["s1", "s2", "s3"],
        } as never,
        trainer({ primaryHomeStudioId: "s9" }),
      ),
    ).toBe(false);
  });

  it("a network notice does not reach an OWNER of another network", () => {
    expect(
      isTargeted(
        {
          targetScope: "network",
          targetId: "net-ohio",
          studioId: "",
          targetStudioIds: ["s1"],
        } as never,
        trainer({
          role: "FranchiseOwner",
          primaryHomeStudioId: "s9",
          ownedStudioIds: ["s9"],
        }),
      ),
    ).toBe(false);
  });

  it("REGRESSION: an old network notice with studioId all is no longer universal", () => {
    // Exactly what FranchiseDashboardView wrote before this round.
    const legacyNetwork = {
      targetScope: "network",
      targetId: "all_owned",
      studioId: "all",
    } as never;
    expect(isTargeted(legacyNetwork, trainer({ role: "Trainer" }))).toBe(false);
  });

  it("an old network notice still reaches owners, which is the narrowing", () => {
    const legacyNetwork = {
      targetScope: "network",
      targetId: "all_owned",
      studioId: "all",
    } as never;
    expect(isTargeted(legacyNetwork, trainer({ role: "FranchiseOwner" }))).toBe(
      true,
    );
  });

  it("a pre-scope document keyed on studioId all still reaches everyone", () => {
    expect(
      isTargeted({ studioId: "all" } as HubAnnouncement, trainer()),
    ).toBe(true);
  });

  it("a pre-scope document keyed on one studio still reaches that studio", () => {
    expect(isTargeted({ studioId: "s1" } as HubAnnouncement, trainer())).toBe(
      true,
    );
    expect(
      isTargeted(
        { studioId: "s1" } as HubAnnouncement,
        trainer({ primaryHomeStudioId: "s2" }),
      ),
    ).toBe(false);
  });

  it("a studio notice for a studio that was deleted reaches nobody", () => {
    expect(
      isTargeted(
        { targetScope: "studio", studioId: "", targetStudioIds: [] } as never,
        trainer(),
      ),
    ).toBe(false);
  });
});

describe("visibleAnnouncements", () => {
  const NOW = 1_000_000;
  const base = { targetScope: "universal" as const, studioId: "all" };

  it("returns nothing when nobody is signed in", () => {
    expect(visibleAnnouncements([{ ...base }], null, NOW)).toEqual([]);
  });

  it("drops archived notices", () => {
    expect(
      visibleAnnouncements([{ ...base, isActive: false }], trainer(), NOW),
    ).toEqual([]);
  });

  it("drops expired notices", () => {
    expect(
      visibleAnnouncements([{ ...base, expiresAt: NOW - 1 }], trainer(), NOW),
    ).toEqual([]);
  });

  it("keeps a notice expiring exactly now", () => {
    expect(
      visibleAnnouncements([{ ...base, expiresAt: NOW }], trainer(), NOW),
    ).toHaveLength(1);
  });

  it("keeps a notice with no expiry at all", () => {
    expect(visibleAnnouncements([{ ...base }], trainer(), NOW)).toHaveLength(1);
  });

  it("sorts newest first", () => {
    const out = visibleAnnouncements(
      [
        { ...base, title: "old", createdAt: 10 },
        { ...base, title: "new", createdAt: 90 },
        { ...base, title: "mid", createdAt: 50 },
      ],
      trainer(),
      NOW,
    );
    expect(out.map((a) => a.title)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("applies scope, so an out-of-network notice never appears", () => {
    expect(
      visibleAnnouncements(
        [
          {
            targetScope: "network" as const,
            targetId: "net-ohio",
            studioId: "",
            targetStudioIds: ["s1"],
          },
        ],
        trainer({ primaryHomeStudioId: "s9" }),
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("unreadFor", () => {
  it("is empty when there is no trainer id to compare", () => {
    expect(unreadFor([{ readBy: [] }], undefined)).toEqual([]);
  });

  it("keeps the ones this trainer is not stamped on", () => {
    const out = unreadFor(
      [{ id: "a", readBy: ["t1"] }, { id: "b", readBy: [] }, { id: "c" }],
      "t1",
    );
    expect(out.map((a) => a.id)).toEqual(["b", "c"]);
  });

  it("counts either id for an account whose profile id is not its sign-in id", () => {
    const out = unreadFor(
      [
        { id: "old", readBy: ["profile-1"] },
        { id: "new", readBy: ["uid-1"] },
        { id: "unread", readBy: ["someone-else"] },
      ],
      ["uid-1", "profile-1"],
    );
    expect(out.map((a) => a.id)).toEqual(["unread"]);
  });

  it("ignores missing ids in the list", () => {
    expect(unreadFor([{ id: "a", readBy: [] }], [undefined, null, ""])).toEqual([]);
  });
});

describe("audienceLabel", () => {
  it("names everyone", () => {
    expect(
      audienceLabel(
        { targetScope: "universal", studioId: "all" } as HubAnnouncement,
        STUDIOS,
        NETWORKS,
      ),
    ).toBe("Everyone");
  });

  it("names the studio", () => {
    expect(
      audienceLabel(
        { targetScope: "studio", studioId: "s2", targetId: "s2" } as HubAnnouncement,
        STUDIOS,
        NETWORKS,
      ),
    ).toBe("Dublin");
  });

  it("counts the studios a network notice actually reached", () => {
    expect(
      audienceLabel(
        {
          targetScope: "network",
          targetId: "net-ohio",
          studioId: "",
          targetStudioIds: ["s1", "s2", "s3"],
        } as never,
        STUDIOS,
        NETWORKS,
      ),
    ).toBe("Ohio - 3 studios");
  });

  it("says one studio in the singular", () => {
    expect(
      audienceLabel(
        {
          targetScope: "network",
          targetId: "net-tx",
          studioId: "",
          targetStudioIds: ["s9"],
        } as never,
        STUDIOS,
        NETWORKS,
      ),
    ).toBe("Texas - 1 studio");
  });

  it("shows an empty network as reaching nobody, not as an error", () => {
    expect(
      audienceLabel(
        {
          targetScope: "network",
          targetId: "net-empty",
          studioId: "",
          targetStudioIds: [],
        } as never,
        STUDIOS,
        NETWORKS,
      ),
    ).toBe("Nevada - no studios");
  });

  it("marks a legacy network notice as owners only", () => {
    expect(
      audienceLabel(
        {
          targetScope: "network",
          targetId: "net-ohio",
          studioId: "all",
        } as never,
        STUDIOS,
        NETWORKS,
      ),
    ).toBe("Ohio - owners only (published before scoping)");
  });

  it("does not pretend a deleted studio still has a name", () => {
    expect(
      audienceLabel(
        { targetScope: "studio", studioId: "gone", targetId: "gone" } as never,
        STUDIOS,
        NETWORKS,
      ),
    ).toBe("a studio no longer listed");
  });

  it("labels a pre-scope document from its legacy field", () => {
    expect(
      audienceLabel({ studioId: "all" } as HubAnnouncement, STUDIOS, NETWORKS),
    ).toBe("Everyone");
    expect(
      audienceLabel({ studioId: "s9" } as HubAnnouncement, STUDIOS, NETWORKS),
    ).toBe("Austin");
  });
});
