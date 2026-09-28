/**
 * WRITING DOWN THE DAYS A PULL READ IN FULL (the whole-read record, Sep 27
 * 2026). What it records, and why, is `coverage.ts`; this is the write.
 *
 * Called after the pulls Journey already makes, and only after them: the
 * background pull (features/admin/useAutoSync.ts), the header's and the
 * calendar's Refresh (features/admin/useScheduleRefresh.ts) and Operations
 * -> Mindbody's "Pull the schedule now". It asks Mindbody nothing and changes
 * nothing about the pull. All three pull the whole studio; a pull limited to
 * some trainers must never call this.
 *
 * WHAT IT COSTS (AJ, Sep 27 2026: "i just dont want a big mindbody bill or
 * firestore bill popping up"):
 *   - no read at all: an add-to-list merge (`arrayUnion`), so two iPads never
 *     overwrite each other and nothing is read first;
 *   - one small write per month the days fall in, both in one batch at a
 *     month's end, so a failure leaves nothing half-written;
 *   - never the same day twice from one iPad: `recorded` below remembers the
 *     days this iPad wrote (and holds them while the write is in flight, so a
 *     Refresh during the background pull doesn't write them again). A pull
 *     every 30 minutes writes once a day, when tomorrow becomes a new day.
 *
 * A failed write says nothing to the trainer. It is let go, and the next
 * whole pull on this iPad tries the same days again.
 */

import { arrayUnion, doc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { forgetOnSignOut } from "../sign-out/memory";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import { COVERAGE_COLLECTION, coverageWrites, daysReadInFull, readWhole, type PullAnswer } from "./coverage";

/** "{studioId}|{day}" for every day this iPad has recorded, or is recording now. */
const recorded = new Set<string>();

// Not about the person, but a module-level memory all the same, and the house
// rule is that each one registers: after a sign-out the next person's first
// whole pull writes its days once more, which is harmless (the list only adds).
forgetOnSignOut(() => recorded.clear());

const keyOf = (studioId: string, day: string) => `${studioId}|${day}`;

export interface CoverageInput {
  /** The studio the pull was for. */
  studioId: string | null | undefined;
  /** The days the pull asked Mindbody for (`yyyy-mm-dd`, inclusive, the studio's days). */
  window: { start?: string | null; end?: string | null } | null | undefined;
  /** What the pull said about itself. */
  answer: PullAnswer | null | undefined;
  /** When the pull began. */
  startedAt: Date | number;
  /** The studio's clock; Eastern when it has none. */
  timeZone?: string | null;
}

export type CoverageOutcome = "recorded" | "nothing" | "failed";

/**
 * Records the days a whole pull read, once per day per iPad. Never throws and
 * never rejects: the pull it follows has already done its job.
 */
export async function recordCoverage(input: CoverageInput): Promise<CoverageOutcome> {
  try {
    const studioId = typeof input.studioId === "string" ? input.studioId.trim() : "";
    // A studio id is one path segment.
    if (!studioId || studioId.includes("/") || !readWhole(input.answer)) return "nothing";
    const fresh = daysReadInFull(input.window, input.startedAt, input.timeZone).filter(
      (day) => !recorded.has(keyOf(studioId, day)),
    );
    if (fresh.length === 0) return "nothing";

    const keys = fresh.map((day) => keyOf(studioId, day));
    for (const key of keys) recorded.add(key);
    try {
      const batch = writeBatch(db);
      for (const { month, days } of coverageWrites(fresh)) {
        batch.set(
          doc(db, "studios", studioId, COVERAGE_COLLECTION, month),
          withoutUndefined({ days: arrayUnion(...days) }),
          { merge: true },
        );
      }
      await batch.commit();
      return "recorded";
    } catch (err) {
      // Nothing was written (a batch is all or nothing), so nothing is
      // remembered: the next whole pull on this iPad tries again.
      for (const key of keys) recorded.delete(key);
      console.warn("[coverage] could not record the days read in full; the next pull tries again", err);
      return "failed";
    }
  } catch (err) {
    console.warn("[coverage] could not work out the days read in full", err);
    return "failed";
  }
}
