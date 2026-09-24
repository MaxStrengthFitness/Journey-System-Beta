/**
 * THE HUB CARD'S CRITICAL NOTE — which notes put the red triangle on a card.
 *
 * Question 12 of the Sep 20 audit, answered by AJ on Sep 24 2026. Since the
 * reporting round (Sep 16) the Loudness control had promised that a Critical
 * note "marks the Hub card", but the card's red triangle read only
 * `client.priorityNote`, `client.hasPriorityNote` and a High `client.events[]`
 * entry — three fields nothing in the app writes. The triangle lit only for a
 * record that already carried a legacy priority note, and a Critical note
 * written in Journey never reached the Hub.
 *
 * AJ's three answers, each load-bearing:
 *
 *   THE TRIANGLE ONLY. The small red triangle beside the name. The card's
 *     left edge keeps its own meanings (a session, a milestone, over) and is
 *     never turned red by a note — a legacy priority note included.
 *   THE DAY'S NOTES, NOT A COUNT ON THE CLIENT. The Hub reads the critical
 *     notes of the clients booked on the day it shows, once for the day and
 *     live (`useHubCriticalNotes`, thirty clients to a query), and this file
 *     decides which of them light a card. A cached count would need every
 *     writer to keep it right, a new field and a rules change, and could not
 *     know when a note's window opens or runs out — a stale count on the
 *     loudest flag in the app is a confident wrong answer.
 *   RED FOR EVERYONE. The Hub ignores "No need to remind me", exactly as the
 *     critical line at the top of the record does. A dismissal quietens one
 *     trainer's briefing and nothing else.
 *
 * WHICH NOTES LIGHT A CARD: the briefing's own selection (`criticalEntries`
 * in useClientJournal), asked about the BOOKING's studio day rather than
 * today, so Friday's card is right when the trainer looks at it on Thursday.
 *
 *   • A thread ROOT at Critical. Loudness lives on the root; an update is
 *     always written plain (client-notes/thread-write.ts), so an update never
 *     lights a card on its own, whatever it carries.
 *   • That matters on the booking's day (client-notes/mattering.ts — the one
 *     answer to "does this note matter"). A closed (`resolvedAt`) or archived
 *     thread is out; a window that ran out before the booking is out; a window
 *     that opens after it is out; a one-day note lights only on its day, or
 *     its anniversary when it repeats yearly.
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import { mattersOn } from "../features/client-notes/mattering";
import { isThreadUpdate } from "../features/client-notes/threads";
import { toDate, type JournalEntry } from "../types/journal";

/** Would this entry ever light a card? A Critical note that is a thread's root. */
function isCriticalRoot(entry: JournalEntry | null | undefined): entry is JournalEntry {
  return Boolean(entry?.id && entry.clientId && entry.importance === "critical" && !isThreadUpdate(entry));
}

/**
 * A read of critical notes, grouped by client. Keeps every Critical root,
 * whatever its window: which day a card is for is the card's business
 * (`criticalNotesOn`), so one read serves every booking on screen.
 */
export function criticalNotesByClient(entries: readonly JournalEntry[]): Map<string, JournalEntry[]> {
  const out = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    if (!isCriticalRoot(entry)) continue;
    const list = out.get(entry.clientId);
    if (list) list.push(entry);
    else out.set(entry.clientId, [entry]);
  }
  return out;
}

const writtenAt = (e: JournalEntry) => toDate(e.occurredAt)?.getTime() ?? 0;

/**
 * The client's Critical notes that matter on the booking's studio day,
 * newest first. Empty when nothing does, when no notes were handed in, or
 * when the booking has no readable day.
 */
export function criticalNotesOn(
  notes: readonly JournalEntry[] | null | undefined,
  day: string | null | undefined,
  tz?: string,
): JournalEntry[] {
  if (!notes?.length || !day) return [];
  return notes.filter((e) => isCriticalRoot(e) && mattersOn(e, day, tz)).sort((a, b) => writtenAt(b) - writtenAt(a));
}

/**
 * What the triangle says to a screen reader and in the card's tooltip:
 * "Critical: Left shoulder, no overhead pressing". Whole sentences, never
 * clipped — a critical note cut short is a different instruction. Null when
 * there is nothing to say.
 */
export function criticalNoteLabel(notes: readonly JournalEntry[]): string | null {
  if (notes.length === 0) return null;
  const bodies = notes.map((n) => (n.body || "").trim()).filter(Boolean);
  if (bodies.length === 0) return "Critical note";
  return bodies.map((body) => `Critical: ${body}`).join(" · ");
}
