/**
 * FORD — Family, Occupation, Recreation, Dreams.
 *
 * The studio's clients are not users of this app. Everything the team knows
 * about them as people arrives the same way it always has: someone mentions a
 * grandson's graduation between sets, and either it is remembered or it is
 * gone. FORD is the discipline of catching those lines, and this module is
 * where they live.
 *
 * WHERE THE DATA SITS, AND WHY
 * ----------------------------
 * One document per detail, at `clients/{clientId}/ford/{fordId}`.
 *
 * Deliberately NOT in `journalEntries`. The journal is readable by any signed
 * in user in the live rules; a client's home life is not company-wide reading.
 * A subcollection under the client inherits the client's studio scoping, which
 * is the tightest boundary the app has. It is also still queryable ACROSS
 * clients through a collection group query on `ford` — that is what feeds the
 * Delight queue and, later, the event planner. Both properties at once is the
 * whole reason for this shape.
 *
 * THE TWO LAYERS
 * --------------
 * A detail is either a standing fact or a moment.
 *
 *   PINNED   "Wife is Karen. Two kids, Ethan and Mia."   — always true
 *   MOMENT   "Ethan graduates in May."                    — dated, expires
 *
 * Both are the same document with `isPinned` flipped, so a moment that turns
 * out to be permanent is one tap away from becoming a standing fact and no
 * one has to retype it. The section renders pinned facts as the glanceable
 * top of each pillar and moments as the stream beneath.
 *
 * THE POINT OF ALL THIS
 * ---------------------
 * A detail with a date and an `opportunity` is a gesture waiting to happen —
 * the anniversary dinner, the graduation card, the dog harness. That is what
 * the capture is FOR. A pillar full of beautifully filed facts that never
 * turns into a gesture has failed.
 */

/* ------------------------------------------------------------------ */
/* THE FOUR PILLARS                                                    */
/* ------------------------------------------------------------------ */

/**
 * The enum. Lowercase ids because they are Firestore values and query
 * arguments; the labels below are the only thing a trainer ever sees.
 */
export type FordPillar = "family" | "occupation" | "recreation" | "dreams";

export const FORD_PILLARS: FordPillar[] = [
  "family",
  "occupation",
  "recreation",
  "dreams",
];

export interface FordPillarMeta {
  id: FordPillar;
  /** The single letter. F-O-R-D, in order, is the whole mnemonic. */
  letter: string;
  label: string;
  /** What belongs here, for the empty state and the capture sheet. */
  blurb: string;
  /** Something to actually say out loud. Rotated in the briefing prompt. */
  prompts: string[];
  /** lucide icon name, resolved by the components. */
  icon: string;
  /** Semantic token prefix — see ford.tokens.css. Never a hex value. */
  tone: string;
}

export const FORD_META: Record<FordPillar, FordPillarMeta> = {
  family: {
    id: "family",
    letter: "F",
    label: "Family",
    blurb: "Partners, kids, grandkids, pets — and the dates that matter to them",
    prompts: [
      "How is the family?",
      "Anyone graduating, marrying or visiting soon?",
      "How is the dog settling in?",
      "Who is coming for the holidays?",
    ],
    icon: "Users",
    tone: "family",
  },
  occupation: {
    id: "occupation",
    letter: "O",
    label: "Occupation",
    blurb: "Work, retirement, what fills their weekdays and what it does to their body",
    prompts: [
      "How is work treating you?",
      "Still on the road as much?",
      "How is retirement going?",
      "Busy season coming up?",
    ],
    icon: "Briefcase",
    tone: "occupation",
  },
  recreation: {
    id: "recreation",
    letter: "R",
    label: "Recreation",
    blurb: "What they do for joy — hikes, golf, the garden, the grandkids' games",
    prompts: [
      "Been out on the trail lately?",
      "How was the trip?",
      "How is the garden coming along?",
      "Watched anything good?",
    ],
    icon: "Mountain",
    tone: "recreation",
  },
  dreams: {
    id: "dreams",
    letter: "D",
    label: "Dreams",
    blurb: "What they want out of the next chapter. Not a training goal — a life one",
    prompts: [
      "What are you looking forward to this year?",
      "Anywhere you have always wanted to go?",
      "What would you love to be able to do again?",
      "What is on the list for when you retire?",
    ],
    icon: "Sparkles",
    tone: "dreams",
  },
};

