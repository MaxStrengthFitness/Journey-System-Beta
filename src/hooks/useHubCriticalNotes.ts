/**
 * THE HUB'S ONE READ OF CRITICAL NOTES — for the clients booked on the day it
 * shows.
 *
 * AJ, Sep 24 2026 (question 12 of the Sep 20 audit): the Hub card's red
 * triangle comes from reading the day's notes, never from a count kept on the
 * client. `lib/hub-critical-notes.ts` is the rule; this is the read under it.
 *
 * BY CLIENT, THIRTY TO A QUERY: `journalEntries where clientId in [up to 30]
 * and importance == "critical"`. That is the journal's own scoping — a note is
 * about a client, and `useClientJournal` reads by `clientId` too. A read by
 * studio would miss notes: a note written in a session carries the studio the
 * trainer stood in, one written on the profile the client's home studio, so a
 * visiting client's Critical note lives under another studio's id. Equality
 * filters alone (an `in` is a set of equalities) need no composite index, and
 * the rules let any signed-in trainer read the collection. A studio day of
 * sixty bookings is two listeners, never one per client.
 *
 * LIVE, because the Hub stays open all day: a note written at 9:05, or one
 * closed, reaches the 9:30 card without a reload, and only changed documents
 * are read again. Which notes still matter on the card's day is decided when
 * the card draws, so a window running out needs no new read.
 *
 * UNKNOWN IS NOT EMPTY. `notesFor(id)` is null while that client's group has
 * not answered, after it failed, and when the group hit its guard rail with
 * nothing back for them: the card then claims nothing, and the Hub says once
 * that critical notes could not be checked. A failed group keeps the notes it
 * last read, so a triangle already lit does not go out because the network
 * did. Every answer is stamped with the set of clients it is for, so the last
 * day's answer never stands in for this one.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { criticalNotesByClient } from "../lib/hub-critical-notes";
import { MAX_IN_VALUES } from "../lib/tenancy";
import type { JournalEntry } from "../types/journal";

/**
 * The most Critical notes one group of thirty clients may return. Closed and
 * run-out notes count towards it, because the query cannot leave them out
 * (a missing `resolvedAt` never matches a filter on null). Hitting it makes
 * the group's silent clients unknown rather than clear.
 */
export const HUB_CRITICAL_GUARD = 300;

/**
 * `loading`     some group has not answered for this set of clients yet;
 * `ready`       every group answered in full;
 * `incomplete`  every group answered, and at least one failed or hit the
 *               guard rail, so some clients' critical notes are unknown.
 */
export type HubCriticalStatus = "loading" | "ready" | "incomplete";

export interface HubCriticalNotes {
  status: HubCriticalStatus;
  /**
   * The client's Critical notes, whatever their window (the card decides
   * which matter on its day). `[]` means read, and none. `null` means
   * unknown: not answered, failed, or cut short by the guard rail.
   */
  notesFor: (clientId: string | null | undefined) => readonly JournalEntry[] | null;
}

interface GroupAnswer {
  status: "ready" | "capped" | "failed";
  entries: JournalEntry[];
}

interface Answers {
  /** The set of clients these answers are for. */
  key: string;
  byGroup: Record<number, GroupAnswer>;
}

const NONE: readonly JournalEntry[] = Object.freeze([]) as readonly JournalEntry[];

/** Sorted, de-duplicated ids joined into one string: the same clients are the same read. */
export function clientSetKey(clientIds: readonly (string | null | undefined)[]): string {
  const ids = new Set<string>();
  for (const id of clientIds) {
    const trimmed = typeof id === "string" ? id.trim() : "";
    if (trimmed) ids.add(trimmed);
  }
  return [...ids].sort().join("\n");
}

export function useHubCriticalNotes(clientIds: readonly (string | null | undefined)[]): HubCriticalNotes {
  const key = clientSetKey(clientIds);

  const groups = useMemo(() => {
    const ids = key ? key.split("\n") : [];
    const out: string[][] = [];
    for (let i = 0; i < ids.length; i += MAX_IN_VALUES) out.push(ids.slice(i, i + MAX_IN_VALUES));
    return out;
  }, [key]);

  const [answers, setAnswers] = useState<Answers>({ key: "", byGroup: {} });

  useEffect(() => {
    if (groups.length === 0) return;
    const answer = (index: number, next: (prev: GroupAnswer | undefined) => GroupAnswer) =>
      setAnswers((prev) => {
        const byGroup = prev.key === key ? prev.byGroup : {};
        return { key, byGroup: { ...byGroup, [index]: next(byGroup[index]) } };
      });

    const unsubscribes = groups.map((ids, index) =>
      onSnapshot(
        query(
          collection(db, "journalEntries"),
          where("clientId", "in", ids),
          where("importance", "==", "critical"),
          limit(HUB_CRITICAL_GUARD),
        ),
        (snap) => {
          const entries = snap.docs.map((d) => ({ ...(d.data() as JournalEntry), id: d.id }));
          answer(index, () => ({ status: entries.length >= HUB_CRITICAL_GUARD ? "capped" : "ready", entries }));
        },
        (err) => {
          // The answer first: the handler below may throw.
          answer(index, (prev) => ({ status: "failed", entries: prev?.entries ?? [] }));
          handleFirestoreError(err, OperationType.LIST, "journalEntries");
        },
      ),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [key, groups]);

  return useMemo<HubCriticalNotes>(() => {
    if (groups.length === 0) return { status: "ready", notesFor: () => null };

    const current = answers.key === key ? answers.byGroup : {};
    const groupOf = new Map<string, number>();
    groups.forEach((ids, index) => ids.forEach((id) => groupOf.set(id, index)));
    const byClient = criticalNotesByClient(Object.values(current).flatMap((g) => g.entries));

    const answered = groups.every((_, index) => current[index]);
    const whole = groups.every((_, index) => current[index]?.status === "ready");
    const status: HubCriticalStatus = !answered ? "loading" : whole ? "ready" : "incomplete";

    const notesFor = (clientId: string | null | undefined): readonly JournalEntry[] | null => {
      const id = typeof clientId === "string" ? clientId.trim() : "";
      const index = id ? groupOf.get(id) : undefined;
      if (index === undefined) return null;
      const group = current[index];
      if (!group) return null;
      const notes = byClient.get(id);
      if (group.status === "ready") return notes ?? NONE;
      // Failed or cut short: what was read is real; silence is not.
      return notes ?? null;
    };

    return { status, notesFor };
  }, [answers, key, groups]);
}
