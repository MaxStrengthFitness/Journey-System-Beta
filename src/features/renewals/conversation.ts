/**
 * RENEWALS — renewal conversations, the pure half.
 *
 * AJ, Sep 10 2026: "Trainers should be able to update and communicate the
 * clients thoughts on renewal so head trainers and studio leaders know how to
 * react, so that way leaders can log in to a client and know if and who has
 * talked to them about renewals and also how the client is feeling and what
 * they may be on the fence about."
 *
 * So a conversation is one small record — who, when, how they're leaning,
 * what they're on the fence about, an optional note, and "needs a leader" —
 * and the cycle document carries the latest of each so a list can show it
 * without reading every conversation. The writes live in useRenewalCycle.ts.
 */

import { dayLabel } from "./sentences";
import { studioDateKey } from "../../lib/studio-time";
import type {
  RenewalConcern,
  RenewalCycle,
  RenewalInterest,
  RenewalLeaning,
  RenewalSnapshot,
  RenewalStage,
  RenewalTouch,
} from "./types";

export const LEANINGS: Array<{ key: RenewalLeaning; label: string }> = [
  { key: "renewing", label: "Renewing" },
  { key: "leaning-yes", label: "Leaning yes" },
  { key: "unsure", label: "Unsure" },
  { key: "leaning-no", label: "Leaning no" },
  { key: "not-renewing", label: "Not renewing" },
];

export const CONCERNS: Array<{ key: RenewalConcern; label: string }> = [
  { key: "price", label: "Price" },
  { key: "commitment-length", label: "Commitment length" },
  { key: "results", label: "Results" },
  { key: "schedule", label: "Schedule" },
  { key: "health", label: "Health" },
  { key: "travel", label: "Travel" },
  { key: "trainer-fit", label: "Trainer fit" },
  { key: "other", label: "Other" },
];

export const INTERESTS: Array<{ key: RenewalInterest; label: string }> = [
  { key: "same", label: "The same package" },
  { key: "longer", label: "A longer package" },
  { key: "shorter", label: "A shorter package" },
  { key: "prepay", label: "Paying in full" },
  { key: "monthly", label: "Paying monthly" },
];

export const STAGES: Array<{ key: RenewalStage; label: string }> = [
  { key: "not-started", label: "Not started" },
  { key: "talking", label: "Talking" },
  { key: "decided", label: "Decided" },
];

export const NOTE_MAX = 500;

export const leaningLabel = (k: RenewalLeaning | null | undefined) =>
  LEANINGS.find((l) => l.key === k)?.label ?? "";
export const concernLabel = (k: RenewalConcern) => CONCERNS.find((c) => c.key === k)?.label ?? k;
export const interestLabel = (k: RenewalInterest | null | undefined) =>
  INTERESTS.find((i) => i.key === k)?.label ?? "";

/** Stage as the pipeline shows it: a logged conversation means "talking" until a leader says otherwise. */
export function effectiveStage(cycle: Pick<RenewalCycle, "stage" | "lastTouchAt"> | null | undefined): RenewalStage {
  if (cycle?.stage) return cycle.stage;
  return cycle?.lastTouchAt ? "talking" : "not-started";
}

export interface ConversationDraft {
  leaning: RenewalLeaning | null;
  concerns: RenewalConcern[];
  interestedIn: RenewalInterest | null;
  note: string;
  needsLeader: boolean;
}

export const EMPTY_DRAFT: ConversationDraft = {
  leaning: null,
  concerns: [],
  interestedIn: null,
  note: "",
  needsLeader: false,
};

/** What's missing before a conversation can be saved, in words; null when ready. */
export function draftProblem(d: ConversationDraft): string | null {
  if (!d.leaning) return "Pick how they're leaning.";
  if (d.note.length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`;
  return null;
}

/**
 * The two documents a logged conversation writes, before timestamps. The
 * cycle patch holds ONLY the fields a trainer may write (firestore.rules
 * enforces the same list), so a trainer can log a conversation without being
 * able to set the stage, the lead or the outcome.
 */
export function conversationWrites(params: {
  draft: ConversationDraft;
  clientId: string;
  clientName: string;
  cycleKey: string;
  snapshot: Pick<RenewalSnapshot, "packageKey" | "chargeDate"> | null;
  authorId: string;
  authorName: string;
}): {
  touch: Omit<RenewalTouch, "at">;
  cycle: Omit<RenewalCycle, "lastTouchAt" | "touchCount" | "stage" | "leadTrainerId">;
} {
  const { draft, clientId, clientName, cycleKey, snapshot, authorId, authorName } = params;
  const concerns = Array.from(new Set(draft.concerns)).filter((c) => CONCERNS.some((x) => x.key === c));
  const note = draft.note.trim().slice(0, NOTE_MAX);
  const leaning = draft.leaning ?? "unsure";
  return {
    touch: {
      clientId,
      authorId,
      authorName,
      leaning,
      concerns,
      interestedIn: draft.interestedIn,
      note,
      needsLeader: draft.needsLeader,
    },
    cycle: {
      clientId,
      clientName,
      cycleKey,
      packageKey: snapshot?.packageKey ?? null,
      chargeDate: snapshot?.chargeDate ?? null,
      latestLeaning: leaning,
      latestConcerns: concerns,
      latestInterestedIn: draft.interestedIn,
      needsLeader: draft.needsLeader,
      lastTouchBy: authorId,
      lastTouchByName: authorName,
    },
  };
}

/** The studio's day of a stored timestamp. */
function dayOf(value: unknown): string | null {
  return studioDateKey((value ?? null) as any);
}

/**
 * The one line the briefing and lists show: "Unsure — price, results.
 * Jen, Sep 3. Needs a leader." Null when nobody has talked to them yet.
 */
export function latestLine(cycle: RenewalCycle | null | undefined, today: string): string | null {
  if (!cycle?.latestLeaning) return null;
  const concerns = (cycle.latestConcerns ?? []).map(concernLabel).join(", ").toLowerCase();
  const who = (cycle.lastTouchByName ?? "").split(" ")[0];
  const when = dayLabel(dayOf(cycle.lastTouchAt), today);
  return [
    `${leaningLabel(cycle.latestLeaning)}${concerns ? ` — ${concerns}` : ""}.`,
    who || when ? `${[who, when].filter(Boolean).join(", ")}.` : null,
    cycle.needsLeader ? "Needs a leader." : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Should the post-session screen ask about the renewal today? */
export function renewalPromptDue(s: RenewalSnapshot | null | undefined): boolean {
  if (!s) return false;
  if (s.situation === "away" || s.situation === "lapsed" || s.situation === "unknown") return false;
  return s.conversationDue || s.chargeWarning || s.situation === "ended";
}

/** The post-session question, in the floor's words. */
export function promptText(s: RenewalSnapshot): string {
  if (s.situation === "ended") return "Their package has ended. Talk about renewing today?";
  if (s.chargeWarning && s.bankedAtCharge !== null) {
    return `Auto-renews with about ${s.bankedAtCharge} sessions banked. Talk about it today?`;
  }
  return `Renewal: ${s.sessionsLeft ?? "a few"} left. Talk about it today?`;
}
