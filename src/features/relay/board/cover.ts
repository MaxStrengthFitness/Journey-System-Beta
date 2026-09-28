/**
 * A COVER ASK KEEPS ITS TIME (the second wave of the Relay room, Sep 28
 * 2026; AJ: "all yes"). The Ask sheet's Cover me writes the session's start
 * as `coverAt` (ms since epoch) beside its studio day (`sessionDate`), so the
 * Board can say "needed at 4:20 PM", sort the Help door's cover asks by the
 * time they are needed, keep a cover for Thursday from pressing on today,
 * and let the ask go when the session starts (its `expiresAt`).
 *
 * A cover posted before the field, or with no time, has none: it reads and
 * sorts as it always did (its time is in its words).
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import type { TaskRequest } from "../../studio-tasks/requests";
import { studioDateKey, wallClockToInstant, zonedHM } from "../../../lib/studio-time";
import { dayWords } from "../jobs/jobs";
import { minutesToClock } from "./now-context";

/** The instant a studio day and a wall-clock time ("16:00") name, in the studio's zone; null when either is missing. */
export function coverInstant(day: string | null | undefined, time: string | null | undefined, tz?: string): number | null {
  if (!day || !time || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":");
  const at = wallClockToInstant(`${day}T${h.padStart(2, "0")}:${m}:00`, tz);
  return at ? at.getTime() : null;
}

/** The kept time of a cover ask, or null. */
export function coverAtOf(r: Pick<TaskRequest, "kind" | "coverAt">): number | null {
  return r.kind === "cover" && typeof r.coverAt === "number" && Number.isFinite(r.coverAt) ? r.coverAt : null;
}

export interface CoverTime {
  at: number;
  /** The studio day it is needed. */
  day: string;
  /** Minutes since the studio's midnight. */
  min: number;
}

export function coverTimeOf(r: Pick<TaskRequest, "kind" | "coverAt">, tz?: string): CoverTime | null {
  const at = coverAtOf(r);
  if (at === null) return null;
  const d = new Date(at);
  const day = studioDateKey(d, tz);
  const hm = zonedHM(d, tz);
  if (!day || !hm) return null;
  return { at, day, min: hm.hour * 60 + hm.minute };
}

/** "needed at 4:20 PM" today, "needed tomorrow at 9:30 AM", "needed Thursday at 9:30 AM". */
export function neededWords(t: CoverTime, todayKey: string): string {
  const clock = minutesToClock(t.min);
  if (t.day === todayKey) return `needed at ${clock}`;
  return `needed ${dayWords(t.day, todayKey)} at ${clock}`;
}

/** Is this cover for a later day than today (so it doesn't press on today)? */
export function coverIsLater(r: Pick<TaskRequest, "kind" | "coverAt">, todayKey: string, tz?: string): boolean {
  const t = coverTimeOf(r, tz);
  return Boolean(t && t.day > todayKey);
}

/**
 * The cover ask Right now should name, if any: open, nobody on it, not
 * yours, and needed today and still to come (a kept time), or with no kept
 * time as before. The soonest first.
 */
export function coverToName(requests: readonly TaskRequest[], me: ReadonlySet<string>, todayKey: string, now: number, tz?: string): TaskRequest | null {
  const candidates = requests.filter((r) => r.status === "open" && r.kind === "cover" && !r.claimedBy && !me.has(r.createdBy.id));
  const timed = candidates
    .map((r) => ({ r, t: coverTimeOf(r, tz) }))
    .filter((x) => x.t === null || (x.t.day === todayKey && x.t.at > now));
  timed.sort((a, b) => (a.t?.at ?? Number.MAX_SAFE_INTEGER) - (b.t?.at ?? Number.MAX_SAFE_INTEGER));
  return timed[0]?.r ?? null;
}
