/**
 * The intake's words a starting routine is matched on (the design round,
 * Oct 8 2026, §4.2): "The studio's routines whose matchWords appear in the
 * intake (medical history, goals, the clinical profile, open Health notes)
 * come first."
 *
 * So a client whose only sign of a knee is an open "Surgery" Health note is
 * offered the knee's starting routine, not the default. A Health note is
 * open while its thread is neither closed nor archived; its flavour's words
 * ("Surgery", "Injury or pain") and its body count, and so do the updates
 * hung off it. Pure: the profile hands in the journal it already streams.
 */
import type { JournalEntry } from "../../types/journal";
import { flavourLabel, flavourOf, noteCategoryOf } from "../client-notes/note-catalog";
import { isThreadUpdate, rootIdOf } from "../client-notes/threads";

type IntakeEntry = Pick<JournalEntry, "id" | "threadId" | "kind" | "category" | "body" | "resolvedAt" | "isArchived" | "origin" | "isLegacy">;

/** The words of the client's open Health notes: each root's flavour and body, then its updates' bodies. */
export function openHealthWords(entries: readonly IntakeEntry[] | null | undefined): string[] {
  const list = (entries ?? []).filter((e): e is IntakeEntry => !!e && typeof e.id === "string" && e.id !== "");
  const open = new Set<string>();
  const out: string[] = [];
  for (const e of list) {
    if (isThreadUpdate(e) || e.isArchived || e.resolvedAt) continue;
    if (noteCategoryOf(e) !== "health") continue;
    open.add(e.id);
    const words = [flavourLabel(flavourOf(e)), (e.body ?? "").trim()].filter(Boolean).join(": ");
    if (words) out.push(words);
  }
  for (const e of list) {
    if (!isThreadUpdate(e) || e.isArchived || !open.has(rootIdOf(e))) continue;
    const body = (e.body ?? "").trim();
    if (body) out.push(body);
  }
  return out;
}

/** Everything a starting routine's words are looked for in, or null when there is nothing. */
export function planIntakeText(input: {
  medicalHistory?: string | null;
  goals?: string | null;
  clinicalProfile?: readonly string[] | null;
  healthNotes?: readonly string[] | null;
}): string | null {
  const parts = [input.medicalHistory, input.goals, ...(input.clinicalProfile ?? []), ...(input.healthNotes ?? [])]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
