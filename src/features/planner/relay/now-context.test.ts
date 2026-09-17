import { beforeAll, describe, expect, it } from "vitest";
import { setActiveTimeZone } from "../../../lib/studio-time";
import {
  DEFAULT_SHIFT_HOURS,
  clockToMinutes,
  entryIsTrainers,
  fitsGap,
  gapFraction,
  gapSentence,
  minutesToClock,
  mySessionsToday,
  nowContext,
  phaseAt,
  shiftHoursOf,
  type NowSession,
} from "./now-context";
import type { ScheduleEntry } from "../../../types";

beforeAll(() => setActiveTimeZone("America/New_York"));

const s = (id: string, startMin: number, endMin = startMin + 30, extra: Partial<NowSession> = {}): NowSession => ({
  id,
  clientId: id,
  clientName: id,
  startMin,
  endMin,
  status: "Scheduled",
  ...extra,
});

describe("clock helpers", () => {
  it("parses HH:MM and refuses nonsense", () => {
    expect(clockToMinutes("05:30")).toBe(330);
    expect(clockToMinutes("5:30")).toBe(330);
    expect(clockToMinutes("24:00")).toBeNull();
    expect(clockToMinutes("")).toBeNull();
    expect(clockToMinutes(undefined)).toBeNull();
  });
  it("prints 12-hour clocks", () => {
    expect(minutesToClock(0)).toBe("12:00 AM");
    expect(minutesToClock(330)).toBe("5:30 AM");
    expect(minutesToClock(12 * 60)).toBe("12:00 PM");
    expect(minutesToClock(16 * 60 + 5)).toBe("4:05 PM");
  });
});

describe("shift hours", () => {
  it("falls back field by field and keeps the four in order", () => {
    expect(shiftHoursOf(null)).toEqual(DEFAULT_SHIFT_HOURS);
    expect(shiftHoursOf({ open: "06:00", mid: "nope" })).toEqual({ ...DEFAULT_SHIFT_HOURS, open: 360 });
    // closing typed before mid: forced to mid, not allowed to run backwards
    expect(shiftHoursOf({ mid: "12:00", closing: "11:00" })).toMatchObject({ mid: 720, closing: 720 });
  });
  it("names the phase", () => {
    expect(phaseAt(5 * 60)).toBe("closed");
    expect(phaseAt(6 * 60)).toBe("opening");
    expect(phaseAt(12 * 60)).toBe("mid");
    expect(phaseAt(17 * 60)).toBe("closing");
    expect(phaseAt(21 * 60)).toBe("closed");
  });
});

describe("matching a trainer to a schedule row", () => {
  const me = { id: "t1", fullName: "Marina Borden", nickname: "Mar" };
  it("uses the id when the row has one, even if the name would match", () => {
    expect(entryIsTrainers({ trainerId: "t1", trainerName: "Someone Else" } as ScheduleEntry, me)).toBe(true);
    expect(entryIsTrainers({ trainerId: "t9", trainerName: "Marina Borden" } as ScheduleEntry, me)).toBe(false);
  });
  it("falls back to the full name, first name, nickname or a prefix", () => {
    expect(entryIsTrainers({ trainerName: "marina borden" } as ScheduleEntry, me)).toBe(true);
    expect(entryIsTrainers({ trainerName: "Marina" } as ScheduleEntry, me)).toBe(true);
    expect(entryIsTrainers({ trainerName: "Mar" } as ScheduleEntry, me)).toBe(true);
    expect(entryIsTrainers({ trainerName: "Marina B." } as ScheduleEntry, me)).toBe(true);
    expect(entryIsTrainers({ trainerName: "Austin" } as ScheduleEntry, me)).toBe(false);
    expect(entryIsTrainers({ trainerName: "" } as ScheduleEntry, me)).toBe(false);
  });
});

