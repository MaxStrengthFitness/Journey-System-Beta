/**
 * useClientJournal — the single read/write surface for a client's coaching
 * journal.
 *
 * WHY THIS EXISTS (and what was broken before)
 * --------------------------------------------
 * The old Journal tab built its timeline inline in ClientProfileView from five
 * sources. Three bugs made it look like saving was broken when it wasn't:
 *
 *  1. `sessionNotes` and `sessions` were fetched in an effect that bailed out
 *     unless activeTab was journey/history/clinical. The Journal tab was not on
 *     that list, so on the Journal tab those two sources were ALWAYS empty —
 *     hence "0 filtered records" with every filter set to All.
 *  2. Those fetches used one-shot `getDocs`, so even when they did run, a note
 *     saved seconds later never appeared. Only a full remount showed it.
 *  3. Entries were written with `dateAssigned: serverTimestamp()`. In the local
 *     cache a pending server timestamp reads as `null`, and null sorts FIRST
 *     ascending — i.e. LAST in a `desc` ordering. So a brand-new note dropped
 *     to the bottom of the list for the second or two before the server
 *     answered. To a coach that is indistinguishable from "it didn't save".
 *
 * This hook fixes all three: everything is a live `onSnapshot`, nothing is
 * gated on which tab is showing, and `occurredAt` is written client-side as a
 * real `Timestamp` so a new entry renders at the top of the stream instantly.
 *
 * LEGACY DATA
 * -----------
 * Nothing is migrated. The old collections and the read-only profile fields —
 * including Mindbody's imported account notes — are normalized into the same
 * JournalEntry shape at read time and flagged `isLegacy`. They render in the
 * stream like anything else but cannot be edited, because the app is not their
 * system of record.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  increment,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { handleFirestoreError, OperationType } from "../lib/firestore-errors";
import type {
  Client,
  ClientEvent,
  ClinicalIncident,
  FocusRecord,
  SessionNote,
  Trainer,
  TrainerFocus,
  WorkoutSession,
} from "../types";
import {
  toDate,
  type ClientFocus,
  type FocusCategory,
  type JournalDraft,
  type JournalEntry,
  type JournalImportance,
} from "../types/journal";
import { adaptClientEvents as adaptFordEvents } from "../features/ford/ford-rollup";
import { studioDateKey } from "../lib/studio-time";
import { mattersOn } from "../features/client-notes/mattering";
import { assembleThreads, withoutThreadUpdates, type NoteThread } from "../features/client-notes/threads";

const STREAM_LIMIT = 300;
const LEGACY_NOTE_LIMIT = 200;
const SESSION_SUMMARY_LIMIT = 40;
/**
 * A guard rail, not a window (cost round, Sep 2026). The four per-client
 * collections below (clientFocuses, focusRecords, clinicalIncidents,
 * trainerFocuses) had NO limit: a client with a runaway import could open
 * thousands of documents every time their profile opened. Any real client has
 * a few dozen at most, so at 200 nothing changes for anyone today. It is
 * deliberately NOT a "newest 50": the focus board lists every past focus as
 * its history and dedupes legacy focuses against the active ones, so an
 * ordered cut would silently drop an active focus and let its legacy copy
 * reappear. When a collection does hit the rail, `capped` is true and the
 * journal says so instead of miscounting.
 */
export const JOURNAL_GUARD_LIMIT = 200;

/**
 * How long a Heads up stays on the briefing when it has no "until" day
 * (reporting round, Sep 2026). Three weeks: long enough to cover a fortnight
 * of missed sessions, short enough that "a bit sore after the move" is not
 * still being read out in November.
 */
export const HEADS_UP_WINDOW_DAYS = 21;

/**
 * Is this Heads up (importance `elevated`) still live at `nowMs`?
 *
 *   • resolved → no.
 *   • it has an "until" day → live while that day is today or later
 *     (compared against the start of the studio day, so a note that says
 *     "until Thursday" is still read out on Thursday morning).
 *   • otherwise → live for HEADS_UP_WINDOW_DAYS after it was written.
 *
 * Pure; `src/features/briefing/heads-up.test.ts` pins it.
 */
export function isHeadsUpLive(
  entry: Pick<JournalEntry, "importance" | "resolvedAt" | "effectiveUntil" | "occurredAt"> &
    Partial<Pick<JournalEntry, "effectiveFrom" | "repeat" | "isArchived">>,
  nowMs: number,
): boolean {
  if (entry.importance !== "elevated") return false;
  if (entry.resolvedAt) return false;
  // A note with a window of its own (Operations overhaul, Sep 2026) is read
  // by the one mattering rule: a range ends on its day, a DAY note shows on
  // its day only, a pushed-ahead start waits.
  if (entry.effectiveUntil || entry.effectiveFrom) {
    const today = studioDateKey(new Date(nowMs));
    return today !== null && mattersOn({ ...entry, effectiveFrom: entry.effectiveFrom ?? null, isArchived: entry.isArchived ?? false }, today);
  }
  const occurred = toDate(entry.occurredAt);
  if (!occurred) return false;
  // A note dated ahead ("away from the 20th") is younger than zero and live.
  return nowMs - occurred.getTime() <= HEADS_UP_WINDOW_DAYS * 86_400_000;
}

/* ------------------------------------------------------------------ */
/* WRITES                                                              */
/* ------------------------------------------------------------------ */

