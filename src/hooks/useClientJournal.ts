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
  type LifeCategory,
} from "../types/journal";

const STREAM_LIMIT = 300;
const LEGACY_NOTE_LIMIT = 200;
const SESSION_SUMMARY_LIMIT = 40;

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
 * Passed = the client has got it. Retired = abandoned without being met.
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

  try {
    await updateDoc(doc(db, "clientFocuses", focusId), {
      status,
      passedAt: status === "passed" ? Timestamp.now() : null,
      updatedAt: serverTimestamp(),
    });
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

const EVENT_TO_LIFE: Record<string, LifeCategory> = {
  "Birthday/Anniversary": "Birthday",
  Vacation: "Vacation",
  Snowbird: "Vacation",
  Medical: "Surgery",
  "Progress Report": "Milestone",
  "InBody Scan": "Milestone",
  "Routine Change": "Milestone",
  Alert: "Other",
  Other: "Other",
};

/** client.events[] → life entries, so birthdays sit in the same stream. */
function adaptClientEvents(client: Client | null): JournalEntry[] {
  if (!client?.events?.length) return [];
  return (client.events as ClientEvent[])
    .filter((e) => e && e.date)
    .map((e) => {
      const when = toDate(e.date) || new Date();
      const isAlert = e.type === "Alert" || e.type === "Medical";
      const body = e.notes ? `${e.title}\n${e.notes}` : e.title;
      return legacyEntry({
        id: `legacy:clientEvents:${e.id || e.date + e.title}`,
        clientId: client.id || "",
        studioId: client.homeStudioId || "",
        kind: isAlert ? "life" : "life",
        category: EVENT_TO_LIFE[e.type] || "Other",
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
    });
}

/**
 * Read-only profile fields, including Mindbody's imported account notes.
 *
 * Dated to the client's record rather than to "now", because that is when they
 * are true of: intake notes belong at the start of the client's history, not
 * at the top of today's stream. So that they stay reachable rather than
 * sinking to the bottom of a long timeline, the Journal also pins
 * consultation-kind entries to a reference shelf in the sidebar.
 *
 * All flagged legacy, so nobody tries to edit them here — Mindbody is the
 * system of record for its own notes, and the rest are edited on the profile.
 */
function adaptProfileFields(client: Client | null): JournalEntry[] {
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
  push("medicalHistory", client.medicalHistory, "life", "Medical history", "elevated");
  push("clinicalNotes", client.clinicalNotes, "life", "Clinical notes", "elevated");
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

export interface UseClientJournalArgs {
  clientId: string | null;
  client: Client | null;
  trainers: Trainer[];
  /** Pause every subscription (e.g. the app is in a quota-error state). */
  enabled?: boolean;
}

export interface UseClientJournalResult {
  entries: JournalEntry[];
  focuses: ClientFocus[];
  criticalEntries: JournalEntry[];
  isLoading: boolean;
  /** True when the composite index has not been deployed yet. */
  needsIndex: boolean;
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

  // Guards the ordered-query -> unordered-query fallback from looping.
  const fellBackRef = useRef(false);

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
      return;
    }
    // Single-field equality only — no composite index required.
    const q = query(
      collection(db, "clientFocuses"),
      where("clientId", "==", clientId),
    );
    const unsub = onSnapshot(
      q,
      (snap) =>
        setNativeFocuses(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientFocus),
        ),
      (err) => handleFirestoreError(err, OperationType.GET, "clientFocuses"),
    );
    return () => unsub();
  }, [clientId, enabled]);

  /* --- legacy collections, all live -------------------------------- */
  useEffect(() => {
    if (!clientId || !enabled) {
      setLegacyFocusRecords([]);
      setLegacyNotes([]);
      setLegacyIncidents([]);
      setLegacyTrainerFocuses([]);
      setLegacySessions([]);
      return;
    }

    // Deliberately unordered equality queries: they need no composite index and
    // the result set per client is small enough to sort in memory.
    const subs = [
      onSnapshot(
        query(collection(db, "focusRecords"), where("clientId", "==", clientId)),
        (s) =>
          setLegacyFocusRecords(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as FocusRecord),
          ),
        (e) => handleFirestoreError(e, OperationType.GET, "focusRecords"),
      ),
      onSnapshot(
        query(
          collection(db, "sessionNotes"),
          where("clientId", "==", clientId),
          limit(LEGACY_NOTE_LIMIT),
        ),
        (s) =>
          setLegacyNotes(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionNote),
          ),
        (e) => handleFirestoreError(e, OperationType.GET, "sessionNotes"),
      ),
      onSnapshot(
        query(
          collection(db, "clinicalIncidents"),
          where("clientId", "==", clientId),
        ),
        (s) =>
          setLegacyIncidents(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as ClinicalIncident),
          ),
        (e) => handleFirestoreError(e, OperationType.GET, "clinicalIncidents"),
      ),
      onSnapshot(
        query(
          collection(db, "trainerFocuses"),
          where("clientId", "==", clientId),
        ),
        (s) =>
          setLegacyTrainerFocuses(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainerFocus),
          ),
        (e) => handleFirestoreError(e, OperationType.GET, "trainerFocuses"),
      ),
      // Session wrap-up text lives on the session document itself. The journal
      // owns this subscription rather than taking `sessions` as a prop: the
      // profile view only loads sessions on some tabs, which would make the
      // timeline's contents depend on which tab you happened to open first.
      // Session docs only — no exercise logs — so the read cost stays small.
      onSnapshot(
        query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          orderBy("date", "desc"),
          limit(SESSION_SUMMARY_LIMIT),
        ),
        (s) =>
          setLegacySessions(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as WorkoutSession),
          ),
        (e) => handleFirestoreError(e, OperationType.GET, "sessions"),
      ),
    ];

    return () => subs.forEach((u) => u());
  }, [clientId, enabled]);

  /* --- merge -------------------------------------------------------- */
  const entries = useMemo(() => {
    const merged: JournalEntry[] = [
      ...native.filter((e) => !e.isArchived),
      ...adaptSessionNotes(legacyNotes, trainers),
      ...adaptIncidents(legacyIncidents, trainers),
      ...adaptClientEvents(client),
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
    const now = Date.now();
    return entries.filter((e) => {
      if (e.importance !== "critical") return false;
      if (e.resolvedAt) return false;
      const until = toDate(e.effectiveUntil);
      if (until && until.getTime() < now) return false;
      return true;
    });
  }, [entries]);

  return { entries, focuses, criticalEntries, isLoading, needsIndex };
}