describe("mySessionsToday", () => {
  const me = { id: "t1", fullName: "Marina Borden" };
  const row = (id: string, start: string, end?: string, extra: Partial<ScheduleEntry> = {}): ScheduleEntry =>
    ({
      id,
      trainerId: "t1",
      trainerName: "Marina Borden",
      clientName: `Client ${id}`,
      clientId: `c-${id}`,
      studioId: "s1",
      startTime: start,
      endTime: end ?? null,
      status: "Scheduled",
      serviceName: "Session",
      source: "MindBody",
      createdAt: null,
      ...extra,
    }) as ScheduleEntry;

  it("keeps only today's, mine, not cancelled, not unavailability, in order", () => {
    const list = mySessionsToday(
      [
        row("b", "2026-09-16T14:40:00-04:00", "2026-09-16T15:10:00-04:00"),
        row("a", "2026-09-16T09:00:00-04:00"),
        row("x", "2026-09-16T10:00:00-04:00", undefined, { status: "Cancelled" }),
        row("y", "2026-09-17T09:00:00-04:00"),
        row("z", "2026-09-16T11:00:00-04:00", undefined, { trainerId: "t2", trainerName: "Austin" }),
        row("u", "2026-09-16T12:00:00-04:00", undefined, { clientName: "Unavailable" }),
      ],
      me,
      "2026-09-16",
    );
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
    expect(list[0]).toMatchObject({ startMin: 540, endMin: 570, clientId: "c-a" });
    expect(list[1]).toMatchObject({ startMin: 880, endMin: 910 });
  });

  it("reads the studio's clock, not the device's", () => {
    // 13:40 UTC is 9:40 Eastern in September.
    const list = mySessionsToday([row("a", "2026-09-16T13:40:00Z")], me, "2026-09-16");
    expect(list[0].startMin).toBe(9 * 60 + 40);
  });

  it("is empty with no trainer", () => {
    expect(mySessionsToday([row("a", "2026-09-16T09:00:00-04:00")], null, "2026-09-16")).toEqual([]);
  });
});

describe("nowContext", () => {
  const day = [s("a", 540, 570), s("b", 600, 630), s("c", 880, 910)];

  it("finds the gap to the next session", () => {
    const ctx = nowContext(day, 575, "2026-09-16");
    expect(ctx.current).toBeNull();
    expect(ctx.next?.id).toBe("b");
    expect(ctx.gapMinutes).toBe(25);
    expect(ctx.done).toBe(1);
    expect(ctx.total).toBe(3);
    expect(gapSentence(ctx)).toBe("25 min free");
  });

  it("during a session, the gap is the one after it", () => {
    const ctx = nowContext(day, 610, "2026-09-16");
    expect(ctx.current?.id).toBe("b");
    expect(ctx.next?.id).toBe("c");
    expect(ctx.gapMinutes).toBe(250);
    expect(gapSentence(ctx)).toBe("With b · 20 min left");
  });

  it("says so when nothing else is booked", () => {
    const ctx = nowContext(day, 920, "2026-09-16");
    expect(ctx.next).toBeNull();
    expect(ctx.gapMinutes).toBeNull();
    expect(gapSentence(ctx)).toBe("No more sessions today");
    expect(gapSentence(nowContext([], 920, "2026-09-16"))).toBe("Nothing booked today");
    expect(gapSentence(nowContext(day, 21 * 60, "2026-09-16"))).toBe("Done for today");
  });

  it("prints long gaps in hours", () => {
    expect(gapSentence(nowContext(day, 640, "2026-09-16"))).toBe("4 h 0 min free");
  });

  it("back-to-back sessions read as a zero gap, not a negative one", () => {
    const ctx = nowContext([s("a", 540, 570), s("b", 570, 600)], 560, "2026-09-16");
    expect(ctx.gapMinutes).toBe(0);
    expect(gapSentence(ctx)).toBe("With a · 10 min left");
  });
});

describe("gap fitting", () => {
  it("meters the gap against an hour", () => {
    expect(gapFraction(null)).toBe(1);
    expect(gapFraction(30)).toBe(0.5);
    expect(gapFraction(90)).toBe(1);
  });
  it("fits by minutes, and an unknown duration only in a long gap", () => {
    expect(fitsGap(6, 8)).toBe(true);
    expect(fitsGap(10, 8)).toBe(false);
    expect(fitsGap(null, 8)).toBe(false);
    expect(fitsGap(null, 25)).toBe(true);
    expect(fitsGap(90, null)).toBe(true);
  });
});