function buildSearchTags(e: {
  kind: string;
  category?: string | null;
  importance: string;
  authorId: string;
  machineId?: string | null;
  focusId?: string | null;
}): string[] {
  const tags = [`kind:${e.kind}`, `imp:${e.importance}`, `coach:${e.authorId}`];
  if (e.category) tags.push(`cat:${e.category}`);
  if (e.machineId) tags.push(`machine:${e.machineId}`);
  if (e.focusId) tags.push(`focus:${e.focusId}`);
  return tags;
}

export interface JournalAuthor {
  id: string;
  initials: string;
  fullName: string;
}

/**
 * Create a journal entry.
 *
 * `occurredAt` is deliberately a client-side `Timestamp`, NOT
 * `serverTimestamp()`. Firestore's offline cache resolves a pending server
 * timestamp to null, and the stream is ordered by occurredAt desc — a null
 * would sort the brand-new card to the bottom of the list until the server
 * round-trip completed. `createdAt` keeps serverTimestamp() because it is an
 * audit field nothing sorts by.
 */
export async function createJournalEntry(
  clientId: string,
  studioId: string,
  author: JournalAuthor,
  draft: JournalDraft,
): Promise<string | null> {
  const body = (draft.body || "").trim();
  if (!clientId || !body) return null;

  const occurred = draft.occurredAt ?? new Date();

  const payload = {
    clientId,
    studioId: studioId || "",
    kind: draft.kind,
    category: draft.category ?? null,
    body,
    importance: draft.importance,
    machineId: draft.machineId ?? null,
    focusId: draft.focusId ?? null,
    // The thread this update hangs from, or null for a note of its own
    // (features/client-notes/threads.ts). Written by addThreadUpdate.
    threadId: draft.threadId ?? null,
    sessionId: draft.sessionId ?? null,
    origin: draft.origin,
    authorId: author.id,
    authorInitials: author.initials,
    authorName: author.fullName,
    occurredAt: Timestamp.fromDate(occurred),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    effectiveFrom: draft.effectiveFrom
      ? Timestamp.fromDate(draft.effectiveFrom)
      : null,
    effectiveUntil: draft.effectiveUntil
      ? Timestamp.fromDate(draft.effectiveUntil)
      : null,
    // The mattering window's third field (features/client-notes/mattering.ts).
    repeat: draft.repeat ?? null,
    reviewedAt: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: buildSearchTags({
      kind: draft.kind,
      category: draft.category,
      importance: draft.importance,
      authorId: author.id,
      machineId: draft.machineId,
      focusId: draft.focusId,
    }),
  };

  try {
    const ref = await addDoc(collection(db, "journalEntries"), payload);

    // A check-in keeps its focus card's activity counters honest without a
    // second query on read. Legacy focuses have no document to count on — the
    // thread still renders, because it is filtered from the entries themselves.
    if (draft.focusId && !isLegacyFocusId(draft.focusId)) {
      updateDoc(doc(db, "clientFocuses", draft.focusId), {
        checkInCount: increment(1),
        lastCheckInAt: Timestamp.fromDate(occurred),
        updatedAt: serverTimestamp(),
      }).catch(() => {
        /* counter drift is cosmetic; never fail the note over it */
      });
    }

    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "journalEntries");
    throw err;
  }
}

export async function updateJournalEntry(
  entryId: string,
  patch: Partial<
    Pick<
      JournalEntry,
      | "body"
      | "kind"
      | "category"
      | "importance"
      | "machineId"
      | "effectiveFrom"
      | "effectiveUntil"
      | "repeat"
      | "reviewedAt"
    >
  >,
): Promise<void> {
  try {
    await updateDoc(doc(db, "journalEntries", entryId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `journalEntries/${entryId}`);
    throw err;
  }
}

/** Trainers archive rather than delete, so history can never quietly vanish. */
export async function archiveJournalEntry(entryId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "journalEntries", entryId), {
      isArchived: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `journalEntries/${entryId}`);
    throw err;
  }
}

/**
 * Archive several entries in ONE batch — all of them or none (client codex,
 * the Notes page). Archiving a thread's root alone turns its updates into
 * notes of their own (`assembleThreads` promotes an update whose root is not
 * in the load), so a thread is archived whole: `archiveThread` in
 * features/client-notes/thread-write.ts passes the root and every update.
 *
 * Writes `isArchived` and `updatedAt` and nothing else, which is what the
 * journalEntries update rule checks (author and client unchanged). Empty or
 * duplicate ids are dropped; nothing to archive writes nothing.
 */
export async function archiveJournalEntries(entryIds: readonly string[]): Promise<void> {
  const ids = Array.from(new Set(entryIds.filter((id) => typeof id === "string" && id.trim())));
  if (ids.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.update(doc(db, "journalEntries", id), {
        isArchived: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, "journalEntries");
    throw err;
  }
}

/**
 * "Still matters" on the 60-day review (Operations → Overview): stamps the
 * note as looked at, which restarts its review clock. See
 * features/client-notes/mattering.ts, needsReview.
 */
export async function reviewJournalEntry(entryId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "journalEntries", entryId), {
      reviewedAt: Timestamp.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `journalEntries/${entryId}`);
    throw err;
  }
}

