/**
 * A SET SKIPPED FOR PAIN IS A NOTE (notes round, Oct 3 2026).
 *
 * The Now Bar's "Pain or injury" skip asks "where?" ("left knee") and has
 * always saved it on the set alone, where the next trainer's briefing never
 * looks (the Sep 22 survey of the fourteen doors: "a trainer who types 'left
 * knee' mid-session has reasonably taken a note, and nobody may ever see
 * it"). AJ's hand-off puts it plainly — a note reaches "the next trainer's
 * glance and the leader's follow-up view without anyone hunting for it".
 *
 * So Finish files every pain skip still standing in the session's final log
 * as an Incident, at Heads up, about that machine: read out at her next four
 * sessions, and on the studio's leaders' list. It is written from the FINAL
 * log, never at the tap — a pain skip undone before Finish writes nothing.
 * The words name the machine and, when the trainer said where, the place;
 * the body map is read from those words only when they say it plainly
 * ("left knee", "both shoulders", "neck"), never guessed from "back".
 *
 * Pure: no React, no Firebase.
 */
import type { NoteBodyMark, NoteBodyPart } from "../../types/journal";
import { normaliseBodyMarks } from "./body-parts";

/** Each part's plain words, singular and plural. "Back" alone is not here: upper or lower, it doesn't say. */
const PART_WORDS: readonly [NoteBodyPart, RegExp][] = [
  ["neck", /\bneck\b/],
  ["shoulder", /\bshoulders?\b/],
  ["chest", /\bchest\b/],
  ["upper_back", /\bupper[\s-]back\b/],
  ["lower_back", /\blower[\s-]back\b|\blow[\s-]back\b/],
  ["abdominals", /\babdominals?\b|\babs\b/],
  ["hip", /\bhips?\b/],
  ["knee", /\bknees?\b/],
  ["ankle", /\bankles?\b/],
  ["foot", /\bfoot\b|\bfeet\b/],
  ["elbow", /\belbows?\b/],
  ["wrist", /\bwrists?\b/],
  ["hand", /\bhands?\b/],
];

/**
 * The parts a short phrase names plainly, with the side said just before it
 * ("left knee", "R shoulder", "both hips"). Anything less plain is left out —
 * a wrong part on a note is worse than none.
 */
export function bodyMarksFromWords(text: string | null | undefined): NoteBodyMark[] {
  const t = ` ${(text ?? "").toLowerCase()} `;
  const marks: NoteBodyMark[] = [];
  for (const [part, re] of PART_WORDS) {
    const m = re.exec(t);
    if (!m) continue;
    const before = t.slice(Math.max(0, m.index - 12), m.index);
    // "knees", "feet": a plural with no side said is both.
    const plural = part !== "abdominals" && (m[0] === "feet" || /s$/.test(m[0]));
    const side: NoteBodyMark["side"] = /\b(both|bilateral)\s*$/.test(before)
      ? "both"
      : /\b(left|l)\s*$/.test(before)
        ? "left"
        : /\b(right|r)\s*$/.test(before)
          ? "right"
          : plural
            ? "both"
            : null;
    marks.push({ part, side });
  }
  return normaliseBodyMarks(marks);
}

export interface PainSkipLog {
  machineId?: string | null;
  outcome?: string | null;
  skipReason?: string | null;
  skipNote?: string | null;
}

export interface PainSkipNote {
  machineId: string;
  body: string;
  bodyParts: NoteBodyMark[] | null;
}

/**
 * The Incident notes a finished session's pain skips become: one per machine
 * skipped for pain, in the session's order. "Skipped Leg Press for pain:
 * left knee." — or, when nobody said where, "Skipped Leg Press for pain."
 */
export function painSkipNotes(
  logs: readonly PainSkipLog[],
  nameOf: (machineId: string) => string,
): PainSkipNote[] {
  const out: PainSkipNote[] = [];
  const seen = new Set<string>();
  for (const log of logs) {
    if (!log.machineId || log.outcome !== "skipped" || log.skipReason !== "pain_injury") continue;
    if (seen.has(log.machineId)) continue;
    seen.add(log.machineId);
    const where = (log.skipNote ?? "").trim().replace(/[.\s]+$/, "");
    const name = nameOf(log.machineId) || "a machine";
    const marks = bodyMarksFromWords(where);
    out.push({
      machineId: log.machineId,
      body: where ? `Skipped ${name} for pain: ${where}.` : `Skipped ${name} for pain.`,
      bodyParts: marks.length ? marks : null,
    });
  }
  return out;
}
