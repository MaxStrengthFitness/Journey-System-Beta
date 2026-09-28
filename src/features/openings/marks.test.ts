import { describe, expect, it } from "vitest";
import {
  MARKS_COLLECTION,
  MARK_REVIEW_DAYS,
  MAX_MARK_NOTE,
  countsAsFull,
  disagreement,
  markAgeDays,
  markForWrite,
  markId,
  marksByTime,
  needsReview,
  normalizeMark,
  offerable,
  type OpeningsMark,
} from "./marks";
import type { UsualTime } from "./usual";

const TZ = "America/New_York";
const raw = (over: Record<string, unknown> = {}) => ({
  weekday: 1,
  time: "08:00",
  mark: "full",
  note: "Always taken by the 8 o'clocks",
  by: { id: "uid-jo", name: "Jo Park" },
  at: new Date("2026-10-03T14:00:00Z"),
  ...over,
});
const mark = (over: Partial<OpeningsMark> = {}): OpeningsMark => ({ ...normalizeMark("1-0800", raw())!, ...over });

describe("the numbers", () => {
  it("one small collection, a review after 60 days, a 200-character note", () => {
    expect(MARKS_COLLECTION).toBe("openingsMarks");
    expect(MARK_REVIEW_DAYS).toBe(60);
    expect(MAX_MARK_NOTE).toBe(200);
  });
});

describe("a mark as stored", () => {
  it("its id is the weekday and the half-hour, as the rules require", () => {
    expect(markId(1, "08:00")).toBe("1-0800");
    expect(markId(6, "17:30")).toBe("6-1730");
    expect(markId(0, "08:00")).toBeNull();
    expect(markId(1, "08:15")).toBeNull();
    expect(markId(1, "8:00")).toBeNull();
  });

  it("is read safely: anything the rules would refuse is left out", () => {
    expect(normalizeMark("1-0800", raw())).toMatchObject({ id: "1-0800", mark: "full", by: { id: "uid-jo", name: "Jo Park" } });
    expect(normalizeMark("1-0830", raw())).toBeNull();
    expect(normalizeMark("1-0800", raw({ mark: "busy" }))).toBeNull();
    expect(normalizeMark("1-0800", raw({ by: { name: "Nobody" } }))).toBeNull();
    expect(normalizeMark("1-0800", raw({ note: undefined }))?.note).toBe("");
    expect(normalizeMark("1-0800", raw({ at: null }))?.at).toBeNull();
    expect(normalizeMark("1-0800", "x")).toBeNull();
    const byTime = marksByTime([{ id: "1-0800", data: raw() }, { id: "bad", data: raw() }]);
    expect([...byTime.keys()]).toEqual(["1-0800"]);
  });

  it("is written as the person, with no `at` (the server's) and nothing undefined", () => {
    expect(markForWrite({ key: "1-0800", mark: "room", note: "  ", by: { id: "uid-jo", name: "Jo Park" } })).toEqual({
      weekday: 1,
      time: "08:00",
      mark: "room",
      by: { id: "uid-jo", name: "Jo Park" },
    });
    expect(markForWrite({ key: "1-0800", mark: "full", note: "x".repeat(300), by: { id: "uid-jo", name: "Jo" } })?.note).toHaveLength(MAX_MARK_NOTE);
    expect(markForWrite({ key: "bad", mark: "full", by: { id: "uid-jo", name: "Jo" } })).toBeNull();
    expect(markForWrite({ key: "1-0800", mark: "full", by: { id: "", name: "Jo" } })).toBeNull();
  });
});

describe("the review", () => {
  it("asks after 60 days on the studio's calendar, and keeps working while it waits", () => {
    const m = mark({ at: new Date("2026-10-03T14:00:00Z") });
    expect(markAgeDays(m, "2026-12-01", TZ)).toBe(59);
    expect(needsReview(m, "2026-12-01", TZ)).toBe(false);
    expect(needsReview(m, "2026-12-02", TZ)).toBe(true);
    expect(needsReview(mark({ at: null }), "2027-06-01", TZ)).toBe(false);
  });
});

describe("what a mark changes", () => {
  const full = mark();
  const room = mark({ mark: "room" });

  it("Always full counts as usually full for the next 7 days, and is never offered", () => {
    expect(countsAsFull("mixed", full)).toBe(true);
    expect(countsAsFull("usually-full", null)).toBe(true);
    expect(countsAsFull("usually-room", room)).toBe(false);
    expect(offerable("usually-room", full)).toBe(false);
  });

  it("Usually has room is offered; a time that reads Always full never is", () => {
    expect(offerable("mixed", room)).toBe(true);
    expect(offerable("usually-room", null)).toBe(true);
    expect(offerable("always-full", room)).toBe(false);
    expect(offerable("mixed", null)).toBe(false);
  });

  it("says when the bookings clearly disagree", () => {
    const usual = (over: Partial<UsualTime>) => ({ judged: 8, full: 0, room: 0, ...over }) as UsualTime;
    expect(disagreement(usual({ room: 6 }), full)).toBe("room");
    expect(disagreement(usual({ room: 5 }), full)).toBeNull();
    expect(disagreement(usual({ full: 7 }), room)).toBe("full");
    expect(disagreement(usual({ judged: 3, room: 3 }), full)).toBeNull();
    expect(disagreement(usual({ room: 8 }), null)).toBeNull();
  });
});
