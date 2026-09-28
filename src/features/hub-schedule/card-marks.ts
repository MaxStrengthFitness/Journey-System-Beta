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
import type { Moment, MomentFamily, MomentKind } from "../hub-opportunities/moments-today";

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

/**
 * The word a card may say out loud for a moment, or null for a glyph alone.
 * Built from the moment's own chip, so the card and the list use one set of
 * words.
 */
export function sayableWord(m: Moment): string | null {
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
    default:
      return null;
  }
}

function labelOf(m: Moment): string {
  return m.words ?? m.chip;
}

export function cardMarks(moments: ReadonlyArray<Moment> | null | undefined, max: number = CARD_MAX_GLYPHS): CardMarks {
  if (!moments || moments.length === 0) return EMPTY;
  const critical = moments.find((m) => m.family === "read-first");
  const rest = moments.filter((m) => m.family !== "read-first");
  const shown = rest.slice(0, Math.max(0, max));
  const folded = rest.slice(shown.length);
  return {
    critical: critical ? labelOf(critical) : null,
    glyphs: shown.map((m) => ({ kind: m.kind, family: m.family, word: sayableWord(m), label: labelOf(m) })),
    more: folded.length,
    moreLabel: folded.length > 0 ? folded.map(labelOf).join(", ") : null,
  };
}
