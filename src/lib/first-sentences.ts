/**
 * THE WHOLE FIRST SENTENCE — a short line that never cuts one in half.
 *
 * Client codex, Sep 2026. Several screens show a note in one line: the
 * critical line under the profile's sub-toggle ("Critical · Leg Press: stop at
 * 90° at the bottom turn."), the Overview's note rows, the how-to-coach lead.
 * They used to clip the body at a character count and add "…", which cut a
 * safety instruction mid-sentence ("stop at 90° at the bo…"). This returns
 * whole sentences instead: the first one, and then the next and the next
 * until the line holds at least `minChars` characters. The line may then wrap;
 * it is never cut, and it never ends in an ellipsis this function added.
 *
 * The result is always a PREFIX of the trimmed text, character for character,
 * so a caller can tell whether anything was left out by comparing lengths
 * (`firstSentences(t, n).length < t.trim().length`) and offer the rest one tap
 * away.
 *
 * NO REGEX LOOKBEHIND, on purpose (KNOWN-TRAPS → React, tests, dates and
 * tooling): older iPadOS Safari throws a SyntaxError when it PARSES a pattern
 * with a lookbehind group, which takes down the whole module, not one call. The
 * sentence ends are found by walking the string instead, and
 * first-sentences.test.ts reads this file to keep it that way.
 *
 * Lives in `src/lib` so the notes feature can use it without importing from
 * the client codex (INTEGRATION: the one critical-line component is Notes').
 */

/** Characters that can end a sentence. "…" deliberately cannot — see below. */
const END_MARKS = new Set([".", "!", "?"]);

/** Closing quotes and brackets that belong to the sentence they follow. */
const CLOSERS = new Set(['"', "'", "”", "’", ")", "]"]);

/**
 * Words that end in a full stop without ending a sentence even when a CAPITAL
 * follows ("Dr. Patel", "e.g. The blue one", "vs. Leg Press").
 *
 * Most abbreviations never reach this list: a full stop followed by a
 * lower-case word or a number is never read as a sentence end (see
 * `sentenceEnd`), so "7 a.m. only", "her P.T. last week" and "Fig. 2" keep
 * their sentence whether or not they are listed. The list only matters before
 * a capital, and that is the one way this function can still stop early — an
 * unlisted abbreviation followed by a capitalised word ("per Ortho. Smith
 * says"). The line then ends at the writer's own full stop; it is never cut
 * inside a word and never given an ellipsis. Add a word here when a real note
 * shows it.
 */
const ABBREVIATIONS = new Set([
  "e.g",
  "i.e",
  "eg",
  "ie",
  "vs",
  "dr",
  "mr",
  "mrs",
  "ms",
  "st",
  "jr",
  "sr",
  "prof",
  "approx",
  "dept",
  "ave",
  "fig",
  "lb",
  "lbs",
  "oz",
  "ft",
  "wk",
  "wks",
  "yr",
  "yrs",
  "mo",
  "mos",
]);

const isLetter = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
/** A lower-case letter in any alphabet (an accented one too): one whose upper case differs. */
const isLower = (c: string | undefined) => c !== undefined && c !== c.toUpperCase() && c === c.toLowerCase();
const isSpace = (c: string | undefined) =>
  c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v" || c === "\u00a0";

/** True when a list marker ("2." or "2)" and a space) starts at `at`. */
function listMarkerAt(text: string, at: number): boolean {
  let q = at;
  while (q < text.length && q - at < 3 && isDigit(text[q])) q += 1;
  if (q === at || isDigit(text[q])) return false;
  if (text[q] !== "." && text[q] !== ")") return false;
  return q + 1 >= text.length || isSpace(text[q + 1]);
}

/**
 * True when the full stop at `dot` belongs to the word before it — an
 * abbreviation ("e.g.", "Dr.") or a single letter (an initial, "the R. knee").
 */
function isAbbreviation(text: string, dot: number): boolean {
  let start = dot;
  while (start > 0 && (isLetter(text[start - 1]) || text[start - 1] === ".")) start -= 1;
  let word = text.slice(start, dot).toLowerCase();
  while (word.startsWith(".")) word = word.slice(1);
  if (!word) return false;
  if (word.length === 1 && isLetter(word)) return true;
  return ABBREVIATIONS.has(word);
}

/**
 * The index just past the sentence that starts at `from` (its end mark, any
 * closing quotes, but not the space after), or `text.length` when the text
 * runs out first. Always greater than `from`, so a caller's loop advances.
 *
 * A line break ends a sentence too: a note written as lines with no full
 * stops ("Right knee / No lunges") is read one line at a time.
 *
 * Otherwise the WORD AFTER the mark decides, because a wrong end is the
 * dangerous mistake — it prints half a safety instruction that looks whole.
 * A mark followed by a lower-case word or a number is not an end: "7 a.m.
 * only", "her P.T. last week", "Fig. 2 for the seat", `"does it pinch?"
 * before every set`. The exception is a list marker ("Seat at 6. 2. Pad
 * high"), which does start a new sentence. So an abbreviation this file does
 * not know makes the line longer, not shorter; only before a capital does the
 * ABBREVIATIONS list have to know it.
 */
function sentenceEnd(text: string, from: number): number {
  for (let j = from; j < text.length; j += 1) {
    const c = text[j];
    if (c === "\n") return j + 1;
    if (!END_MARKS.has(c)) continue;

    // A run of full stops ("...") is a trailing-off, not an end: stopping
    // there would print an ellipsis the writer did not finish.
    if (c === "." && (text[j + 1] === "." || text[j - 1] === ".")) {
      while (text[j + 1] === ".") j += 1;
      continue;
    }

    let k = j + 1;
    while (k < text.length && (END_MARKS.has(text[k]) || CLOSERS.has(text[k]))) k += 1;
    if (k >= text.length) return text.length;
    if (!isSpace(text[k])) {
      j = k - 1;
      continue;
    }

    let next = k;
    let lineBreak = false;
    while (next < text.length && isSpace(text[next])) {
      if (text[next] === "\n") lineBreak = true;
      next += 1;
    }
    if (!lineBreak) {
      const w = text[next];
      const notAnEnd =
        isLower(w) || (isDigit(w) && !listMarkerAt(text, next)) || (c === "." && isAbbreviation(text, j));
      if (notAnEnd) {
        j = k - 1;
        continue;
      }
    }
    // A list marker on its own ("1.") is not a sentence.
    if (/^\d{1,3}$/.test(text.slice(from, j).trim())) continue;
    return k;
  }
  return text.length;
}

/**
 * The first whole sentence of `text`, then further whole sentences until the
 * result is at least `minChars` long. The whole (trimmed) text when it has no
 * sentence end. Empty for empty input.
 */
export function firstSentences(text: string | null | undefined, minChars = 0): string {
  const src = (text ?? "").trim();
  if (!src) return "";
  let from = 0;
  while (from < src.length) {
    const end = sentenceEnd(src, from);
    if (end >= src.length) return src;
    const piece = src.slice(0, end).trimEnd();
    if (piece.length >= minChars && piece.length > 0) return piece;
    from = end;
  }
  return src;
}

/** True when `firstSentences(text, minChars)` leaves something out. */
export function hasMoreThanFirstSentences(text: string | null | undefined, minChars = 0): boolean {
  const src = (text ?? "").trim();
  return firstSentences(src, minChars).length < src.length;
}
