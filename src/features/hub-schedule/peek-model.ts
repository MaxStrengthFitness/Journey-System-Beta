/**
 * WHAT THE PEEK SAYS (calm Hub round, Sep 28 2026). Pure: peek-model.test.ts.
 *
 * Research-hub §6.0: a tap on a card opens a peek that says every mark in
 * words, with its proof, and holds Open profile and Start session (Hub
 * question 1's default: a peek, not the profile). It is the same content as
 * an opened Opportunities row, from the same entry, so the two can never
 * disagree:
 *
 *   - Read first, whole, in the Critical note's own colour;
 *   - every other moment as its sentence, in the Key's order ("Turns 80 on
 *     Thursday, Oct 1.", "No liability waiver signed in Mindbody.", the
 *     Wrap-up's own renewal words);
 *   - where she is: last in, her package (left in contract, extras beside
 *     it), each with "can't tell" rather than a guess;
 *   - standing context, quietly: clinical history on file (the dot that left
 *     the card), and a Critical read that couldn't be checked.
 *
 * Words on the peek are for the trainer who opened it; the grid itself shows
 * marks only (clients stand next to the iPad).
 */
import { ordinal, type MomentFamily, type MomentKind, type RunSheetEntry } from "../hub-opportunities/moments-today";

export interface PeekLine {
  kind: MomentKind;
  family: MomentFamily;
  text: string;
}

export interface PeekFact {
  label: string;
  text: string;
  /** "Can't tell yet", not a fact: drawn quietly. */
  muted: boolean;
}

export interface PeekContent {
  name: string;
  /** "9:30 – 10:00 AM · with you · her 100th session". */
  subtitle: string;
  /** Read first: the note's words, whole, or null. */
  critical: string | null;
  lines: PeekLine[];
  facts: PeekFact[];
  /** Quiet notes at the foot: clinical history on file, an unchecked Critical read. */
  notes: string[];
}

function numberWords(n: number | null): string | null {
  if (n === null || n < 1) return null;
  return n === 1 ? "her first session" : `her ${ordinal(n)} session`;
}

export function peekContent(entry: RunSheetEntry, sessionNumber: number | null = entry.sessionNumber): PeekContent {
  const critical = entry.moments.find((m) => m.family === "read-first");
  const subtitle = [entry.timeText, entry.withText, numberWords(sessionNumber)].filter(Boolean).join(" · ");
  const lines: PeekLine[] = entry.moments
    .filter((m) => m.family !== "read-first")
    .map((m) => ({ kind: m.kind, family: m.family, text: m.sentence }));
  const f = entry.facts;
  const facts: PeekFact[] = [
    { label: "Last in", text: f.lastSeen.sentence, muted: f.lastSeen.unknown },
    { label: "Package", text: f.left.sentence, muted: f.left.unknown },
  ];
  const notes: string[] = [];
  if (entry.criticalUnknown) notes.push("Couldn’t check her critical notes — her briefing shows them.");
  if (entry.clinicalOnFile) notes.push("Clinical history on file — her briefing has it.");
  return {
    name: entry.name,
    subtitle,
    critical: critical ? critical.words ?? critical.sentence : null,
    lines,
    facts,
    notes,
  };
}
