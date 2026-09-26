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
  /**
   * Mindbody's lifetime visit count at the site. It arrives with a Master Sync
   * and on the webhook's client.updated, not on the schedule pull; a client
   * who has never been synced has none, and reads as unknown.
   */
  clientsNumberOfVisitsAtSite?: number;
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
      mindbodyVisits: client.clientsNumberOfVisitsAtSite ?? null,
    },
    cutover ?? null,
  );
}

/**
 * MAY A SCREEN PUT A SESSION NUMBER ON THIS CLIENT?
 *
 * `client.sessionCount` is what Journey can SEE plus whatever a person
 * stated in `priorHistory` (types.ts). So it is trustworthy when Journey
 * holds the whole story, or when somebody has written down the rest.
 *
 * It is NOT trustworthy for the migration client nobody has got to yet: her
 * first session predates her studio's cutover, so coverage is "partial",
 * but no total has been stated and the count is only what Journey has seen.
 * "partial" covers both of those, and the prior record is what separates
 * them - which is why this takes the client as well as the coverage.
 */
export function canQuoteSessionNumber(
  client: { priorHistory?: unknown } | null | undefined,
  coverage: HistoryCoverage,
): boolean {
  if (!client) return false;
  return coverage === "complete" || !!client.priorHistory;
}

/**
 * The studio's cutover day, from whatever list of studios a screen holds.
 * Returns null - which reads as unknown - when the studio is not loaded yet,
 * rather than guessing at another studio's date.
 */
export function cutoverOf(
  // `Studio.id` is optional in types.ts, so this takes it optional too - a
  // studio with no id can never match and simply falls through to null.
  studios: ReadonlyArray<{ id?: string; journeyCutoverDate?: string | null }> | null | undefined,
  studioId: string | null | undefined,
): string | null {
  if (!studios || !studioId) return null;
  return studios.find((s) => s.id === studioId)?.journeyCutoverDate ?? null;
}

/**
 * The cutover of the client's HOME studio - never the iPad's.
 *
 * Coverage is a fact about the CLIENT: where her history lives depends on
 * when the studio she trains at moved onto Journey, not on which studio's
 * iPad happens to be open. A Strongsville client seen on a Westlake iPad
 * used to be judged by Westlake's day. The home is read the way the rules
 * read it (`homeStudioId`, else the older `studioId`); a client with
 * neither gets null, which is unknown - the safe side.
 */
export function homeCutoverOf(
  studios: ReadonlyArray<{ id?: string; journeyCutoverDate?: string | null }> | null | undefined,
  client: { homeStudioId?: string | null; studioId?: string | null } | null | undefined,
): string | null {
  return cutoverOf(studios, client?.homeStudioId || client?.studioId || null);
}
