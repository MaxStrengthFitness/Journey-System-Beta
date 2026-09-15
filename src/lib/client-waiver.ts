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
