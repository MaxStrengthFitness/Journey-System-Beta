/**
 * A machine's story for one client, in five lines (AJ, Oct 2 2026). The
 * profile's grid used to carry a whole Analytics column for this, cycling one
 * number at a time; AJ chose to have it only on a tap: "what weight did I
 * start them at, what weight did they end at, what was the last one they
 * performed, the weight they did best at and the weight they did worst at"
 * — the read a trainer needs after a surgery or a long gap, without
 * scrolling the whole journey back.
 *
 * Built on `computeRowStats` (stats.ts), so Started, Best, Lowest and Most
 * reps break ties exactly as the old column did; Last is the newest
 * performed set. Only performed sets count (lib/set-outcome.ts). It reads
 * the sessions the profile has loaded, which the card says.
 */
import { computeRowStats } from "./stats";
import type { JourneyRow, JourneySession, JourneySet } from "./types";

export type StoryKey = "first" | "last" | "high" | "low" | "mostReps";

export interface StoryLine {
  key: StoryKey;
  label: string;
  weight: number;
  /** "12 reps", "30 s" for a timed static contraction, or null with no count. */
  effort: string | null;
  /** YYYY-MM-DD, the session's day. */
  date: string;
}

const LABEL: Record<StoryKey, string> = {
  first: "Started",
  last: "Last",
  high: "Best",
  low: "Lowest",
  mostReps: "Most reps",
};

function effortOf(set: JourneySet): string | null {
  if (set.isTSC) return typeof set.seconds === "number" ? `${set.seconds} s` : null;
  return typeof set.reps === "number" ? `${set.reps} rep${set.reps === 1 ? "" : "s"}` : null;
}

/** The five lines, in reading order, leaving out any the history cannot answer. */
export function machineStory(row: JourneyRow, history: JourneySession[]): StoryLine[] {
  const stats = computeRowStats(row, history);
  let last: { set: JourneySet; session: JourneySession } | null = null;
  for (const session of history) {
    const set = row.sets[session.id];
    if (set && set.outcome === "performed") last = { set, session };
  }
  const hits: [StoryKey, { set: JourneySet; session: JourneySession } | null][] = [
    ["first", stats.first],
    ["last", last],
    ["high", stats.high],
    ["low", stats.low],
    ["mostReps", stats.mostReps],
  ];
  return hits
    .filter((h): h is [StoryKey, { set: JourneySet; session: JourneySession }] => h[1] !== null)
    .map(([key, hit]) => ({
      key,
      label: LABEL[key],
      weight: hit.set.weight,
      effort: effortOf(hit.set),
      date: hit.session.date,
    }));
}
