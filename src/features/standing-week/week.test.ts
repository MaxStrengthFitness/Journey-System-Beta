import { describe, expect, it } from "vitest";
import {
  MAX_AWAY,
  awayForWrite,
  awayOn,
  clockOf,
  isDateKey,
  minutesOf,
  newAwayId,
  normalizeAway,
  upcomingAway,
  newRegularId,
  normalizeDoc,
  normalizeWeek,
  sameWeek,
  weekForWrite,
  weekStatus,
  weekSummary,
  type StandingWeek,
} from "./week";

/** The standing week's shape (voice-review round, Sep 27 2026). */

const judyMon = { id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
const judyThu = { id: "r2", weekday: 4, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
const week = (over: Partial<StandingWeek> = {}): StandingWeek => ({
  hours: [
    { weekday: 1, from: "07:00", to: "13:00" },
    { weekday: 4, from: "07:00", to: "13:00" },
  ],
  regulars: [judyMon, judyThu],
  ...over,
});

describe("clocks", () => {
  it("reads and writes the studio's HH:MM", () => {
    expect(minutesOf("08:30")).toBe(510);
    expect(minutesOf("8:30")).toBeNull();
    expect(minutesOf("24:00")).toBeNull();
    expect(clockOf(510)).toBe("08:30");
    expect(clockOf(1440 + 15)).toBe("00:15");
  });
});

describe("normalizeWeek", () => {
  it("leaves out anything malformed instead of guessing", () => {
    const w = normalizeWeek({
      hours: [{ weekday: 1, from: "07:00", to: "13:00" }, { weekday: 9, from: "07:00", to: "08:00" }, { weekday: 2, from: "13:00", to: "07:00" }, null],
      regulars: [judyMon, { ...judyThu, clientId: "" }, { ...judyThu, id: "r3", start: "8" }, "x"],
      note: "  Mornings only  ",
    });
    expect(w.hours).toEqual([{ weekday: 1, from: "07:00", to: "13:00" }]);
    expect(w.regulars).toEqual([judyMon]);
    expect(w.note).toBe("Mornings only");
  });

  it("puts Monday first and Sunday last, earliest first", () => {
    const w = normalizeWeek({
      hours: [
        { weekday: 0, from: "09:00", to: "12:00" },
        { weekday: 1, from: "13:00", to: "17:00" },
        { weekday: 1, from: "07:00", to: "11:00" },
      ],
      regulars: [],
    });
    expect(w.hours.map((h) => `${h.weekday} ${h.from}`)).toEqual(["1 07:00", "1 13:00", "0 09:00"]);
  });

  it("reads nothing as an empty week", () => {
    expect(normalizeWeek(undefined)).toEqual({ hours: [], regulars: [] });
  });
});

describe("where a week stands", () => {
  it("is none, proposed, agreed or changed", () => {
    expect(weekStatus(null)).toBe("none");
    expect(weekStatus({ proposed: null, final: null })).toBe("none");
    expect(weekStatus({ proposed: week(), final: null })).toBe("proposed");
    expect(weekStatus({ proposed: week(), final: week() })).toBe("agreed");
    expect(weekStatus({ proposed: null, final: week() })).toBe("agreed");
    expect(weekStatus({ proposed: week({ regulars: [judyMon] }), final: week() })).toBe("changed");
  });

  it("compares what a week says, not its row ids or order", () => {
    const reordered = week({ regulars: [{ ...judyThu, id: "x9" }, { ...judyMon, id: "x8" }] });
    expect(sameWeek(week(), reordered)).toBe(true);
    expect(sameWeek(week(), week({ regulars: [judyMon, { ...judyThu, start: "08:30" }] }))).toBe(false);
    expect(sameWeek(week(), week({ note: "Back in Nov" }))).toBe(false);
  });

  it("sums a week up with the things counted", () => {
    expect(weekSummary(null)).toBe("No week yet");
    expect(weekSummary({ hours: [], regulars: [] })).toBe("An empty week");
    expect(weekSummary(week())).toBe("2 days · 2 regulars");
    expect(weekSummary(week({ hours: [], regulars: [judyMon] }))).toBe("no hours set · 1 regular");
  });
});

describe("writing a week", () => {
  it("never writes undefined, and leaves an empty note out", () => {
    const w = weekForWrite({ ...week(), note: "  " });
    expect(JSON.stringify(w)).not.toContain("undefined");
    expect(w).not.toHaveProperty("note");
    expect(Object.keys(w.regulars[0]).sort()).toEqual(["clientId", "clientName", "id", "start", "weekday"]);
  });

  it("gives a new regular an id no other row has", () => {
    const id = newRegularId([judyMon, { ...judyThu, id: "r1f" }], 51);
    expect(id).not.toBe("r1");
    expect([judyMon.id, "r1f"]).not.toContain(id);
    expect(newRegularId([{ ...judyMon, id: "r1f" }], 51)).toBe("r1g");
  });

  it("reads a stored document safely", () => {
    const d = normalizeDoc("uid-sam", { studioId: "solon", trainerId: "t-sam", trainerName: "Sam Lee", proposed: week(), final: null });
    expect(d).toMatchObject({ id: "uid-sam", trainerUid: "uid-sam", trainerId: "t-sam", final: null });
    expect(d.proposed!.regulars).toHaveLength(2);
  });
});

describe("days away (voice review follow-up)", () => {
  const vacation = { id: "a1", from: "2026-10-05", to: "2026-10-09", note: " Vacation " };

  it("reads what is stored safely: bad dates and backwards ranges are left out, earliest first", () => {
    expect(
      normalizeAway([
        { id: "a2", from: "2026-11-02", to: "2026-11-02" },
        vacation,
        { id: "a3", from: "2026-10-09", to: "2026-10-05" },
        { id: "a4", from: "Oct 5", to: "2026-10-09" },
        { id: "", from: "2026-10-05", to: "2026-10-09" },
        "2026-10-05",
        null,
      ]),
    ).toEqual([
      { id: "a1", from: "2026-10-05", to: "2026-10-09", note: "Vacation" },
      { id: "a2", from: "2026-11-02", to: "2026-11-02" },
    ]);
    expect(normalizeAway(undefined)).toEqual([]);
    expect(normalizeAway(Array.from({ length: 25 }, (_, i) => ({ id: `a${i}`, from: "2026-10-05", to: "2026-10-05" })))).toHaveLength(MAX_AWAY);
    expect(normalizeDoc("uid-sam", { trainerId: "t-sam", away: [vacation] }).away).toEqual([{ id: "a1", from: "2026-10-05", to: "2026-10-09", note: "Vacation" }]);
    expect(normalizeDoc("uid-sam", { trainerId: "t-sam" }).away).toEqual([]);
  });

  it("knows a date key", () => {
    expect(isDateKey("2026-10-05")).toBe(true);
    expect(isDateKey("2026-13-05")).toBe(false);
    expect(isDateKey("2026-10-5")).toBe(false);
    expect(isDateKey(20261005)).toBe(false);
  });

  it("shows only what hasn't ended, and says which range covers a day", () => {
    const past = { id: "a0", from: "2026-09-01", to: "2026-09-04" };
    expect(upcomingAway([past, vacation], "2026-10-09").map((r) => r.id)).toEqual(["a1"]);
    expect(upcomingAway([past, vacation], "2026-10-10")).toEqual([]);
    expect(awayOn([vacation], "2026-10-05")?.id).toBe("a1");
    expect(awayOn([vacation], "2026-10-09")?.id).toBe("a1");
    expect(awayOn([vacation], "2026-10-10")).toBeNull();
    expect(awayOn(undefined, "2026-10-05")).toBeNull();
  });

  it("drops past ranges and leaves nothing undefined as it saves", () => {
    const past = { id: "a0", from: "2026-09-01", to: "2026-09-04" };
    const w = awayForWrite([past, { id: "a1", from: "2026-10-05", to: "2026-10-09", note: undefined }], "2026-09-28");
    expect(w).toEqual([{ id: "a1", from: "2026-10-05", to: "2026-10-09" }]);
    expect(JSON.stringify(w)).not.toContain("undefined");
  });

  it("gives a new range an id no other range has", () => {
    expect(newAwayId([{ id: "a1f", from: "2026-10-05", to: "2026-10-05" }], 51)).toBe("a1g");
  });
});
