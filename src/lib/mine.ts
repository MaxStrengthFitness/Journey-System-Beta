/**
 * ONE "MINE" EVERYWHERE (the Atlas answers, Oct 2 2026).
 *
 * AJ: "we need to find a mine rule for all the areas" — and, for the label,
 * "Mine could be changed With 'My X' for the category". So:
 *
 *   A client is yours if she is BOOKED WITH YOU, or you COACHED HER IN THE
 *   LAST 60 DAYS.
 *
 * Every screen that splits clients into "yours" and "everyone's" asks this
 * one function: the Hub's Opportunities (My clients), the Client Directory
 * (My clients), My Profile (My clients) and Relay's follow-ups (My clients'
 * dates). The Hub's Focus is the same rule's first half — your column is the
 * clients booked with you — and is labelled My day.
 *
 * WHERE THE FACTS COME FROM — no new read
 * ---------------------------------------
 *   booked with you   the caller says so: each screen holds a different
 *                     window of bookings (the Hub its day, the Directory the
 *                     next eight days), and decides "with you" with
 *                     `bookedWithMe` (client-directory/row.ts), the standing
 *                     week's rule (the id when the sync wrote one, the name
 *                     when it didn't, the studio rotation nobody's).
 *   coached lately    the nightly renewal record's `coachIds`: everyone who
 *                     coached her in the last 60 days (renewals/engine.ts).
 *                     A session finished today joins it tonight.
 *
 * Kaizen, the top trainer and "ever trained" are NOT mine: the Kaizen Roster
 * has its own chip, and a client you last saw a year ago is not yours today.
 *
 * PURE — no React, no Firestore, no clock.
 */

/** How far back "coached by you" reaches. The nightly record's window. */
export const MINE_COACHED_DAYS = 60;

/** The rule in a sentence, for the one line under a "My clients" view. */
export const MINE_RULE = `booked with you, or coached by you in the last ${MINE_COACHED_DAYS} days`;

/** "My clients: booked with you, or coached by you in the last 60 days." */
export function mineDefinition(thing = "clients"): string {
  return `My ${thing}: ${MINE_RULE}.`;
}

/** The label for a "mine" view of `thing`: "My clients", "My day". */
export function myLabel(thing: string): string {
  return `My ${thing}`;
}

/** The part of a client this rule reads. */
export interface MineClient {
  renewal?: { coachIds?: unknown } | null;
}

/** Coached by any of your ids in the last 60 days (the nightly record's coachIds). */
export function coachedByMeLately(client: MineClient | null | undefined, myIds: Iterable<string>): boolean {
  const coachIds = (client?.renewal as { coachIds?: unknown } | null | undefined)?.coachIds;
  if (!Array.isArray(coachIds) || coachIds.length === 0) return false;
  for (const id of myIds) {
    if (id && coachIds.includes(id)) return true;
  }
  return false;
}

/**
 * Is this client yours? Booked with you (the caller's bookings, already
 * judged), or coached by you in the last 60 days. `myIds` is every id you go
 * by (`myTrainerIds`): older accounts' sessions carry another.
 */
export function isMine(
  client: MineClient | null | undefined,
  myIds: Iterable<string>,
  opts: { bookedWithMe?: boolean } = {},
): boolean {
  if (opts.bookedWithMe) return true;
  return coachedByMeLately(client, myIds);
}
