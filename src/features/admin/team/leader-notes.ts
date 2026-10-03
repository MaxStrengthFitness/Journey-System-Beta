/**
 * A LEADER'S NOTES ABOUT SOMEONE ON THE TEAM (notes round, Oct 3 2026).
 *
 * AJ, the Atlas answers (Oct 2 2026): "in the notes section of relay leaders
 * should have the ability to track the studio trainers and have records and
 * notes about them". The Journal has had a Team member type since then (Who ·
 * What happened · What I'll do, `relay/notes/journal.ts`), private to its
 * author like every note there. What was missing was the record: a leader
 * looking at a person on Operations → Team couldn't see what they had
 * written about them, and the blueprint's "Note for our 1:1" was never built
 * because nobody had said where it lives.
 *
 * It lives in the leader's own Journal, as a Team member note — the same
 * note the Journal writes, so the two are never two stores. Who is the
 * person's name as the team list spells it (the Journal's own picker writes
 * the same string), which is how this file groups them.
 *
 * NEVER: shown to the person it is about, shown to another trainer, a score
 * or a ranking. Recognition stays on the huddle; this is a leader's memory.
 *
 * Pure: no React, no Firebase.
 */
import type { NoteDraft, TrainerNote } from "../../relay/notes/types";

/** What a 1:1 note asks: what happened, and what the leader will do. */
export interface OneToOneAnswers {
  what: string;
  next: string;
}

/** The Journal's Team member note for a 1:1 with `name`. Nothing shared, nothing filed elsewhere. */
export function oneToOneDraft(name: string, answers: OneToOneAnswers): NoteDraft {
  const who = name.trim();
  return {
    title: `1:1 with ${who}`.slice(0, 160),
    body: "",
    kind: "note",
    folderId: null,
    clientIds: [],
    clientNames: {},
    pinned: false,
    share: false,
    links: [],
    teamShare: null,
    noteType: "team",
    fields: { who, what: answers.what.trim(), next: answers.next.trim() },
  };
}

/** Nothing to save until one of the two lines has words. */
export function oneToOneReady(answers: OneToOneAnswers): boolean {
  return Boolean(answers.what.trim() || answers.next.trim());
}

export interface PersonRecord {
  count: number;
  /** When the newest note about them was last changed, ms; null when no date reads. */
  lastMs: number | null;
}

const msOf = (v: unknown): number | null => {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const d = (v as { toDate?: () => Date }).toDate?.();
  return d && !isNaN(d.getTime()) ? d.getTime() : null;
};

const key = (name: string) => name.trim().toLowerCase();

/** A leader's Team member notes, by the person they are about. */
export function notesByPerson(notes: readonly Pick<TrainerNote, "noteType" | "fields" | "updatedAt">[]): Map<string, PersonRecord> {
  const out = new Map<string, PersonRecord>();
  for (const n of notes) {
    if (n.noteType !== "team") continue;
    const who = (n.fields?.who ?? "").trim();
    if (!who) continue;
    const k = key(who);
    const prev = out.get(k) ?? { count: 0, lastMs: null };
    const ms = msOf(n.updatedAt);
    out.set(k, { count: prev.count + 1, lastMs: ms !== null && (prev.lastMs === null || ms > prev.lastMs) ? ms : prev.lastMs });
  }
  return out;
}

/** The record for one person, by their name as the team list spells it. */
export function recordFor(records: ReadonlyMap<string, PersonRecord>, name: string): PersonRecord {
  return records.get(key(name)) ?? { count: 0, lastMs: null };
}
