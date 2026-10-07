/**
 * OPERATIONS → RENEWALS — a roster client's lane: the one rule the Pipeline,
 * Today, Week and Month count by. Pure: lanes.test.ts.
 *
 * Found on Oct 6 2026 while building Running low, and fixed the same day on
 * AJ's yes to the brief-back. The pipeline read its own window of clients
 * (packages ending between six months ago and the planning horizon,
 * `renewal.focusDate`), so a client with 8 left at a quarter a week, running
 * out next May, never reached Talk now, while Today, counting from the
 * roster, did. And none of them left out a client a leader had marked
 * Inactive. Now every count reads the roster the app already holds, through
 * this file:
 *
 *   HOME ONLY   the pipeline is the home studio's: a visitor booked here is
 *               their own studio's renewal (Running low's rule too).
 *   INACTIVE    out of the lanes there is something to do in (Before the
 *               charge, Talk now, Coming up), by Running low's rule
 *               (`inactiveOnRecord`): Mindbody's flag, a leader's mark that
 *               still holds, or past the studio's Inactive line with
 *               nothing booked. Lapsed and Away are untouched: Renewals'
 *               lost list stays its own list (the inactive round, Oct 1
 *               2026: "Organized separate lists"). A failed read of the
 *               marks hides nobody: the marks are then empty.
 *   AWAY        as it was (AJ, Oct 6 2026: "Keep Away as it is"): only a
 *               package ending in the window the pipeline's query used to
 *               read. Month lists Away by the month the package ends, so it
 *               asks without the window.
 */

import { addDays } from "../../client-history/model";
import { LAPSED_LOOKBACK_DAYS, horizonEnd, laneOf, type PipelineLane } from "../../renewals/pipeline";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "../../renewals/types";
import type { InactiveMark } from "../journey/inactive";
import { inactiveOnRecord } from "./running-low";
import type { Client } from "../../../types";

export interface RenewalLaneContext {
  studioId: string;
  settings: RenewalSettings;
  today: string;
  /** The leaders' inactive marks by client. Empty when the read failed: a failed read hides nobody. */
  inactiveMarks: ReadonlyMap<string, Pick<InactiveMark, "day">>;
  /** The studio's Inactive line: days since the last visit, with nothing booked. */
  inactiveDays: number;
}

/** The lanes there is something to do in. An Inactive client leaves these, and only these. */
export const TO_DO_LANES: ReadonlySet<PipelineLane> = new Set<PipelineLane>(["before-charge", "talk-now", "coming-up"]);

/** The client's nightly record when they are this studio's own; null for a visitor or a client with no record yet. */
export function homeRecord(c: Client, studioId: string): RenewalSnapshot | null {
  if (!c.id || c.homeStudioId !== studioId) return null;
  return (c.renewal as RenewalSnapshot | undefined) ?? null;
}

function isInactive(c: Client, s: RenewalSnapshot, ctx: RenewalLaneContext): boolean {
  return inactiveOnRecord(c, s, ctx.inactiveMarks.get(c.id as string) ?? null, ctx.today, ctx.inactiveDays);
}

/** The window the pipeline's query read: a package ending between six months ago and the horizon. */
export function inPipelineWindow(s: Pick<RenewalSnapshot, "focusDate">, settings: RenewalSettings, today: string): boolean {
  return Boolean(s.focusDate && s.focusDate >= addDays(today, -LAPSED_LOOKBACK_DAYS) && s.focusDate <= horizonEnd(settings, today));
}

/**
 * The client's lane on the Pipeline, Today and Week, or null. Month passes
 * `awayWindow: false`.
 */
export function renewalLane(
  c: Client,
  cycle: RenewalCycle | null | undefined,
  ctx: RenewalLaneContext,
  opts: { awayWindow?: boolean } = {},
): PipelineLane | null {
  const s = homeRecord(c, ctx.studioId);
  if (!s) return null;
  const lane = laneOf(s, cycle, ctx.settings, ctx.today);
  if (!lane) return null;
  if (lane === "away") return opts.awayWindow === false || inPipelineWindow(s, ctx.settings, ctx.today) ? lane : null;
  if (TO_DO_LANES.has(lane) && isInactive(c, s, ctx)) return null;
  return lane;
}

/**
 * Whose conversations to read before the lanes can be told: every home
 * client a lane could hold, before the conversation and the Inactive rule
 * are applied. A conversation can only take a client out of a lane or move
 * them to Lapsed (recorded as lost), never bring in one with no lane, so
 * this is enough; and an Inactive client recorded as lost is on Lapsed,
 * which is why the Inactive rule waits for the conversation.
 */
export function mayHaveLane(c: Client, ctx: Pick<RenewalLaneContext, "studioId" | "settings" | "today">): boolean {
  const s = homeRecord(c, ctx.studioId);
  return Boolean(s && laneOf(s, null, ctx.settings, ctx.today));
}

/**
 * Left off a renewals list as Inactive (Month): Inactive, and not on the
 * Lapsed or Away lane, which Inactive leaves untouched. A renewal already
 * recorded or a timing nobody knows goes with them.
 */
export function leftOutAsInactive(c: Client, cycle: RenewalCycle | null | undefined, ctx: RenewalLaneContext): boolean {
  const s = homeRecord(c, ctx.studioId);
  if (!s || !isInactive(c, s, ctx)) return false;
  const lane = laneOf(s, cycle, ctx.settings, ctx.today);
  return lane !== "lapsed" && lane !== "away";
}