export async function resolveJournalEntry(
  entryId: string,
  resolved: boolean,
): Promise<void> {
  try {
    await updateDoc(doc(db, "journalEntries", entryId), {
      resolvedAt: resolved ? Timestamp.now() : null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `journalEntries/${entryId}`);
    throw err;
  }
}

/* --------------------------- focuses ------------------------------ */

export async function createClientFocus(
  clientId: string,
  studioId: string,
  author: JournalAuthor,
  input: {
    category: FocusCategory;
    intent: string;
    targetMachineId?: string | null;
    reviewInDays?: number;
  },
): Promise<string | null> {
  const intent = (input.intent || "").trim();
  if (!clientId || !intent) return null;

  const now = new Date();
  const review = new Date(now);
  review.setDate(review.getDate() + (input.reviewInDays ?? 21));

  try {
    const ref = await addDoc(collection(db, "clientFocuses"), {
      clientId,
      studioId: studioId || "",
      trainerId: author.id,
      trainerName: author.fullName,
      trainerInitials: author.initials,
      category: input.category,
      intent,
      targetMachineId: input.targetMachineId ?? null,
      status: "active",
      startedAt: Timestamp.fromDate(now),
      reviewDueAt: Timestamp.fromDate(review),
      passedAt: null,
      lastExtendedAt: null,
      extensionCount: 0,
      checkInCount: 0,
      lastCheckInAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "clientFocuses");
    throw err;
  }
}

const LEGACY_FOCUS_PREFIX = "legacy:focusRecords:";

/** True for a focus the board adapted out of the old focusRecords collection. */
export function isLegacyFocusId(focusId: string): boolean {
  return focusId.startsWith(LEGACY_FOCUS_PREFIX);
}

/**
 * Passed = the client has got it (shown as ACHIEVED). Retired = abandoned
 * without being met.
 *
 * Achieving stamps `achievedAt` and keeps an optional reward note ("Kaizen
 * pin"); retiring stamps `retiredAt`, so the focus history can say how long
 * each one ran. The clientFocuses update rule restricts WHO may do this (the
 * owning trainer or an admin / founder / franchise owner), not which fields,
 * so the new fields need no rules change.
 *
 * A focus adapted from the legacy focusRecords collection carries a synthetic
 * id, so the write is routed back to the document it actually came from using
 * that collection's own vocabulary (Active / Achieved / Deleted). Without this
 * a coach would see an old active directive on the board and have no way to
 * close it out.
 */
export async function setFocusStatus(
  focusId: string,
  status: "active" | "passed" | "retired",
  opts: { rewardNote?: string | null } = {},
): Promise<void> {
  if (isLegacyFocusId(focusId)) {
    const realId = focusId.slice(LEGACY_FOCUS_PREFIX.length);
    try {
      await updateDoc(doc(db, "focusRecords", realId), {
        status:
          status === "passed"
            ? "Achieved"
            : status === "retired"
              ? "Deleted"
              : "Active",
        dateUpdated: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `focusRecords/${realId}`);
      throw err;
    }
    return;
  }

  const now = Timestamp.now();
  const patch: Record<string, unknown> = {
    status,
    passedAt: status === "passed" ? now : null,
    achievedAt: status === "passed" ? now : null,
    retiredAt: status === "retired" ? now : null,
    updatedAt: serverTimestamp(),
  };
  if (status === "passed") {
    patch.rewardNote = (opts.rewardNote || "").trim().slice(0, 200) || null;
  }

  try {
    await updateDoc(doc(db, "clientFocuses", focusId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `clientFocuses/${focusId}`);
    throw err;
  }
}

/** Push the review date out and count the extension — "not there yet". */
export async function extendFocus(
  focusId: string,
  days = 21,
): Promise<void> {
  // focusRecords has no review date to push, so extending one is a no-op
  // rather than a write of a field that schema never had.
  if (isLegacyFocusId(focusId)) return;
  const next = new Date();
  next.setDate(next.getDate() + days);
  try {
    await updateDoc(doc(db, "clientFocuses", focusId), {
      status: "active",
      reviewDueAt: Timestamp.fromDate(next),
      lastExtendedAt: Timestamp.now(),
      extensionCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `clientFocuses/${focusId}`);
    throw err;
  }
}

export async function updateFocusIntent(
  focusId: string,
  patch: { category?: FocusCategory; intent?: string; targetMachineId?: string | null },
): Promise<void> {
  try {
    await updateDoc(doc(db, "clientFocuses", focusId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `clientFocuses/${focusId}`);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* LEGACY ADAPTERS — read-only normalisation, no migration             */
/* ------------------------------------------------------------------ */

function legacyEntry(
  partial: Partial<JournalEntry> &
    Pick<JournalEntry, "id" | "clientId" | "kind" | "body" | "occurredAt">,
): JournalEntry {
  return {
    studioId: "",
    category: null,
    importance: "standard",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "legacy",
    authorId: "unknown",
    authorInitials: "—",
    authorName: "Unknown",
    createdAt: partial.occurredAt,
    updatedAt: partial.occurredAt,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    isLegacy: true,
    ...partial,
  } as JournalEntry;
}

function resolveTrainer(
  trainers: Trainer[],
  trainerId?: string | null,
  initials?: string | null,
): JournalAuthor {
  const byId = trainerId ? trainers.find((t) => t.id === trainerId) : undefined;
  const byInitials =
    !byId && initials
      ? trainers.find(
          (t) => (t.initials || "").toUpperCase() === initials.toUpperCase(),
        )
      : undefined;
  const t = byId || byInitials;
  return {
    id: t?.id || trainerId || "unknown",
    initials: (t?.initials || initials || "—").toUpperCase(),
    fullName: t?.fullName || initials || "Unknown coach",
  };
}

/**
 * Old focusRecords -> focus board entries.
 *
 * A focusRecord already IS a standing directive: it has an owner, one of the
 * 4 P's, an optional target machine and an Active/Achieved status. Mapping it
 * to ClientFocus rather than to a timeline entry is what lets the old "Active
 * Coach Directives" data land on the new focus board, where a coach can pass
 * or extend it, instead of scrolling past as one more dated card.
 */
function adaptFocusRecords(
  records: FocusRecord[],
  trainers: Trainer[],
): ClientFocus[] {
  return records
    .filter((f) => f.status !== "Deleted" && (f.clinicalNotes || "").trim())
    .map((f) => {
      const author = resolveTrainer(trainers, f.trainerId, f.assignedBy);
      return {
        id: `legacy:focusRecords:${f.id}`,
        clientId: f.clientId,
        studioId: f.studioId || "",
        trainerId: author.id,
        trainerName: author.fullName,
        trainerInitials: author.initials,
        category: f.category as FocusCategory,
        intent: f.clinicalNotes,
        targetMachineId: f.targetMachineId || null,
        status: f.status === "Achieved" ? "passed" : "active",
        startedAt: f.dateAssigned,
        reviewDueAt: null,
        passedAt: f.status === "Achieved" ? f.dateUpdated || null : null,
        achievedAt: f.status === "Achieved" ? f.dateUpdated || null : null,
        lastExtendedAt: null,
        extensionCount: 0,
        checkInCount: 0,
        lastCheckInAt: null,
        createdAt: f.dateAssigned,
        updatedAt: f.dateUpdated || f.dateAssigned,
        isLegacy: true,
      } as ClientFocus;
    });
}

/** Old sessionNotes → general/coaching entries. High priority becomes critical. */
function adaptSessionNotes(
  notes: SessionNote[],
  trainers: Trainer[],
): JournalEntry[] {
  return notes
    .filter((n) => (n.content || "").trim())
    .map((n) => {
      const author = resolveTrainer(trainers, n.trainerId, n.trainerInitials);
      const importance: JournalImportance =
        n.priority === "High"
          ? "critical"
          : n.priority === "Medium"
            ? "elevated"
            : "standard";
      return legacyEntry({
        id: `legacy:sessionNotes:${n.id}`,
        clientId: n.clientId || "",
        studioId: n.studioId || "",
        kind: "general",
        body: n.content,
        importance,
        sessionId: n.sessionId || null,
        origin: n.sessionId ? "in_session" : "manual",
        occurredAt: n.createdAt,
        authorId: author.id,
        authorInitials: author.initials,
        authorName: author.fullName,
        legacySource: "Session note",
      });
    });
}

/** Clinical incidents → incident entries. Unresolved ones are critical. */
function adaptIncidents(
  incidents: ClinicalIncident[],
  trainers: Trainer[],
): JournalEntry[] {
  return incidents
    .filter((i) => (i.description || "").trim())
    .map((i) => {
      const author = resolveTrainer(trainers, i.reportedByTrainerId);
      const body = i.actionTaken
        ? `${i.description}\n\nAction taken: ${i.actionTaken}`
        : i.description;
      return legacyEntry({
        id: `legacy:clinicalIncidents:${i.id}`,
        clientId: i.clientId,
        studioId: i.studioId || "",
        kind: "incident",
        body,
        machineId: i.machineId || null,
        sessionId: i.sessionId || null,
        importance:
          i.resolvedAt || i.severity === "mild" ? "elevated" : "critical",
        occurredAt: i.createdAt,
        resolvedAt: i.resolvedAt || null,
        effectiveUntil: i.surfaceUntil || null,
        authorId: author.id,
        authorInitials: author.initials,
        authorName: author.fullName,
        legacySource: `Incident · ${i.region}`,
      });
    });
}

/**
 * client.events[] -> journal entries, EXCEPT the ones FORD shows.
 *
 * Notes catalog round, Sep 2026: FORD reads the same array as personal
 * details in the Life section (features/ford/ford-rollup.ts), so adapting
 * every event here as well put each birthday and vacation on the record
 * twice. FORD decides which events are personal — its own adapter is asked,
 * so the two can never disagree — and those are left to it.
 *
 * What FORD deliberately drops is NOT dropped here: a Medical event is a load
 * constraint (read as `injury`), and Alerts, scan and routine reminders are
 * profile imports (Admin). A High-priority one is still critical, so it still
 * reaches the critical strip and the snapshot bar. Nothing is migrated or
 * deleted; the array is untouched.
 */
export function adaptEventsToJournal(client: Client | null): JournalEntry[] {
  if (!client?.events?.length) return [];
  // Asked one event at a time, so an event with no id is still judged on
  // its own rather than by a shared synthetic id.
  const fordShows = (e: ClientEvent) => adaptFordEvents({ ...client, events: [e] }).length > 0;
  // FORD entries carry no importance, so a HIGH-priority event FORD also shows
  // ("Vacation — away until Oct 3") would fall out of the briefing's
  // "Before you start". Those stay here while they are current (review
  // round, Sep 2026), filed under FORD / Life.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const stillCurrent = (e: ClientEvent) =>
    (toDate(e.endDate || e.date)?.getTime() ?? 0) >= startOfToday.getTime();
  return (client.events as ClientEvent[])
    .filter((e) => e && e.date)
    .filter((e) => !fordShows(e) || (e.priority === "High" && stillCurrent(e)))
    .map((e) => {
      const when = toDate(e.date) || new Date();
      const body = (e.notes ? `${e.title}\n${e.notes}` : e.title || "").trim();
      return legacyEntry({
        id: `legacy:clientEvents:${e.id || e.date + e.title}`,
        clientId: client.id || "",
        studioId: client.homeStudioId || "",
        kind: e.type === "Medical" ? "injury" : fordShows(e) ? "life" : "general",
        body,
        importance:
          e.priority === "High"
            ? "critical"
            : e.priority === "Medium"
              ? "elevated"
              : "standard",
        origin: "profile",
        occurredAt: Timestamp.fromDate(when),
        effectiveFrom: Timestamp.fromDate(when),
        effectiveUntil: e.endDate
          ? Timestamp.fromDate(toDate(e.endDate) || when)
          : null,
        authorInitials: "SYS",
        authorName: "Client events",
        legacySource: `Event · ${e.type}`,
      });
    })
    .filter((e) => e.body.length > 0);
}

/**
 * Read-only profile fields, including Mindbody's imported account notes.
 *
 * Dated to the client's record rather than to "now", because that is when they
 * are true of: intake notes belong at the start of the client's history, not
 * at the top of today's stream. The notes catalog files the imports under
 * Admin, where they are one tap away however long the history grows.
 *
 * The medical-history and clinical-notes fields are read as `injury` (they
 * were `life`, which filed a surgery under the client's personal life): the
 * catalog shelves them under Injury and `sectionForEntry` puts them in the
 * medical section.
 *
 * All flagged legacy, so nobody tries to edit them here — Mindbody is the
 * system of record for its own notes, and the rest are edited on the profile.
 */
export function adaptProfileFields(client: Client | null): JournalEntry[] {
  if (!client) return [];
  const out: JournalEntry[] = [];
  const stamp = client.createdAt || Timestamp.now();
  const base = {
    clientId: client.id || "",
    studioId: client.homeStudioId || "",
    origin: "profile" as const,
    authorInitials: "SYS",
    authorName: "Client profile",
  };

  const push = (
    key: string,
    text: string | undefined,
    kind: JournalEntry["kind"],
    label: string,
    importance: JournalImportance = "standard",
    origin: JournalEntry["origin"] = "profile",
  ) => {
    if (!text || !text.trim()) return;
    out.push(
      legacyEntry({
        ...base,
        id: `legacy:profile:${key}`,
        kind,
        body: text.trim(),
        importance,
        origin,
        occurredAt: stamp,
        legacySource: label,
      }),
    );
  };

  // Mindbody-imported account notes. Webhook-synced, capped at 1000 chars,
  // read-only in this app.
  push(
    "mindbodyNotes",
    client.mindbodyNotes,
    "consultation",
    "Mindbody account notes",
    "standard",
    "mindbody",
  );
  push(
    "discoveryNotes",
    client.discoveryNotes,
    "consultation",
    "Consultation · discovery",
    "standard",
    "consultation",
  );
  push("priorityNote", client.priorityNote, "general", "Pinned priority note", "critical");
  push("medicalHistory", client.medicalHistory, "injury", "Medical history", "elevated");
  push("clinicalNotes", client.clinicalNotes, "injury", "Clinical notes", "elevated");
  push("globalNotes", client.globalNotes, "general", "Global goal");
  push("notes", client.notes, "general", "Profile notes");

  return out;
}

/** Session wrap-up text stored on the session document itself. */
function adaptSessionSummaries(
  sessions: WorkoutSession[],
  trainers: Trainer[],
): JournalEntry[] {
  return (sessions || [])
    .filter((s) => (s.notes || "").trim())
    .map((s) => {
      const author = resolveTrainer(trainers, s.trainerId, s.trainerInitials);
      const when = toDate(s.startTime) || toDate(s.date) || new Date();
      return legacyEntry({
        id: `legacy:sessions:${s.id}`,
        clientId: s.clientId || "",
        studioId: s.hostedAtStudioId || s.clientHomeStudioId || "",
        kind: "general",
        body: s.notes as string,
        origin: "post_session",
        sessionId: s.id || null,
        occurredAt: Timestamp.fromDate(when),
        authorId: author.id,
        authorInitials: author.initials,
        authorName: author.fullName,
        legacySource: "Session summary",
      });
    });
}

/** Old one-focus-per-trainer docs → ClientFocus shape for the focus board. */
function adaptTrainerFocuses(
  focuses: TrainerFocus[],
  trainers: Trainer[],
): ClientFocus[] {
  return (focuses || [])
    .filter((f) => (f.notes || "").trim())
    .map((f) => {
      const author = resolveTrainer(trainers, f.trainerId);
      return {
        id: `legacy:trainerFocuses:${f.id}`,
        clientId: f.clientId,
        studioId: f.studioId || "",
        trainerId: f.trainerId,
        trainerName: f.trainerName || author.fullName,
        trainerInitials: author.initials,
        category: f.category as FocusCategory,
        intent: f.notes,
        targetMachineId: null,
        status: "active",
        startedAt: f.updatedAt,
        reviewDueAt: null,
        passedAt: null,
        lastExtendedAt: null,
        extensionCount: 0,
        checkInCount: 0,
        lastCheckInAt: null,
        createdAt: f.updatedAt,
        updatedAt: f.updatedAt,
        isLegacy: true,
      } as ClientFocus;
    });
}

/* ------------------------------------------------------------------ */
/* THE HOOK                                                            */
/* ------------------------------------------------------------------ */

/** Whether one group of the journal's collections has answered. */
export type JournalLoad = "loading" | "ready" | "failed";

/**
 * Per-group read state (client codex, phase 1). A failed read is "unknown",
 * never "empty": a screen that would say "No notes yet" says it could not
 * load them instead. A group is `failed` if ANY of its listeners failed,
 * `loading` until every one of them has answered, and `ready` after that.
 *
 *   notes    - journalEntries, sessionNotes, clinicalIncidents
 *   focuses  - clientFocuses, focusRecords, trainerFocuses
 *   sessions - the session summaries (`recentSessions`)
 *
 * A listener that errors is finished; its group stays `failed` until the
 * client changes or the screen mounts again.
 */
export interface JournalLoadState {
  notes: JournalLoad;
  focuses: JournalLoad;
  sessions: JournalLoad;
}

/** Which listener belongs to which group. */
const LOAD_GROUPS: Record<keyof JournalLoadState, readonly string[]> = {
  notes: ["journalEntries", "sessionNotes", "clinicalIncidents"],
  focuses: ["clientFocuses", "focusRecords", "trainerFocuses"],
  sessions: ["sessions"],
};

/** Nothing has answered yet. One object, so the memo below stays put. */
const NO_LOADS: Record<string, JournalLoad> = {};
const NO_SESSIONS: WorkoutSession[] = [];

/** An empty list - the same array when it is already empty, so no re-render. */
function emptied<T>(prev: T[]): T[] {
  return prev.length ? [] : prev;
}

function groupLoad(by: Record<string, JournalLoad>, names: readonly string[]): JournalLoad {
  const states = names.map((n) => by[n] ?? "loading");
  if (states.includes("failed")) return "failed";
  if (states.includes("loading")) return "loading";
  return "ready";
}

export interface UseClientJournalArgs {
  clientId: string | null;
  client: Client | null;
  trainers: Trainer[];
  /** Pause every subscription (e.g. the app is in a quota-error state). */
  enabled?: boolean;
}

export interface UseClientJournalResult {
  /** Notes in their own right — thread updates are inside `threads`, not here. */
  entries: JournalEntry[];
  /**
   * The same notes as threads: a root and the updates hung off it. Optional
   * on the TYPE only so a fixture built before the Notes round still
   * typechecks; the hook always returns it. Read it as `threads ?? []`.
   */
  threads?: NoteThread[];
  focuses: ClientFocus[];
  criticalEntries: JournalEntry[];
  /**
   * Heads ups still worth reading out (reporting round, Sep 2026): elevated,
   * unresolved, inside their "until" day or the three-week window. Optional
   * on the TYPE only so a fixture built before the round still typechecks;
   * the hook always returns it. Read it as `headsUpEntries ?? []`.
   */
  headsUpEntries?: JournalEntry[];
  isLoading: boolean;
  /** True when the composite index has not been deployed yet. */
  needsIndex: boolean;
  /** True when a per-client collection hit JOURNAL_GUARD_LIMIT, so counts may be short. */
  capped: boolean;
  /**
   * Whether each group of collections has answered (client codex, phase 1).
   * Optional on the TYPE only so a fixture built before it still typechecks;
   * the hook always returns it. Read a missing one as unknown, never ready.
   */
  loadState?: JournalLoadState;
  /**
   * The client's newest sessions (up to SESSION_SUMMARY_LIMIT, date desc),
   * from the listener this hook already runs for the session wrap-ups - no
   * second sessions query on a screen that holds the journal. Session
   * documents only, no exercise logs. Empty until `loadState.sessions` is
   * `ready` for THIS client - never the last client's rows while this one's
   * sessions are still on their way. Optional on the TYPE only, like
   * `loadState`.
   */
  recentSessions?: WorkoutSession[];
}

export function useClientJournal({
  clientId,
  client,
  trainers,
  enabled = true,
}: UseClientJournalArgs): UseClientJournalResult {
  const [native, setNative] = useState<JournalEntry[]>([]);
  const [nativeFocuses, setNativeFocuses] = useState<ClientFocus[]>([]);
  const [legacyFocusRecords, setLegacyFocusRecords] = useState<FocusRecord[]>([]);
  const [legacyNotes, setLegacyNotes] = useState<SessionNote[]>([]);
  const [legacyIncidents, setLegacyIncidents] = useState<ClinicalIncident[]>([]);
  const [legacyTrainerFocuses, setLegacyTrainerFocuses] = useState<TrainerFocus[]>([]);
  const [legacySessions, setLegacySessions] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [needsIndex, setNeedsIndex] = useState(false);
  const [cappedBy, setCappedBy] = useState<Record<string, boolean>>({});
  // Keyed by client, so an answer for the last client never reads as this
  // client's (the listeners are re-created per client; the state is not).
  const [loadBy, setLoadBy] = useState<{ key: string | null; by: Record<string, JournalLoad> }>({
    key: null,
    by: {},
  });

  // Guards the ordered-query -> unordered-query fallback from looping.
  const fellBackRef = useRef(false);

  /** Records whether a collection's snapshot came back exactly at the guard rail. */
  const noteCap = (name: string, size: number) =>
    setCappedBy((prev) => {
      const hit = size >= JOURNAL_GUARD_LIMIT;
      if (Boolean(prev[name]) === hit) return prev;
      return { ...prev, [name]: hit };
    });

  /** Records a listener's answer for this client. A no-op when nothing changed. */
  const markLoad = (key: string, name: string, state: JournalLoad) =>
    setLoadBy((prev) => {
      const by = prev.key === key ? prev.by : {};
      if (prev.key === key && by[name] === state) return prev;
      return { key, by: { ...by, [name]: state } };
    });

  /* --- native journalEntries -------------------------------------- */
  useEffect(() => {
    if (!clientId || !enabled) {
      setNative([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fellBackRef.current = false;

    let unsub: (() => void) | undefined;

    const subscribe = (ordered: boolean) => {
      const q = ordered
        ? query(
            collection(db, "journalEntries"),
            where("clientId", "==", clientId),
            orderBy("occurredAt", "desc"),
            limit(STREAM_LIMIT),
          )
        : query(
            collection(db, "journalEntries"),
            where("clientId", "==", clientId),
            limit(STREAM_LIMIT),
          );

      unsub = onSnapshot(
        q,
        (snap) => {
          setNative(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JournalEntry),
          );
          setIsLoading(false);
          markLoad(clientId, "journalEntries", "ready");
        },
        (err: any) => {
          // failed-precondition == "this query needs a composite index".
          // Rather than showing an empty journal until someone runs
          // `firebase deploy --only firestore:indexes`, drop the orderBy and
          // sort in memory. Same data, one extra sort.
          if (err?.code === "failed-precondition" && !fellBackRef.current) {
            fellBackRef.current = true;
            setNeedsIndex(true);
            unsub?.();
            subscribe(false);
            return;
          }
          // Recorded first: handleFirestoreError throws outside a browser.
          markLoad(clientId, "journalEntries", "failed");
          handleFirestoreError(err, OperationType.GET, "journalEntries");
          setIsLoading(false);
        },
      );
    };

    subscribe(true);
    return () => unsub?.();
  }, [clientId, enabled]);

  /* --- native clientFocuses ---------------------------------------- */
  useEffect(() => {
    if (!clientId || !enabled) {
      setNativeFocuses([]);
      setCappedBy({});
      return;
    }
    // Single-field equality only — no composite index required. The limit is
    // the guard rail (JOURNAL_GUARD_LIMIT), unordered on purpose.
    const q = query(
      collection(db, "clientFocuses"),
      where("clientId", "==", clientId),
      limit(JOURNAL_GUARD_LIMIT),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNativeFocuses(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientFocus),
        );
        noteCap("clientFocuses", snap.size);
        markLoad(clientId, "clientFocuses", "ready");
      },
      (err) => {
        markLoad(clientId, "clientFocuses", "failed");
        handleFirestoreError(err, OperationType.GET, "clientFocuses");
      },
    );
    return () => unsub();
  }, [clientId, enabled]);

  /* --- legacy collections, all live -------------------------------- */
  useEffect(() => {
    // Emptied on every (re)subscribe, not only when there is no client: the
    // listeners below are re-created per client but the state is not, so
    // without this the last client's legacy notes and session wrap-ups sat
    // in this client's `entries` until each listener answered - and one
    // group (say the notes) could read `ready` while another still held the
    // last client's rows (client codex, phase 1).
    setLegacyFocusRecords(emptied);
    setLegacyNotes(emptied);
    setLegacyIncidents(emptied);
    setLegacyTrainerFocuses(emptied);
    setLegacySessions(emptied);
    if (!clientId || !enabled) return;

    // Deliberately unordered equality queries: they need no composite index and
    // the result set per client is small enough to sort in memory. Each carries
    // the guard rail (JOURNAL_GUARD_LIMIT) so a runaway client can't open
    // thousands of documents.
    const subs = [
      onSnapshot(
        query(
          collection(db, "focusRecords"),
          where("clientId", "==", clientId),
          limit(JOURNAL_GUARD_LIMIT),
        ),
        (s) => {
          setLegacyFocusRecords(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as FocusRecord),
          );
          noteCap("focusRecords", s.size);
          markLoad(clientId, "focusRecords", "ready");
        },
        (e) => {
          markLoad(clientId, "focusRecords", "failed");
          handleFirestoreError(e, OperationType.GET, "focusRecords");
        },
      ),
      onSnapshot(
        query(
          collection(db, "sessionNotes"),
          where("clientId", "==", clientId),
          limit(LEGACY_NOTE_LIMIT),
        ),
        (s) => {
          setLegacyNotes(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionNote),
          );
          markLoad(clientId, "sessionNotes", "ready");
        },
        (e) => {
          markLoad(clientId, "sessionNotes", "failed");
          handleFirestoreError(e, OperationType.GET, "sessionNotes");
        },
      ),
      onSnapshot(
        query(
          collection(db, "clinicalIncidents"),
          where("clientId", "==", clientId),
          limit(JOURNAL_GUARD_LIMIT),
        ),
        (s) => {
          setLegacyIncidents(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as ClinicalIncident),
          );
          noteCap("clinicalIncidents", s.size);
          markLoad(clientId, "clinicalIncidents", "ready");
        },
        (e) => {
          markLoad(clientId, "clinicalIncidents", "failed");
          handleFirestoreError(e, OperationType.GET, "clinicalIncidents");
        },
      ),
      onSnapshot(
        query(
          collection(db, "trainerFocuses"),
          where("clientId", "==", clientId),
          limit(JOURNAL_GUARD_LIMIT),
        ),
        (s) => {
          setLegacyTrainerFocuses(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainerFocus),
          );
          noteCap("trainerFocuses", s.size);
          markLoad(clientId, "trainerFocuses", "ready");
        },
        (e) => {
          markLoad(clientId, "trainerFocuses", "failed");
          handleFirestoreError(e, OperationType.GET, "trainerFocuses");
        },
      ),
      // Session wrap-up text lives on the session document itself. The journal
      // owns this subscription rather than taking `sessions` as a prop: the
      // profile view only loads sessions on some tabs, which would make the
      // timeline's contents depend on which tab you happened to open first.
      // Session docs only — no exercise logs — so the read cost stays small.
      // Also handed out as `recentSessions` (client codex, phase 1), so a
      // screen that holds the journal never opens a second sessions query.
      onSnapshot(
        query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          orderBy("date", "desc"),
          limit(SESSION_SUMMARY_LIMIT),
        ),
        (s) => {
          setLegacySessions(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as WorkoutSession),
          );
          markLoad(clientId, "sessions", "ready");
        },
        (e) => {
          markLoad(clientId, "sessions", "failed");
          handleFirestoreError(e, OperationType.GET, "sessions");
        },
      ),
    ];

    return () => subs.forEach((u) => u());
  }, [clientId, enabled]);

  /* --- merge -------------------------------------------------------- */
  const allEntries = useMemo(() => {
    const merged: JournalEntry[] = [
      ...native.filter((e) => !e.isArchived),
      ...adaptSessionNotes(legacyNotes, trainers),
      ...adaptIncidents(legacyIncidents, trainers),
      ...adaptEventsToJournal(client),
      ...adaptProfileFields(client),
      ...adaptSessionSummaries(legacySessions, trainers),
    ];

    // A migrated entry carries the id of the legacy doc it came from; drop the
    // adapter's copy so a future migration can't double up the stream.
    const migrated = new Set(
      native.map((e) => (e as any).legacyRef).filter(Boolean),
    );

    const seen = new Set<string>();
    return merged
      .filter((e) => {
        if (!e.id || seen.has(e.id)) return false;
        if (migrated.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => {
        const at = toDate(a.occurredAt)?.getTime() ?? 0;
        const bt = toDate(b.occurredAt)?.getTime() ?? 0;
        return bt - at;
      });
  }, [
    native,
    legacyNotes,
    legacyIncidents,
    legacySessions,
    client,
    trainers,
  ]);

  /**
   * THREADS (Notes round, Sep 2026). `entries` stays the flat list every
   * screen already reads — with thread UPDATES taken out, so an update never
   * renders twice: once inside its thread and once as a note of its own.
   * `threads` is the same records grouped, root first then its spine.
   * features/client-notes/threads.ts is the one place that grouping happens.
   */
  const entries = useMemo(() => withoutThreadUpdates(allEntries), [allEntries]);
  const threads = useMemo(() => assembleThreads(allEntries), [allEntries]);

  const focuses = useMemo(() => {
    // Precedence: a real clientFocuses doc beats a legacy focusRecord, which
    // beats the old one-per-trainer trainerFocuses doc. Deduped on
    // trainer + category so a trainer who was migrated forward does not appear
    // three times on the board saying the same thing.
    const out: ClientFocus[] = [...nativeFocuses];
    const claimed = new Set(
      nativeFocuses
        .filter((f) => f.status === "active")
        .map((f) => `${f.trainerId}|${f.category}`),
    );

    const consider = (candidates: ClientFocus[]) => {
      candidates.forEach((f) => {
        const key = `${f.trainerId}|${f.category}`;
        if (f.status === "active") {
          if (claimed.has(key)) return;
          claimed.add(key);
        }
        out.push(f);
      });
    };

    consider(adaptFocusRecords(legacyFocusRecords, trainers));
    consider(adaptTrainerFocuses(legacyTrainerFocuses, trainers));

    return out.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      const at = toDate(a.startedAt)?.getTime() ?? 0;
      const bt = toDate(b.startedAt)?.getTime() ?? 0;
      return bt - at;
    });
  }, [nativeFocuses, legacyFocusRecords, legacyTrainerFocuses, trainers]);

  /**
   * What the pre-session briefing shows: anything marked critical that hasn't
   * been resolved, and whose effective window (if it has one) still covers
   * today. A post-op restriction that expired last month should not be
   * shouting at anyone.
   */
  const criticalEntries = useMemo(() => {
    // One rule for "does this matter today" (features/client-notes/mattering.ts):
    // a note with no window matters until resolved, exactly as before; a
    // range ends on its day; a DAY note shows on its day only; a start pushed
    // ahead waits.
    const today = studioDateKey(new Date());
    return entries.filter((e) => e.importance === "critical" && today !== null && mattersOn(e, today));
  }, [entries]);

  const headsUpEntries = useMemo(() => {
    const now = Date.now();
    return entries.filter((e) => isHeadsUpLive(e, now));
  }, [entries]);

  const capped = Object.values(cappedBy).some(Boolean);

  // Nothing answered for THIS client yet (or the hook is paused) reads as
  // loading, never as ready.
  const loadFor = enabled && clientId && loadBy.key === clientId ? loadBy.by : NO_LOADS;
  const loadState = useMemo<JournalLoadState>(
    () => ({
      notes: groupLoad(loadFor, LOAD_GROUPS.notes),
      focuses: groupLoad(loadFor, LOAD_GROUPS.focuses),
      sessions: groupLoad(loadFor, LOAD_GROUPS.sessions),
    }),
    [loadFor],
  );

  return {
    entries,
    threads,
    focuses,
    criticalEntries,
    headsUpEntries,
    isLoading,
    needsIndex,
    capped,
    loadState,
    // Gated on the sessions listener ITSELF, not on "anything answered for
    // this client": the journal or focus listeners can answer first, while
    // `legacySessions` still holds the last client's rows (the effect's reset
    // lands a render after the client changes). The rows and their "ready"
    // are set in the same callback, so they arrive together.
    recentSessions: loadFor.sessions === "ready" ? legacySessions : NO_SESSIONS,
  };
}
