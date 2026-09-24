/**
 * What the Save bar says — the pure half of `SaveBar.tsx`.
 *
 * Client codex, Sep 2026. The record's editors are spread over seven pages,
 * and one sticky Save bar collects every unsaved field. A trainer who edits
 * Occupation on FORD and then walks to Account must still be told where the
 * edit is, so the bar names the page and the card:
 *
 *   1 unsaved change · FORD · Occupation
 *   3 unsaved changes · FORD · Occupation, Body & Pulse · Build
 *
 * The places come from the shell's FIELD_HOME map (one per dirty field, in
 * page order, de-duplicated). Past three places the rest are counted, not
 * listed, so the bar stays short enough to sit at the bottom of a portrait
 * iPad without covering the page.
 */
import { RECORD_PAGES, type RecordAnchor, type RecordPage } from "../../client-profile/profile-nav";
import { joinDots, plural } from "./text";

/** One place an unsaved field lives: the page, the card's label and its anchor. */
export interface SaveBarPlace {
  /** The card, in the page's own words: "Occupation", "Build". */
  label: string;
  page: RecordPage;
  anchor?: RecordAnchor;
}

/** How many places are named before the rest are counted. */
export const SAVE_BAR_PLACES_SHOWN = 3;

export function pageLabel(page: RecordPage): string {
  return RECORD_PAGES.find((p) => p.id === page)?.label ?? page;
}

/** "FORD · Occupation" — or just "Story" when the card is the page. */
export function placeLabel(place: SaveBarPlace): string {
  const pageName = pageLabel(place.page);
  const card = place.label.trim();
  return !card || card === pageName ? pageName : joinDots([pageName, card]);
}

/** The Save bar's sentence. Empty when nothing is unsaved. */
export function saveBarSentence(count: number, where: readonly SaveBarPlace[]): string {
  if (!(count > 0)) return "";
  const head = plural(count, "unsaved change");
  const names: string[] = [];
  for (const place of where) {
    const name = placeLabel(place);
    if (!names.includes(name)) names.push(name);
  }
  if (names.length === 0) return head;
  const shown = names.slice(0, SAVE_BAR_PLACES_SHOWN);
  const rest = names.length - shown.length;
  const list = rest > 0 ? `${shown.join(", ")}, and ${plural(rest, "more place", "more places")}` : shown.join(", ");
  return `${head} · ${list}`;
}
