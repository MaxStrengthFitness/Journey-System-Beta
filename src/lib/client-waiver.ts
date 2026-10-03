/**
 * THE LIABILITY WAIVER — what the app can honestly say about it.
 *
 * Master Sync round (Sep 2026). Screens used to read `isLiabilityReleased`
 * as a plain truthy test, so a client whose waiver had never been synced from
 * Mindbody (the field absent) read "Not on file" in warning colours while
 * Mindbody had it signed. Absent is not "no": it is "we haven't asked". A
 * confident wrong answer is worse than a missing one (CLAUDE.md).
 *
 *   true            → signed (with the agreement date when we have one)
 *   false           → Mindbody says it is not signed
 *   null/undefined  → unknown: never synced
 *
 * The date is a Mindbody date: stored as the UTC reading of Mindbody's
 * zoneless wall time (webhook and Master Sync alike), so it is formatted in
 * UTC to give back the calendar day Mindbody showed (lib/mindbody-dates.ts).
 */

import { formatMindbodyDate, toDateSafe, type FirestoreDateLike } from "./mindbody-dates";

export type WaiverStateKind = "signed" | "not-signed" | "unknown";

export interface WaiverState {
  state: WaiverStateKind;
  /** When the waiver was agreed to; null when not signed or not known. */
  date: Date | null;
  /** Short, for a chip: "Signed Mar 20, 2019" · "Not signed" · "Not synced yet". */
  label: string;
  /** One sentence, for a tooltip or a detail line. */
  detail: string;
  /** Colour hint: only a definite "not signed" is a warning. */
  tone: "ok" | "warn" | "neutral";
}

export interface WaiverSource {
  isLiabilityReleased?: boolean | null;
  liabilityAgreementDate?: unknown;
}

/**
 * DOES MINDBODY HOLD THIS STUDIO'S WAIVERS AT ALL? (hub fixes, Oct 1 2026)
 *
 * AJ's Strongsville Hub, Oct 1: every card carried "No waiver signed" and the
 * Watch chip read 32, every booking that day. Journey never writes
 * `isLiabilityReleased` itself: the only writers are Mindbody's own answer
 * (Master Sync's `Liability.IsReleased`, the webhook's client.updated). So a
 * whole day of "false" is Mindbody saying its liability release was never
 * ticked for anyone, which is what a studio that keeps its waivers on paper
 * (or anywhere but Mindbody) looks like. Mindbody's "no" means something only
 * where Mindbody has ever said "yes": with no client of the studio signed in
 * Mindbody, "not signed" is a fact about where the studio files waivers, not
 * about the client, and the Hub says nothing (unknown), never a flag on every
 * card.
 *
 * ONE "YES" IS NOT ENOUGH (Oct 3 2026). AJ, on Strongsville's Hub: "a lot of
 * these clients have their waivers signed". Production that day: Mindbody
 * said "signed" for 2 of Strongsville's 139 clients (both the same day in
 * April 2025), 1 of Willoughby's 244, 1 of Solon's 131 and none of
 * westlake's 287, and "not signed" for nearly everyone else. One stray "yes"
 * had switched the old guard off and every card was flagged again. A studio
 * keeps its waivers in Mindbody when Mindbody says "signed" for at least
 * half the clients it answered for, and for at least five of them; anywhere
 * else its "not signed" is about where the studio files waivers.
 *
 * @param clients the clients the screen holds for the studio (the roster).
 */
export const WAIVERS_KEPT_SHARE = 0.5;
export const WAIVERS_KEPT_MIN_SIGNED = 5;

export function waiversKeptInMindbody(clients: Iterable<WaiverSource> | null | undefined): boolean {
  if (!clients) return false;
  let signed = 0;
  let answered = 0;
  for (const c of clients) {
    if (c?.isLiabilityReleased === true) signed++;
    if (c?.isLiabilityReleased === true || c?.isLiabilityReleased === false) answered++;
  }
  return signed >= WAIVERS_KEPT_MIN_SIGNED && signed >= answered * WAIVERS_KEPT_SHARE;
}

/**
 * The waiver's state for a screen that FLAGS it (the Hub's Watch mark): as
 * `waiverState`, except that a "not signed" at a studio whose waivers aren't
 * kept in Mindbody (`waiversKeptInMindbody`) is unknown.
 */
export function waiverFlagState(client: WaiverSource | null | undefined, keptInMindbody: boolean): WaiverState {
  const state = waiverState(client);
  if (state.state !== "not-signed" || keptInMindbody) return state;
  return waiverState(null);
}

/**
 * The waiver as a client's PROFILE says it (Oct 3 2026, AJ: "yes" to "Not
 * kept in Mindbody"). A single client's screen doesn't hold the studio's
 * roster, so it can't tell whether the studio files waivers in Mindbody at
 * all (`waiversKeptInMindbody`), and on Oct 3 2026 none of the four studios
 * did. So Mindbody's "not signed" is said as a plain fact about Mindbody,
 * "Not in Mindbody", in no warning colour; signed and unknown are as
 * `waiverState` says. The Hub, which holds the roster, still flags a missing
 * waiver at a studio that does keep them there (`waiverFlagState`).
 */
export function waiverProfileState(client: WaiverSource | null | undefined): WaiverState {
  const state = waiverState(client);
  if (state.state !== "not-signed") return state;
  return {
    ...state,
    label: "Not in Mindbody",
    detail: "Mindbody has no signed liability waiver for this client. If your studio keeps waivers on paper or elsewhere, it's there.",
    tone: "neutral",
  };
}

export function waiverState(client: WaiverSource | null | undefined): WaiverState {
  const released = client?.isLiabilityReleased;

  if (released === true) {
    const date = toDateSafe(client?.liabilityAgreementDate as FirestoreDateLike);
    const day = date ? formatMindbodyDate(date) : null;
    return {
      state: "signed",
      date,
      label: day ? `Signed ${day}` : "Signed",
      detail: day
        ? `Liability waiver signed in Mindbody on ${day}.`
        : "Liability waiver signed in Mindbody.",
      tone: "ok",
    };
  }

  if (released === false) {
    return {
      state: "not-signed",
      date: null,
      label: "Not signed",
      detail: "Mindbody has no signed liability waiver for this client.",
      tone: "warn",
    };
  }

  return {
    state: "unknown",
    date: null,
    label: "Not synced yet",
    detail: "Journey hasn't read this client's waiver from Mindbody yet. Sync with Mindbody to check.",
    tone: "neutral",
  };
}
