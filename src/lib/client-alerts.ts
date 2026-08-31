import { Client, ClientEvent } from "../types";

/**
 * Two distinct at-a-glance signals for a client, derived from data the hub
 * already holds in memory (no extra Firestore reads per schedule block).
 *
 *  - PRIORITY NOTE  -> loud. Something a trainer must read before this session.
 *  - CLINICAL       -> subtle. Standing medical/clinical history worth knowing.
 */
export interface ClientAlertState {
  /** Loud signal: an explicit high-priority note is outstanding. */
  hasPriorityNote: boolean;
  /** Short human label for the priority note (tooltip / aria-label). */
  priorityLabel: string | null;
  /** Subtle signal: the client has clinical history on file. */
  hasClinicalHistory: boolean;
}

const EMPTY: ClientAlertState = {
  hasPriorityNote: false,
  priorityLabel: null,
  hasClinicalHistory: false,
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

export function getClientAlertState(client?: Client | null): ClientAlertState {
  if (!client) return EMPTY;

  const highEvent = (client.events || []).find(isActiveHighPriorityEvent);
  const pinned = client.priorityNote?.trim();

  const hasPriorityNote = Boolean(pinned || highEvent || client.hasPriorityNote);
  const priorityLabel =
    pinned || highEvent?.title || (hasPriorityNote ? "Priority note" : null);

  const hasClinicalHistory = Boolean(
    (client.clinicalProfile && client.clinicalProfile.length > 0) ||
      (client.clinicalFlags && client.clinicalFlags.length > 0) ||
      client.clinicalNotes ||
      client.medicalHistory,
  );

  return { hasPriorityNote, priorityLabel, hasClinicalHistory };
}
