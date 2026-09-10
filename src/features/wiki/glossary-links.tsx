import type { ReactNode } from "react";

/**
 * GLOSSARY AUTO-LINKING — the thing that makes prose feel like a wiki.
 *
 * Round: Wiki Redesign Phase 3, Sep 2026.
 *
 * The Academy is explicit that its exact terms are the ones to use, and it
 * ships a glossary of them. Before this, that glossary was a tab you had to
 * remember existed: a trainer reading "hold the turnaround" in module 6 had
 * to leave the page, find the glossary, scroll to T. So the term is linked
 * where it is used.
 *
 * THREE RULES, ALL OF WHICH EXIST TO STOP THIS BECOMING NOISE
 * ----------------------------------------------------------
 * 1. WHOLE WORDS ONLY. "Rep" must not match inside "repeat" or "reported".
 *    Matching is done on word boundaries, and terms shorter than MIN_LENGTH
 *    are skipped entirely — a two-letter term matches everywhere and means
 *    nothing.
 *
 * 2. LONGEST TERM WINS. "Continuous tension" and "tension" can both be in the
 *    glossary. Sorting the pattern longest-first means the alternation prefers
 *    the specific term, so the reader gets the definition that was written for
 *    that phrase.
 *
 * 3. ONCE PER TERM PER PASSAGE, AND CAPPED. A page where every third word is a
 *    link is harder to read than one with none — the links stop carrying
 *    information. Each term links on its FIRST appearance only, and no passage
 *    gets more than MAX_LINKS. That is how print encyclopaedias have always
 *    done it, and for the same reason.
 *
 * The regex is built ONCE per glossary and memoised by the caller, not rebuilt
 * per paragraph: a 200-term alternation compiled 400 times while a 6,400-word
 * module renders is real, measurable jank on an iPad.
 */

/** Below this, a term matches too much to be worth linking. */
const MIN_LENGTH = 4;
/** Per passage. Past this the links stop being signal. */
const MAX_LINKS = 6;

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface GlossaryMatcher {
  /** Null when the glossary is empty or has no linkable terms. */
  pattern: RegExp | null;
  /** Lower-cased term -> the canonical entry. */
  byTerm: Map<string, GlossaryTerm>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the matcher. Call once per glossary, memoise the result.
 *
 * Terms with a trailing parenthetical ("Turnaround (bottom)") are indexed on
 * the bare word too, because that is what appears in running prose.
 */
export function buildGlossaryMatcher(
  glossary: GlossaryTerm[] | null | undefined,
): GlossaryMatcher {
  const byTerm = new Map<string, GlossaryTerm>();
  if (!glossary || glossary.length === 0) return { pattern: null, byTerm };

  for (const entry of glossary) {
    const full = entry.term.trim();
    if (full.length >= MIN_LENGTH) byTerm.set(full.toLowerCase(), entry);
    const bare = full.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (bare.length >= MIN_LENGTH && !byTerm.has(bare.toLowerCase())) {
      byTerm.set(bare.toLowerCase(), entry);
    }
  }
  if (byTerm.size === 0) return { pattern: null, byTerm };

  const alternation = [...byTerm.keys()]
    // Longest first — see rule 2. Alternation in JS is ordered, not greedy.
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");

  return {
    // \b at both ends is rule 1. `gi` so one pass finds every occurrence and
    // casing in the prose does not have to match the glossary's.
    pattern: new RegExp(`\\b(${alternation})\\b`, "gi"),
    byTerm,
  };
}

/**
 * Split one passage into text and glossary links.
 *
 * Returns a plain string when nothing matched, so the common case allocates
 * no array and React renders a text node rather than a fragment of one.
 */
export function linkGlossary(
  text: string,
  matcher: GlossaryMatcher,
  onOpen: (term: GlossaryTerm) => void,
): ReactNode {
  if (!matcher.pattern) return text;

  // A /g regex carries lastIndex across calls. Resetting is not optional when
  // the same compiled pattern is reused for every paragraph on the page —
  // without it, matches are silently skipped in alternating paragraphs.
  matcher.pattern.lastIndex = 0;

  const out: ReactNode[] = [];
  const linked = new Set<string>();
  let cursor = 0;
  let count = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.pattern.exec(text)) !== null) {
    if (count >= MAX_LINKS) break;
    const raw = match[0];
    const key = raw.toLowerCase();
    const entry = matcher.byTerm.get(key);
    // Rule 3: first appearance only.
    if (!entry || linked.has(key)) continue;

    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    out.push(
      <button
        type="button"
        className="wk__term"
        key={`${key}-${match.index}`}
        onClick={() => onOpen(entry)}
        /* The definition is also the title, so a hover on a desktop answers
           the question without a tap and without a popover to dismiss. */
        title={entry.definition}
      >
        {raw}
      </button>,
    );
    cursor = match.index + raw.length;
    linked.add(key);
    count += 1;
  }

  if (out.length === 0) return text;
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
