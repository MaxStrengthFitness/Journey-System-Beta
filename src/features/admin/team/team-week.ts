/**
 * TEAM → THIS WEEK — each trainer's card, in today's schedule order. Pure:
 * team-week.test.ts (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 6 (Sep 28 2026; research-operations
 * §6.3, the blueprint's Team page). A card per trainer, never a ranking:
 *
 *   on today       who has bookings today, in the order their day starts
 *                  (then name), with their hours; everyone else who works
 *                  here (lib/who-works-here) under "Off today", in name order
 *   last week      done-means-logged, per trainer (week/review.ts teamWeek,
 *                  the Monday review's own numbers): every session logged,
 *                  or the ones that aren't yet, by name
 *   their clients  the usual clients (last night's record names the trainer)
 *                  the Journey calls drifting or at risk: the person most
 *                  likely to know why
 *   recognise      facts worth saying out loud: their usual clients booked
 *                  again after a gap, and the kudos the team gave them this
 *                  week (Relay's kudos, the number My Studio → Team shows)
 *
 * Nothing here is a score: no "behind", no order but the day's and the
 * alphabet's, no count of one person against another.
 */
import { isStaffBlock } from "../../../lib/booking-state";
import { formatStudioTime, studioDateKey, toDate } from "../../../lib/studio-time";
import type { ScheduleEntry } from "../../../types";
import type { JourneyEntry } from "../journey/journey-list";
import type { TrainerWeek } from "../week/review";

interface TrainerLike {
  id?: string;
  authUid?: string | null;
  fullName: string;
}

export interface OnToday {
  /** The trainer's id when Journey knows them, else their name in lower case. */
  key: string;
  trainerId: string | null;
  name: string;
  /** "7:00 AM – 1:30 PM": their first booking's start to their last one's end. */
  shift: string;
  booked: number;
  firstMs: number;
}

/** Who has bookings today, in the order their day starts, then by name. A rotation and a staff block are nobody's. */
export function onToday(entries: readonly ScheduleEntry[], today: string, trainers: readonly TrainerLike[], tz?: string): OnToday[] {
  const out = new Map<string, OnToday & { lastMs: number }>();
  for (const b of entries) {
    if (b.status === "Cancelled" || isStaffBlock(b) || studioDateKey(b.startTime, tz) !== today) continue;
    const known = b.trainerId ? trainers.find((t) => t.id === b.trainerId || (t.authUid && t.authUid === b.trainerId)) : undefined;
    const name = (known?.fullName ?? b.trainerName ?? "").trim();
    if (!name || / rotation$/i.test(name)) continue;
    const start = toDate(b.startTime)?.getTime();
    if (typeof start !== "number") continue;
    const end = toDate(b.endTime)?.getTime() ?? start + 30 * 60_000;
    const key = known?.id ?? name.toLowerCase();
    const row = out.get(key) ?? { key, trainerId: known?.id ?? null, name, shift: "", booked: 0, firstMs: start, lastMs: end };
    row.booked += 1;
    row.firstMs = Math.min(row.firstMs, start);
    row.lastMs = Math.max(row.lastMs, end);
    out.set(key, row);
  }
  return [...out.values()]
    .map(({ lastMs, ...r }) => ({ ...r, shift: `${formatStudioTime(new Date(r.firstMs), tz)} – ${formatStudioTime(new Date(lastMs), tz)}` }))
    .sort((a, b) => a.firstMs - b.firstMs || a.name.localeCompare(b.name));
}

/** The team members with no bookings today, in name order. */
export function offToday<T extends TrainerLike>(team: readonly T[], on: readonly OnToday[]): T[] {
  const onIds = new Set(on.map((o) => o.trainerId).filter(Boolean) as string[]);
  const onNames = new Set(on.map((o) => o.name.toLowerCase()));
  return team.filter((t) => !(t.id && onIds.has(t.id)) && !onNames.has(t.fullName.trim().toLowerCase())).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayWord = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

/** "Hugo Bracegirdle, Sat 10:30 AM · Ted Sandyman, Mon 11:00 AM and 2 more". */
function missingList(w: TrainerWeek, tz?: string): string {
  const shown = w.missing.slice(0, 3).map((m) => `${m.clientName}, ${dayWord(m.day)}${m.startMs ? ` ${formatStudioTime(new Date(m.startMs), tz)}` : ""}`);
  const more = w.missing.length - shown.length;
  return `${shown.join(" · ")}${more > 0 ? ` and ${more} more` : ""}`;
}

/** What last week says about their logging. `read` is the week's bookings: an unread week says so. */
export function didLine(w: TrainerWeek | undefined, read: "loading" | "failed" | "ready", tz?: string): string {
  if (read === "loading") return "Reading last week…";
  if (read === "failed") return "Last week's bookings couldn't be read just now.";
  if (!w || w.booked === 0) return "Nothing was booked with them last week.";
  if (w.notLogged === null) return `${w.booked} booked last week; what was logged couldn't be read.`;
  if (w.notLogged === 0) return w.booked === 1 ? "Last week's one session is logged." : `Every one of last week's ${w.booked} sessions is logged.`;
  return `${w.notLogged === 1 ? "One session" : `${w.notLogged} sessions`} last week ${w.notLogged === 1 ? "isn't" : "aren't"} logged yet: ${missingList(w, tz)}.`;
}

const names = (list: readonly string[], max = 3) => {
  const shown = list.slice(0, max);
  const more = list.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length <= 1 ? shown.join("") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
};

/** A trainer's usual clients on the Journey (last night's record names the trainer). */
export function usualClients(entries: readonly JourneyEntry[], trainerId: string | null): JourneyEntry[] {
  return trainerId ? entries.filter((e) => e.usual?.id === trainerId) : [];
}

/**
 * Their usual clients the Journey calls drifting or at risk. `known` is false
 * while the Journey is being read or the nightly record is stale: nobody is
 * judged, so nothing is said either way.
 */
export function clientsLine(theirs: readonly JourneyEntry[], known: boolean): string {
  if (!known) return "Whether their clients are slipping can't be told yet.";
  const slipping = theirs.filter((e) => e.journey.state === "drifting" || e.journey.state === "at-risk");
  if (slipping.length === 0) return "None of their usual clients is drifting or at risk.";
  const said = slipping.map((e) => `${e.row.name.display} ${e.journey.state === "at-risk" ? "is at risk" : "is drifting"}`);
  return `${names(said)}. They may know why.`;
}

/** What is worth recognising out loud; null when there is nothing on record. */
export function recognitionLine(theirs: readonly JourneyEntry[], kudos: number | null): string | null {
  const back = theirs.filter((e) => e.journey.state === "back").map((e) => e.row.name.display);
  const parts: string[] = [];
  if (back.length > 0) parts.push(`${names(back)} ${back.length === 1 ? "is" : "are"} booked again after a gap.`);
  if (kudos && kudos > 0) parts.push(`${kudos} kudos from the team in the last seven days.`);
  return parts.length ? parts.join(" ") : null;
}
