/**
 * INACTIVE — the end of the line, and a leader's mark. Pure: inactive.test.ts.
 *
 * The inactive round (Oct 1 2026). AJ: "Studios should be able to mark a
 * client inactive or also set a 'automatic inactive after'. Studio leaders
 * already have a MIA list. This should work together so a client is
 * active>MIA>inactive and studios can customize time or manually set clients
 * inactive and also view the mia list and inactive list to possibly work on
 * retention or win backs."
 *
 * TWO WAYS IN, one state (states.ts `journeyOf` decides):
 *
 *   automatic   past the studio's Inactive line (`inactiveDays`, 90 by
 *               default, always past Lapsed) since her last visit, with
 *               nothing booked — judged only where Lapsed could be: a client
 *               Journey can't judge stays Unknown, never Inactive off a low
 *               Journey count; Away is never made Inactive by itself.
 *   manual      a leader marked her inactive, with a reason, signed and dated
 *               (studios/{s}/inactiveMarks/{clientId}; AJ: leaders only).
 *
 * ONE WAY OUT: a booking. A new booking makes her active again and she reads
 * Back (the existing state). A visit after the day she was marked means the
 * mark no longer holds: she came back, and the rules decide her state again.
 * A mark is only ever removed by a leader (Mark active again); nothing else
 * deletes it.
 *
 * The mark's document, exactly (firestore.rules "the inactive round"):
 *
 *   studios/{studioId}/inactiveMarks/{clientId}
 *     { clientId, reason: one of INACTIVE_REASONS, note?: string (≤ 300),
 *       day: 'yyyy-mm-dd' (the studio day it was marked),
 *       markedBy: { id: <Auth uid>, name }, markedAt: <server time> }
 */

export const INACTIVE_MARKS = "inactiveMarks";

export type InactiveReason = "moved" | "health" | "cost" | "schedule" | "break" | "other";

/** The pick list, in the order it is offered. */
export const INACTIVE_REASONS: readonly InactiveReason[] = ["moved", "health", "cost", "schedule", "break", "other"];

export const INACTIVE_REASON_WORDS: Record<InactiveReason, string> = {
  moved: "Moved away",
  health: "Injury or health",
  cost: "Cost",
  schedule: "Schedule or time",
  break: "Taking a break, by choice",
  other: "Other",
};

/** The rules' limits. */
export const INACTIVE_LIMITS = { note: 300, name: 120 } as const;

const DAY_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface InactiveMark {
  clientId: string;
  reason: InactiveReason;
  note: string | null;
  /** The studio day she was marked inactive. */
  day: string;
  markedBy: { id: string; name: string };
  markedAt: Date | null;
}

const toDateOrNull = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") {
    const d = (v as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
};

/** A stored mark, read defensively; null when it isn't one a screen can stand behind. */
export function parseInactiveMark(id: string, data: Record<string, unknown> | null | undefined): InactiveMark | null {
  if (!data) return null;
  const reason = INACTIVE_REASONS.includes(data.reason as InactiveReason) ? (data.reason as InactiveReason) : null;
  const day = typeof data.day === "string" && DAY_KEY.test(data.day) ? data.day : null;
  const by = data.markedBy as { id?: unknown; name?: unknown } | undefined;
  if (!reason || !day || !by || typeof by.id !== "string" || !by.id) return null;
  return {
    clientId: typeof data.clientId === "string" && data.clientId ? data.clientId : id,
    reason,
    note: typeof data.note === "string" && data.note.trim() ? data.note.trim() : null,
    day,
    markedBy: { id: by.id, name: typeof by.name === "string" ? by.name : "" },
    markedAt: toDateOrNull(data.markedAt),
  };
}

/** What a leader fills in. */
export interface InactiveDraft {
  reason: InactiveReason | null;
  note: string;
}

export const EMPTY_INACTIVE_DRAFT: InactiveDraft = { reason: null, note: "" };

/** Why a draft can't be saved, in words, or null when it can. */
export function inactiveDraftProblem(d: InactiveDraft): string | null {
  if (!d.reason || !INACTIVE_REASONS.includes(d.reason)) return "Choose a reason.";
  if (d.note.trim().length > INACTIVE_LIMITS.note) return `Keep the note to ${INACTIVE_LIMITS.note} characters.`;
  return null;
}

/** The whole document a mark writes (`now` is the server's time sentinel). Never sends undefined. */
export function inactiveMarkDoc(clientId: string, d: InactiveDraft, day: string, by: { id: string; name: string }, now: unknown) {
  const problem = inactiveDraftProblem(d);
  if (problem) throw new Error(problem);
  if (!DAY_KEY.test(day)) throw new Error("The studio's day couldn't be worked out. Try again.");
  const note = d.note.trim().slice(0, INACTIVE_LIMITS.note);
  return {
    clientId,
    reason: d.reason as InactiveReason,
    ...(note ? { note } : {}),
    day,
    markedBy: { id: by.id, name: by.name.trim().slice(0, INACTIVE_LIMITS.name) },
    markedAt: now,
  };
}

/** The mark still holds: she hasn't visited since the day she was marked. */
export function markHolds(mark: Pick<InactiveMark, "day">, lastVisit: string | null): boolean {
  return !lastVisit || lastVisit <= mark.day;
}

/** "Moved away", "Other: back in the spring". */
export function markReasonWords(mark: Pick<InactiveMark, "reason" | "note">): string {
  const words = INACTIVE_REASON_WORDS[mark.reason];
  return mark.note ? `${words}: ${mark.note}` : words;
}

/** Is she automatically past the Inactive line? Lapsed's own evidence: a known last visit, nothing booked as read. */
export function pastInactiveLine(daysSince: number | null, nothingBooked: boolean, inactiveDays: number): boolean {
  return daysSince !== null && nothingBooked && daysSince >= inactiveDays;
}
