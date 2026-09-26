import { Client, ClientEvent } from "../types";
import type { JournalEntry } from "../types/journal";
import { criticalNoteLabel } from "./hub-critical-notes";

/**
 * Two distinct at-a-glance signals for a client, derived from data the hub
 * already holds in memory (no extra Firestore reads per schedule block).
 *
 *  - PRIORITY NOTE  -> loud. Something a trainer must read before this session:
 *                      a Critical note that matters on the booking's day (read
 *                      once for the whole day by the Hub and handed in — see
 *                      hub-critical-notes.ts), or a legacy priority note on the
 *                      client record.
 *  - CLINICAL       -> subtle. Standing medical/clinical history worth knowing.
 *  - CHECK-IN FLAG  -> coaching. The last 90-day check-in scored Red in
 *                      Protein, Sleep & Recovery or Consistency & Habits
 *                      (the three the reference document says to auto-flag).
 */
export interface ClientAlertState {
  /** Loud signal: a live Critical note, or a legacy priority note, is outstanding. */
  hasPriorityNote: boolean;
  /** What it says, in whole sentences (tooltip / aria-label). */
  priorityLabel: string | null;
  /** Subtle signal: the client has clinical history on file. */
  hasClinicalHistory: boolean;
  /** Coaching signal: the latest 90-day check-in raised a Red flag. */
  hasCheckInRedFlag: boolean;
  /** e.g. "Sleep & Recovery is Red · Protein compliance is Red". */
  checkInFlagLabel: string | null;
  /** How many "watch" (softer) flags the latest check-in raised. */
  checkInWatchCount: number;
}

const EMPTY: ClientAlertState = {
  hasPriorityNote: false,
  priorityLabel: null,
  hasClinicalHistory: false,
  hasCheckInRedFlag: false,
  checkInFlagLabel: null,
  checkInWatchCount: 0,
};

/** Standing alert types never expire — they flag until a trainer clears them. */
const STANDING_EVENT_TYPES: ClientEvent["type"][] = ["Alert", "Medical"];

const startOfToday = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const parseDay = (value?: string): number | null => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * A High-priority event flags the schedule block when it is either a standing
 * alert (Alert / Medical) or still inside its active date window. This stops a
 * High-priority "Progress Report" from last year lighting up today's grid.
 */
export const isActiveHighPriorityEvent = (event?: ClientEvent | null): boolean => {
  if (!event || event.priority !== "High") return false;
  if (STANDING_EVENT_TYPES.includes(event.type)) return true;

  const today = startOfToday();
  const end = parseDay(event.endDate);
  if (end !== null) return end >= today;

  const start = parseDay(event.date);
  return start !== null ? start >= today : false;
};

/**
 * `criticalNotes` is the client's Critical notes that matter on the booking's
 * day — `criticalNotesOn(...)` over the Hub's one read. Leave it out, or pass
 * `[]` while that read is unknown: the legacy fields still speak for
 * themselves, and nothing is inferred from a read that has not answered.
 */
export function getClientAlertState(
  client?: Client | null,
  criticalNotes: readonly JournalEntry[] = [],
): ClientAlertState {
  if (!client) return EMPTY;

  const highEvent = (client.events || []).find(isActiveHighPriorityEvent);
  const pinned = client.priorityNote?.trim();

  /* The legacy fields: nothing in the app writes them any more, but a record
     imported with one still carries it, and it is still read. */
  const legacyPriority = Boolean(pinned || highEvent || client.hasPriorityNote);
  const legacyWords = pinned || highEvent?.title || null;
  const criticalWords = criticalNoteLabel(criticalNotes);

  const hasPriorityNote = legacyPriority || criticalNotes.length > 0;
  const priorityLabel =
    [criticalWords, legacyWords].filter(Boolean).join(" · ") ||
    (hasPriorityNote ? "Priority note" : null);

  const hasClinicalHistory = Boolean(
    (client.clinicalProfile && client.clinicalProfile.length > 0) ||
      (client.clinicalFlags && client.clinicalFlags.length > 0) ||
      client.clinicalNotes ||
      client.medicalHistory,
  );

  const snapshotFlags = client.subjectiveSnapshot?.flags || [];
  const redFlags = snapshotFlags.filter((f) => f.severity === "red");
  const hasCheckInRedFlag = redFlags.length > 0;
  const checkInFlagLabel = hasCheckInRedFlag
    ? redFlags.map((f) => f.label).join(" · ")
    : null;
  const checkInWatchCount = snapshotFlags.filter((f) => f.severity === "watch").length;

  return {
    hasPriorityNote,
    priorityLabel,
    hasClinicalHistory,
    hasCheckInRedFlag,
    checkInFlagLabel,
    checkInWatchCount,
  };
}
