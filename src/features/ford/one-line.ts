/**
 * IN ONE LINE — the sentence a new trainer should read first about a client.
 *
 * Client codex, Sep 2026 (AJ's decision 3a). "Retired hygienist, pickleball
 * regular, walking the Camino with Tom in May." It is written by the team —
 * anyone at her home studio may rewrite it, last writer wins, with who and
 * when shown under it — and it sits at the top of her FORD page and on her
 * Overview.
 *
 * WHERE IT LIVES, AND WHY THERE. One FORD document with a FIXED id,
 * `clients/{clientId}/ford/one-line`:
 *   - not on the client document: a cross-train studio can read that, and a
 *     digest of her home life is FORD's to keep (firestore.rules, the ford
 *     block, reads only for trainers of the stamped studio);
 *   - not a collection of its own: that is a rules change, a deploy and one
 *     more listener, for nothing — the ONE FORD listener already delivers it,
 *     because it is stamped with the same studio every detail is
 *     (`fordStudioIdOf`);
 *   - stored `isArchived: true`, `pillar: null`, `kind: "one-line"`, so every
 *     existing reader of details skips it: the tray and the rollup
 *     (`groupByPillar`, `summariseFord`), Coming up (`upcomingFord`), the
 *     Delight queue, the post-session sweep, and an old iPad bundle still
 *     running last week's code. `useClientFord` takes it out of the list
 *     before any of them sees it (`splitOneLine`).
 *
 * 120 characters: about one line at 17px across the Overview's FORD panel in
 * landscape. The rules allow a FORD body of 2,000; this cap is the app's.
 *
 * Pure: one-line.test.ts.
 */
import { shortDate, toDate, type FordEntry } from "./types";

/** The document id. There is one line per client, and this is it. */
export const FORD_ONE_LINE_ID = "one-line";

/** The longest line, in characters. */
export const ONE_LINE_MAX = 120;

/**
 * What a typed line is saved as: one line (a newline becomes a space), runs
 * of spaces collapsed, trimmed, and cut at 120 characters with no ellipsis —
 * the input already stops at 120, so the cut is only ever a paste. "" when
 * nothing is left: saving "" clears the line.
 */
export function normaliseOneLine(text: string | null | undefined): string {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim().slice(0, ONE_LINE_MAX).trim();
}

/**
 * Whether a FORD document is a one-line document rather than a detail: the
 * fixed id, or `kind: "one-line"` (a copy under another id — a hand-made
 * restore, a script — is never drawn as a detail either). Only the document
 * AT the fixed id is the client's line; `splitOneLine` drops any other.
 */
export function isOneLineDoc(entry: Pick<FordEntry, "id"> & Partial<Pick<FordEntry, "kind">>): boolean {
  return entry.id === FORD_ONE_LINE_ID || entry.kind === "one-line";
}

/**
 * Take the one-line document out of a client's FORD documents. `details` is
 * everything else, in the order given. `oneLine` is null when there is no
 * such document or its line was cleared (an empty body): an empty line is no
 * line, and nothing may draw it.
 */
export function splitOneLine(docs: readonly FordEntry[]): { oneLine: FordEntry | null; details: FordEntry[] } {
  let oneLine: FordEntry | null = null;
  const details: FordEntry[] = [];
  for (const doc of docs) {
    if (!isOneLineDoc(doc)) details.push(doc);
    else if (doc.id === FORD_ONE_LINE_ID) oneLine = doc;
  }
  if (oneLine && normaliseOneLine(oneLine.body) === "") oneLine = null;
  return { oneLine, details };
}

export interface OneLineView {
  /** The sentence, as saved. */
  text: string;
  /** Who wrote it last, in full; null when the document names nobody. */
  byName: string | null;
  /** When it was last written. */
  at: Date | null;
}

/** What a screen draws for the line; null when there is none. */
export function oneLineView(entry: FordEntry | null | undefined): OneLineView | null {
  if (!entry) return null;
  const text = normaliseOneLine(entry.body);
  if (!text) return null;
  return { text, byName: entry.authorName?.trim() || null, at: toDate(entry.occurredAt) };
}

/**
 * The quiet line under it: "Written by the team · last by Jess Moreno, Mar 15"
 * ("…, Mar 15, 2025" in another year). The whole name, never cut. Without a
 * name or a date, only what is known.
 */
export function oneLineMeta(view: OneLineView, now: Date): string {
  const date = shortDate(view.at, now);
  const last = view.byName ? `last by ${view.byName}${date ? `, ${date}` : ""}` : date ? `last written ${date}` : null;
  return last ? `Written by the team · ${last}` : "Written by the team";
}