/* ------------------------------------------------------------------ */
/* THE DOCUMENT                                                        */
/* ------------------------------------------------------------------ */

/** Birthdays and anniversaries come round again; a graduation does not. */
export type FordRecurrence = "none" | "annual";

/** Where the detail was caught. Provenance only — never gates anything. */
export type FordOrigin =
  | "in_session"
  | "post_session"
  | "briefing"
  | "profile"
  | "legacy";

/** The life of a gesture, from overheard to delivered. */
export type FordGestureStatus = "idea" | "planned" | "done" | "declined";

export const GESTURE_STATUS_LABEL: Record<FordGestureStatus, string> = {
  idea: "Idea",
  planned: "Planned",
  done: "Done",
  declined: "Passed on",
};

/**
 * A detail promoted to something the team intends to DO.
 *
 * `idea` is the default on promotion and costs nothing — it means "this is
 * worth doing something about". `planned` means someone owns it. Ownership is
 * a name, not an assignment: this is the opposite of the task board, where
 * work is claimed rather than handed out.
 */
export interface FordOpportunity {
  /** "Cover the anniversary dinner at Giovanni's" */
  idea: string;
  status: FordGestureStatus;
  ownerTrainerId: string | null;
  ownerName: string | null;
  /** When the gesture should happen — usually a few days before `eventDate`. */
  plannedFor: any | null;
  doneAt: any | null;
  /** What actually happened. The part worth reading back a year later. */
  outcome: string | null;
}

export interface FordEntry {
  id: string;
  clientId: string;
  /** Denormalised from the client so the Delight queue's collection group query can scope by studio. */
  studioId: string;

  /**
   * null means CAUGHT BUT NOT FILED — a line typed on the floor with no
   * category chosen, waiting for the post-session sweep. This is the single
   * most important field in the file: making it nullable is what lets capture
   * cost one tap during a set.
   */
  pillar: FordPillar | null;

  /** The detail, in the trainer's words. Never rewritten by the app. */
  body: string;

  /** Who or what it is about — "Ethan", "the garden", "Cooper". Powers grouping. */
  subject: string | null;

  /** Standing fact (true) vs a moment in time (false). See the header. */
  isPinned: boolean;

  /** The calendar date the detail points at, if any. */
  eventDate: any | null;
  recurrence: FordRecurrence;

  /** Set when this detail is worth doing something about. */
  opportunity: FordOpportunity | null;

  /**
   * THE SORT KEY. Written client-side as `Timestamp.now()`, never
   * `serverTimestamp()` — same reason as the journal: a pending server
   * timestamp resolves to null in the offline cache and sorts the card it
   * just created to the bottom of the list. Editable, so a detail can be
   * back-dated to the session it was actually mentioned in.
   */
  occurredAt: any;
  createdAt: any;
  updatedAt: any;

  authorId: string;
  authorName: string;
  authorInitials: string;
  origin: FordOrigin;
  sessionId: string | null;

  /** Archived rather than deleted, like the journal. Nothing here is thrown away. */
  isArchived: boolean;

  /** True for adapter-produced entries (client.events). Read-only in the UI. */
  isLegacy?: boolean;
  legacySource?: string;
}

/** What a composer or the capture sheet can set. */
export type FordDraft = Pick<FordEntry, "pillar" | "body"> &
  Partial<
    Pick<
      FordEntry,
      | "subject"
      | "isPinned"
      | "recurrence"
      | "origin"
      | "sessionId"
      | "opportunity"
    >
  > & {
    eventDate?: Date | null;
    occurredAt?: Date | null;
  };

