/**
 * HOW MUCH OF A CLIENT'S STORY JOURNEY HOLDS - the floor screens' half.
 *
 * `lib/prior-history.ts` is the rule and the vocabulary. This is the one
 * place that turns a client document plus a studio's cutover date into the
 * answer, so five screens cannot each grow their own version of it - which
 * is exactly what happened before: the client profile did it correctly and
 * the Now Bar, the Hub card, the briefing, the post-session screen and
 * Operations -> Insights each said "first session" on their own authority.
 *
 * WHY THE DEFAULT IS "unknown"
 * ----------------------------
 * Every screen takes its coverage as an OPTIONAL prop defaulting to
 * `"unknown"`, and unknown produces the cautious wording ("Nothing
 * recorded") rather than the confident one ("Never attempted"). So a screen
 * somebody forgets to thread this through fails towards saying too little,
 * never towards calling a twelve-year client new. That direction is the
 * whole point: a confident wrong number is worse than a missing one.
 *
 * Not pure, deliberately: `studioDayKeyOf` reads the active time zone, and
 * the studio's day is what "before the cutover" is measured in. Keep
 * `prior-history.ts` itself free of imports.
 */
import { historyCoverage, type HistoryCoverage } from "./prior-history";
import { studioDayKeyOf } from "./studio-time";

/** Only the fields coverage depends on, so any client-shaped object fits. */
export interface CoverageClient {
  priorHistory?: unknown;
  historyIsComplete?: boolean;
  /** A Timestamp, a Date or a yyyy-mm-dd string - whatever the doc carries. */
  firstSessionDate?: unknown;
}

/**
 * @param cutover the studio's `journeyCutoverDate` (yyyy-mm-dd) - the day
 *   THAT studio moved onto Journey. The rollout is staggered, so it is per
 *   studio, and an unset one reads as unknown, which is the safe side.
 */
export function coverageOfClient(
  client: CoverageClient | null | undefined,
  cutover?: string | null,
): HistoryCoverage {
  if (!client) return "unknown";
  return historyCoverage(
    {
      priorHistory: client.priorHistory as never,
      historyIsComplete: client.historyIsComplete,
      firstJourneyDay: client.firstSessionDate
        ? studioDayKeyOf(client.firstSessionDate as never)
        : null,
    },
    cutover ?? null,
  );
}

/**
 * The studio's cutover day, from whatever list of studios a screen holds.
 * Returns null - which reads as unknown - when the studio is not loaded yet,
 * rather than guessing at another studio's date.
 */
export function cutoverOf(
  studios: Array<{ id: string; journeyCutoverDate?: string | null }> | null | undefined,
  studioId: string | null | undefined,
): string | null {
  if (!studios || !studioId) return null;
  return studios.find((s) => s.id === studioId)?.journeyCutoverDate ?? null;
}
