/**
 * WHAT A HUB CARD SHOWS (calm Hub round, Sep 28 2026). Pure: card-marks.test.ts.
 *
 * The card reads the SAME moments as the Opportunities list and the peek
 * (hub-opportunities/moments-today.ts), so the grid and the list can never
 * disagree; the old card's own rules (every 25th session, 21 calendar days
 * for "back", birthdays counted from today) are retired with it.
 *
 * Research-hub §5 and §7, and the prototype AJ picked:
 *   - Read first (the Critical triangle) has a slot of its own beside the
 *     name. It is the only red on the grid.
 *   - Then at most TWO glyphs, in the Key's order (Watch › Welcome ›
 *     Celebrate › Renew), and "+N" for the rest. The +N and every glyph are
 *     explained in words in the peek, never in a hover.
 *   - A glyph may carry a WORD beside it on a roomy card, but only a word
 *     that is fine to say with the client standing at the iPad: "100th",
 *     "turns 80", "1st session", "back", "Consult". A Pulse flag, a waiver or
 *     a renewal talk is a glyph alone; its words live in the peek and the
 *     list, which a trainer opens on purpose (rule 9: a shared screen shows
 *     little).
 */
import type { Client, ScheduleEntry } from "../../types";
import {
  sessionNumberFor,
  type Moment,
  type MomentFamily,
  type MomentKind,
  type MomentsTodayInput,
  type RunSheetEntry,
} from "../hub-opportunities/moments-today";

/** Glyphs on a card before the rest fold into "+N" (research-hub §7, rule 4). */
export const CARD_MAX_GLYPHS = 2;

export interface CardGlyph {
  kind: MomentKind;
  family: MomentFamily;
  /** A word the card may say beside the glyph when there is room, or null. */
  word: string | null;
  /** The whole words, for its label (a screen reader, the peek). */
  label: string;
}

export interface CardMarks {
  /** Read first: the note's words, whole, when a Critical or priority note matters that day. */
  critical: string | null;
  /** The glyphs the card shows, in the Key's order. */
  glyphs: CardGlyph[];
  /** How many more the "+N" stands for. */
  more: number;
  /** What the "+N" stands for, in words. */
  moreLabel: string | null;
}

const EMPTY: CardMarks = { critical: null, glyphs: [], more: 0, moreLabel: null };

export interface SayableOptions {
  /**
   * The card is in YOUR column, read in words (the focus column, hub cherry
   * round): "first with you" is fine to say out loud there. Still never a
   * Pulse flag, a waiver or a renewal talk: those stay a glyph, their words
   * in the peek.
   */
  yours?: boolean;
}

/**
 * The word a card may say out loud for a moment, or null for a glyph alone.
 * Built from the moment's own chip, so the card and the list use one set of
 * words.
 */
export function sayableWord(m: Moment, { yours = false }: SayableOptions = {}): string | null {
  switch (m.kind) {
    case "milestone":
      // "100th today" on the list; the card sits on its own day already.
      return m.chip.replace(/ today$/, "");
    case "early-session":
      return m.chip === "First session" ? "1st session" : m.chip;
    case "consult":
      return "Consult";
    case "back":
      return "back";
    case "birthday": {
      // Only a decade said aloud ("turns 80"); any other birthday is the cake alone.
      const turns = /^Turns (\d+)/.exec(m.chip);
      return turns ? `turns ${turns[1]}` : null;
    }
    case "first-with-trainer":
      // In your column the trainer is you.
      return yours ? "first with you" : null;
    default:
      return null;
  }
}

function labelOf(m: Moment): string {
  return m.words ?? m.chip;
}

export function cardMarks(
  moments: ReadonlyArray<Moment> | null | undefined,
  max: number = CARD_MAX_GLYPHS,
  opts: SayableOptions = {},
): CardMarks {
  if (!moments || moments.length === 0) return EMPTY;
  const critical = moments.find((m) => m.family === "read-first");
  const rest = moments.filter((m) => m.family !== "read-first");
  // WHICH marks make the card is the Key's order (importance); among them,
  // one that can say a word goes first, where a roomy card has space for it.
  const chosen = rest.slice(0, Math.max(0, max)).map((m) => ({ kind: m.kind, family: m.family, word: sayableWord(m, opts), label: labelOf(m) }));
  const worded = chosen.findIndex((g) => g.word !== null);
  if (worded > 0) chosen.unshift(...chosen.splice(worded, 1));
  const folded = rest.slice(chosen.length);
  return {
    critical: critical ? labelOf(critical) : null,
    glyphs: chosen,
    more: folded.length,
    moreLabel: folded.length > 0 ? folded.map(labelOf).join(", ") : null,
  };
}

/**
 * The day's usual service: the name most of the day's bookings carry
 * ("1:1 Strength Training" at Westlake). AJ's Mindbody screenshots, Sep 28:
 * it repeated on nearly every block, all day. A card names its service only
 * when it ISN'T the usual one (a new client consult has its own glyph). Asked
 * of the day's client bookings; with fewer than two it claims nothing.
 */
export function usualServiceOf(bookings: ReadonlyArray<{ serviceName?: string | null; sessionType?: string | null; clientName?: string | null }>): string | null {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    if (/unavailab/i.test(b?.clientName ?? "")) continue;
    const name = (b?.serviceName || b?.sessionType || "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 1;
  for (const [name, n] of counts) {
    if (n > most) {
      best = name;
      most = n;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* The number in the corner                                            */
/* ------------------------------------------------------------------ */

/**
 * The number THIS booking will be, or null when it may not be quoted. Her
 * entry holds the number of her first booking that day; a second booking the
 * same day (training at nine, an InBody scan at four) is asked on its own,
 * with the engine's own rule, so the card and the list agree.
 */
export function bookingSessionNumber(
  entry: RunSheetEntry | null | undefined,
  client: Client | null | undefined,
  booking: ScheduleEntry,
  input: MomentsTodayInput | null | undefined,
): number | null {
  if (!entry || !client || entry.sessionNumber === null) return null;
  const same = entry.booking === booking || (!!booking.id && entry.booking.id === booking.id);
  if (same || !input) return entry.sessionNumber;
  return sessionNumberFor(client, booking, input, true);
}

/**
 * "New to Journey" (AJ, Sep 22 2026): Journey holds no session of hers yet
 * and can't quote her number, because her story began before the studio
 * moved onto Journey. True, and it never claims she is new to the STUDIO.
 * A consultation says so itself.
 */
export function isNewToJourney(entry: RunSheetEntry | null | undefined, client: Client | null | undefined): boolean {
  if (!entry || !client || entry.sessionNumber !== null) return false;
  if (entry.moments.some((m) => m.kind === "consult")) return false;
  const count = typeof client.sessionCount === "number" && Number.isFinite(client.sessionCount) ? client.sessionCount : 0;
  return count === 0;
}
