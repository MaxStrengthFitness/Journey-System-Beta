import { describe, expect, it } from "vitest";
import type { HubAnnouncement, Trainer } from "../../../types";
import { maySeeReadCount, noticeAudience, noticeStudioId, readCountOf, readCountSentence } from "./read-count";

const t = (id: string, over: Partial<Trainer> & Record<string, unknown> = {}): Trainer =>
  ({ id, authUid: `uid-${id}`, fullName: id, role: "LifeTransformer", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"], ...over }) as Trainer;

const team = [
  t("ana"),
  t("bo"),
  t("cy"),
  t("lead", { role: "StudioLeader" }),
  t("away", { primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] }),
  t("gone", { isActive: false }),
];

const notice = (over: Partial<HubAnnouncement> = {}) =>
  ({ studioId: "westlake", targetScope: "studio", targetId: "westlake", authorId: "uid-lead", asksRead: true, ...over }) as HubAnnouncement;

describe("9 of 12 have read it (the Atlas answers, Oct 2 2026)", () => {
  it("counts the people a studio notice reaches, never the poster, never anyone gone", () => {
    expect(noticeStudioId(notice())).toBe("westlake");
    expect(noticeAudience(notice(), team).map((x) => x.id)).toEqual(["ana", "bo", "cy"]);
  });

  it("counts answers under either id, and only from the audience", () => {
    const acks = new Set(["uid-ana", "bo", "uid-away", "uid-lead"]);
    const c = readCountOf(notice(), team, acks);
    expect(c).toEqual({ state: "known", read: 2, of: 3 });
    expect(readCountSentence(c)).toBe("2 of 3 have read it.");
    expect(readCountSentence({ state: "known", read: 1, of: 3 })).toBe("1 of 3 has read it.");
    expect(readCountSentence({ state: "known", read: 3, of: 3 })).toBe("All 3 have read it.");
  });

  it("an unread record is unknown, never zero", () => {
    expect(readCountOf(notice(), team, null)).toEqual({ state: "unknown" });
    expect(readCountSentence({ state: "unknown" })).toBe("Couldn’t check who has read it just now.");
  });

  it("is shown to the poster, the studio's leaders and the every-studio roles, on a notice that asks", () => {
    expect(maySeeReadCount(team[3], "uid-lead", notice())).toBe(true);
    expect(maySeeReadCount(team[3], "uid-lead", notice({ authorId: "uid-someone" }))).toBe(true);
    expect(maySeeReadCount(team[0], "uid-ana", notice())).toBe(false);
    expect(maySeeReadCount(t("owner", { role: "Owner" }), "uid-owner", notice())).toBe(true);
    expect(maySeeReadCount(team[3], "uid-lead", notice({ asksRead: false }))).toBe(false);
  });
});
