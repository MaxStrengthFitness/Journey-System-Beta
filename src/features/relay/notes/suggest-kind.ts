/**
 * CLASSIFY AFTER WRITING — a suggested kind, from what the note is about.
 *
 * Round: Relay, Sep 2026. The old editor put six kind chips and a folder
 * dropdown ABOVE the text: taxonomy before content, a tax nobody pays
 * between sessions. Now the kind is suggested from the links and the words
 * once something is written, with one tap to confirm or change. The
 * suggestion never overrides a kind the author chose.
 */
import type { NoteDraft, NoteKind } from "./types";

const INJURY = /\b(pain|injur|hurt|strain|tear|torn|rehab|physio|surg|shoulder|knee|hip|back|neck|elbow|wrist|ankle)/i;
const RETENTION = /\b(renew|retention|cancel|laps|quit|leav|mia\b|missing|budget|pric)/i;
const ROUTINE = /\b(routine|machine|swap|add\b|drop|progress|weight|reps|setting|seat|program)/i;

export function suggestKind(d: Pick<NoteDraft, "title" | "body" | "clientIds" | "links">, log: { text: string }[] = []): NoteKind {
  const text = `${d.title}\n${d.body}\n${log.map((e) => e.text).join("\n")}`;
  const aboutSomeone = d.clientIds.length > 0;
  if (aboutSomeone && INJURY.test(text)) return "injury";
  if (aboutSomeone && RETENTION.test(text)) return "retention";
  if (aboutSomeone && ROUTINE.test(text)) return "routine";
  if (d.links.length > 0 && !aboutSomeone) return "research";
  if (aboutSomeone) return "plan";
  return "note";
}