/* ------------------------------------------------------------------ */
/* THE ROLLUP                                                          */
/* ------------------------------------------------------------------ */

/**
 * A summary written onto `clients/{id}.fordSummary` whenever a detail is
 * saved.
 *
 * Purely a rendering convenience: the client document is already streamed by
 * every list in the app, so a chip that says "Anniversary in 12 days" costs
 * zero extra reads. Never treat it as the source of truth — the subcollection
 * is. It is written best-effort and a failure is swallowed, exactly like the
 * journal's focus check-in counter.
 */
export interface ClientFordSummary {
  counts: Record<FordPillar, number>;
  /** Details caught on the floor and not yet filed. Drives the sweep badge. */
  untagged: number;
  /** A couple of pinned lines per pillar, for glance rendering in a list. */
  pinned: Partial<Record<FordPillar, string[]>>;
  /** The soonest upcoming date across every detail. ISO date, not a Timestamp. */
  nextDate: { date: string; label: string; pillar: FordPillar | null } | null;
  /** Opportunities still at idea or planned. */
  openOpportunities: number;
  updatedAt: string;
}

export const EMPTY_FORD_SUMMARY: ClientFordSummary = {
  counts: { family: 0, occupation: 0, recreation: 0, dreams: 0 },
  untagged: 0,
  pinned: {},
  nextDate: null,
  openOpportunities: 0,
  updatedAt: "",
};

/* ------------------------------------------------------------------ */
/* DATES                                                               */
/* ------------------------------------------------------------------ */

/** Firestore Timestamp | Date | ISO string -> Date. Mirrors journal.toDate(). */
export function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    try {
      const d = value.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * The next time a date comes round.
 *
 * An annual detail recorded in 2019 is not "seven years ago" to a client — it
 * is "in three weeks". Anniversaries and birthdays are rolled forward to the
 * next occurrence; everything else is returned as it stands, including dates
 * in the past, because a graduation that already happened is worth asking
 * about rather than hiding.
 */
export function nextOccurrence(
  date: Date | null,
  recurrence: FordRecurrence,
  now = new Date(),
): Date | null {
  if (!date) return null;
  if (recurrence !== "annual") return date;

  const rolled = new Date(date.getTime());
  rolled.setFullYear(now.getFullYear());
  // Compare on the day, not the millisecond: a date earlier TODAY is today.
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  if (rolled < startOfToday) rolled.setFullYear(now.getFullYear() + 1);
  return rolled;
}

/** Whole days from today to `date`. Negative is the past. */
export function daysUntil(date: Date | null, now = new Date()): number | null {
  if (!date) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * How a trainer would say it.
 *
 * Sentences, not counts — the app's standing rule. "In 12 days" beats "12",
 * and "Tomorrow" beats "in 1 day".
 */
export function whenLabel(
  date: Date | null,
  recurrence: FordRecurrence = "none",
  now = new Date(),
): string | null {
  const next = nextOccurrence(date, recurrence, now);
  const days = daysUntil(next, now);
  if (days === null) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days <= 30) return `In ${days} days`;
  if (days < -1 && days >= -30) return `${Math.abs(days)} days ago`;
  return next!.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      next!.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/**
 * How close a date is to being actionable.
 *
 * `soon` is the window where a gesture still has time to be arranged —
 * fourteen days buys a card, a booking or a delivery. Inside `now` it is
 * this week and someone needs to move.
 */
export type FordUrgency = "now" | "soon" | "later" | "past" | "none";

export function urgencyOf(
  date: Date | null,
  recurrence: FordRecurrence = "none",
  reference = new Date(),
): FordUrgency {
  const days = daysUntil(nextOccurrence(date, recurrence, reference), reference);
  if (days === null) return "none";
  if (days < 0) return "past";
  if (days <= 7) return "now";
  if (days <= 30) return "soon";
  return "later";
}
