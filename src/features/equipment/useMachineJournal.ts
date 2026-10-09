/**
 * Her journal's notes that name a machine, for a screen that does not hold
 * her journal already (machine-notes.ts). The SAME query `useClientJournal`
 * streams (clientId, newest first, 300), on the existing
 * `journalEntries(clientId, occurredAt desc)` index, so the Firestore client
 * shares one listener between them while both are mounted, and no new index
 * is needed. A screen that already holds the journal passes its entries in
 * and this reads nothing.
 *
 * `null` while unread or after a failed read: the readers then fall back to
 * the legacy list alone, never "no notes". `useMachineJournalRead` says
 * which of the two it is, for a screen that must tell "couldn't be read"
 * from "not answered yet" (the machine menu's safety strip and notes lane).
 * A screen that holds `useClientJournal` already takes `machineJournalOf` its
 * `journalStream` instead, and opens no subscription here at all.
 */
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { JournalEntry } from "../../types/journal";

const STREAM_LIMIT = 300;

export type MachineJournalState = "loading" | "ready" | "failed";

export interface MachineJournalRead {
  /** Her journal's entries that name a machine; null while unread or after a failed read. */
  entries: JournalEntry[] | null;
  state: MachineJournalState;
  /**
   * Every entry the same read holds, for a host that wants more than the
   * machine notes from the one listener (the profile's Routine A plan reads
   * the open Health notes, routine-plan/intake.ts); null while unread or
   * after a failed read.
   */
  all?: JournalEntry[] | null;
}

/** Only the entries that name a machine. */
const onMachines = (entries: readonly JournalEntry[]): JournalEntry[] =>
  entries.filter((e) => typeof e?.machineId === "string" && e.machineId !== "");

export function useMachineJournalRead(clientId: string | null | undefined, given?: readonly JournalEntry[] | null): MachineJournalRead {
  const skip = given !== undefined || !clientId;
  const [held, setHeld] = useState<{ clientId: string; entries: JournalEntry[] | null; all: JournalEntry[] | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (skip || !clientId) return;
    return onSnapshot(
      query(collection(db, "journalEntries"), where("clientId", "==", clientId), orderBy("occurredAt", "desc"), limit(STREAM_LIMIT)),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JournalEntry);
        setHeld({ clientId, entries: onMachines(all), all, failed: false });
      },
      (err) => {
        console.warn("[machine notes] her journal couldn't be read", err);
        setHeld({ clientId, entries: null, all: null, failed: true });
      },
    );
  }, [skip, clientId]);
  if (given !== undefined) return { entries: given ? [...given] : null, state: given ? "ready" : "loading", all: given ? [...given] : null };
  if (!held || held.clientId !== clientId) return { entries: null, state: "loading", all: null };
  return { entries: held.entries, state: held.failed ? "failed" : "ready", all: held.all };
}

export function useMachineJournal(clientId: string | null | undefined, given?: readonly JournalEntry[] | null): JournalEntry[] | null {
  return useMachineJournalRead(clientId, given).entries;
}

/**
 * Her machine notes from a journal stream a screen ALREADY holds
 * (`useClientJournal`'s `journalStream`), reading nothing of its own (machine
 * menu, Oct 2026): the Active Session's grid marks and its machine menu take
 * them from the session's one journal listener, so the session holds one
 * subscription, never a second on the same query. Keeps the stream's state:
 * "failed" is never an empty list. Pure; memoise it on the stream.
 */
export function machineJournalOf(stream: { entries: readonly JournalEntry[] | null; state: MachineJournalState } | null | undefined): MachineJournalRead {
  if (!stream) return { entries: null, state: "loading" };
  if (stream.state !== "ready" || !stream.entries) return { entries: null, state: stream.state === "failed" ? "failed" : "loading" };
  return { entries: onMachines(stream.entries), state: "ready" };
}
