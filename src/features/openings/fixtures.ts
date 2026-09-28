/**
 * TEST FIXTURES for Openings' pure core (not shipped: only the tests import
 * it). A studio on the studio's own clock, America/New_York, with two agreed
 * trainers and one ordinary Monday a week.
 *
 * The Sunday the job runs: Sun Nov 8 2026, 2:00 AM Eastern (07:00 UTC), a
 * week after the clocks went back (Sun Nov 1). Its window is the eight
 * Monday-to-Saturday weeks Sep 14 - Nov 7, newest first:
 *
 *   index  0       1       2       3       4      5       6       7
 *   Monday Nov 2   Oct 26  Oct 19  Oct 12  Oct 5  Sep 28  Sep 21  Sep 14
 *
 * Every Monday: Sam 7:00, Sam and Pat 8:00, Sam 9:00. Sam takes clients
 * 7:00 - 10:00 and Pat 7:00 - 9:00, both agreed on Sep 1.
 */
import type { ScheduleEntry } from "../../types";
import { wallClockToInstant } from "../../lib/studio-time";
import type { StandingWeekDoc } from "../standing-week/week";
import { addDays, type CoverageRecord } from "./coverage";
import type { TrainerRef } from "./whose";

export const TZ = "America/New_York";
export const SUNDAY_RUN = new Date("2026-11-08T07:00:00Z");
export const MONDAYS = ["2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28", "2026-09-21", "2026-09-14"];

export const TRAINERS: TrainerRef[] = [
  { id: "t-sam", name: "Sam Lee", staffId: null },
  { id: "t-pat", name: "Pat Moss", staffId: null },
];

/** The studio's wall clock on a day, as an instant. */
export const at = (day: string, clock: string): Date => wallClockToInstant(`${day}T${clock}:00`, TZ)!;

let n = 0;
export function booking(day: string, clock: string, over: Partial<ScheduleEntry> & { minutes?: number; mindbodyStaffId?: unknown } = {}): ScheduleEntry {
  const { minutes = 30, ...rest } = over;
  const start = at(day, clock);
  return {
    id: `b${++n}`,
    clientId: `c${n}`,
    clientName: `Client ${n}`,
    trainerId: "t-sam",
    trainerName: "Sam Lee",
    studioId: "westlake",
    startTime: start,
    endTime: new Date(start.getTime() + minutes * 60_000),
    status: "Scheduled",
    serviceName: "Training Session",
    source: "MindBody",
    createdAt: new Date("2026-08-01T12:00:00Z"),
    ...rest,
  } as ScheduleEntry;
}

export const sam = (day: string, clock: string, over: Parameters<typeof booking>[2] = {}) => booking(day, clock, over);
export const pat = (day: string, clock: string, over: Parameters<typeof booking>[2] = {}) => booking(day, clock, { trainerId: "t-pat", trainerName: "Pat Moss", ...over });

/** One ordinary Monday. */
export function monday(day: string): ScheduleEntry[] {
  return [sam(day, "07:00"), sam(day, "08:00"), pat(day, "08:00"), sam(day, "09:00")];
}

export function standingWeek(over: Partial<StandingWeekDoc> & { hours?: { weekday: number; from: string; to: string }[] } = {}): StandingWeekDoc {
  const { hours, ...rest } = over;
  return {
    id: "uid-sam",
    studioId: "westlake",
    trainerUid: "uid-sam",
    trainerId: "t-sam",
    trainerName: "Sam Lee",
    proposed: null,
    final: { hours: hours ?? [{ weekday: 1, from: "07:00", to: "10:00" }], regulars: [] },
    finalAt: new Date("2026-09-01T14:00:00Z"),
    away: [],
    ...rest,
  };
}

export const SAM_WEEK = standingWeek();
export const PAT_WEEK = standingWeek({ id: "uid-pat", trainerUid: "uid-pat", trainerId: "t-pat", trainerName: "Pat Moss", hours: [{ weekday: 1, from: "07:00", to: "09:00" }] });

/** A whole-read record holding every day from `from` to `to`. */
export function readInFull(from: string, to: string, except: readonly string[] = []): CoverageRecord {
  const byMonth = new Map<string, Set<string>>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const m = d.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, new Set());
    if (!except.includes(d)) byMonth.get(m)!.add(d);
  }
  return byMonth;
}

export const WHOLE_WINDOW = readInFull("2026-09-01", "2026-11-30");
