/**
 * UNIFIED COACHING JOURNAL — schema + presentation metadata.
 *
 * Everything a coach writes about a client lands in ONE collection
 * (`journalEntries`), whatever part of the app produced it: the consultation
 * wizard, the pre-session briefing, the mid-session tracker, a post-session
 * wrap-up, or the Journal tab itself. The Journal is then a plain read of that
 * one collection instead of five hand-merged sources.
 *
 * Legacy collections (focusRecords, sessionNotes, clinicalIncidents) and the
 * read-only profile fields (client.mindbodyNotes, client.events, ...) are NOT
 * migrated. They are normalized into this same shape at read time by
 * `useClientJournal`, so a studio's existing history shows up on day one and
 * nothing has to be rewritten in production.
 */

/** What KIND of thing this is. Drives the card's colour family and icon. */
export type JournalKind =
  | "coaching"      // the 4 P's — a cue or correction
  | "life"          // birthdays, anniversaries, vacations, surgeries, injuries
  | "equipment"     // machine-specific knowledge that isn't a setting
  | "incident"      // something went wrong in the room
  | "consultation"  // intake / discovery / Mindbody-imported account notes
  | "general";      // everything else

/** The 4 P's. Also the categories a trainer focus can be set to. */
export type FocusCategory = "Posture" | "Path" | "Pace" | "Purpose";

/** Sub-type for `life` entries. */
export type LifeCategory =
  | "Birthday"
  | "Anniversary"
  | "Vacation"
  | "Surgery"
  | "Injury"
  | "Milestone"
  | "Other";

/**
 * How loudly the entry should shout. Deliberately separate from `kind` so the
 * two never get confused: a critical Pace note is still a Pace note.
 * `critical` entries are pinned to the top of the Journal AND rendered in the
 * pre-session briefing.
 */
export type JournalImportance = "standard" | "elevated" | "critical";

/** Where the note came from. Recorded for provenance; de-emphasised in the UI. */
export type JournalOrigin =
  | "manual"
  | "consultation"
  | "pre_session"
  | "in_session"
  | "post_session"
  | "mindbody"
  | "profile"
  | "legacy";

export interface JournalEntry {
  id: string;
  clientId: string;
  studioId: string;

  kind: JournalKind;
  /** FocusCategory for `coaching`, LifeCategory for `life`, else null. */
  category: FocusCategory | LifeCategory | null;

  body: string;
  importance: JournalImportance;

  /** Set when the note is about a specific machine. */
  machineId: string | null;
  /** Set when this entry is a check-in on a trainer focus. */
  focusId: string | null;
  sessionId: string | null;

  origin: JournalOrigin;

  authorId: string;
  authorInitials: string;
  authorName: string;

  /**
   * THE SORT KEY. Written client-side as `Timestamp.now()`, never
   * `serverTimestamp()` — see the note in journal-write.ts. Also editable, so a
   * coach can back-date "surgery was on the 14th".
   */
  occurredAt: any;
  createdAt: any;
  updatedAt: any;

  /** Window during which the entry is live — vacations, post-op restrictions. */
  effectiveFrom: any | null;
  effectiveUntil: any | null;
  /** Incidents and temporary restrictions get closed out rather than deleted. */
  resolvedAt: any | null;

  isArchived: boolean;

  /**
   * Denormalised filter tags: [kind, category, importance, `coach:<id>`,
   * `machine:<id>`]. Not used by the current queries (the whole window is
   * filtered in memory) but present so filtering can move server-side with a
   * single array-contains index once a client outgrows the read window.
   */
  searchTags: string[];

  /** True for adapter-produced entries. Read-only in the UI — no edit/delete. */
  isLegacy?: boolean;
  /** Human label for where a legacy entry came from, e.g. "Mindbody account notes". */
  legacySource?: string;
}

/** Fields a coach can actually set when composing. */
export type JournalDraft = Pick<
  JournalEntry,
  "kind" | "category" | "body" | "importance" | "machineId" | "focusId" | "origin"
> & {
  occurredAt?: Date | null;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
  sessionId?: string | null;
};

/* ------------------------------------------------------------------ */
/* TRAINER FOCUS                                                       */
/* ------------------------------------------------------------------ */

/**
 * A focus is a trainer's standing intent for a client: "I am working on Pace
 * with Judy." It is owned by one trainer, lives until they pass or retire it,
 * and accumulates check-ins over time. Check-ins are ordinary journalEntries
 * carrying `focusId`, so a focus's history and the client's timeline are the
 * same records — never two sources to reconcile.
 *
 * Replaces the old overlapping pair (`focusRecords` + `trainerFocuses`).
 */
export type FocusStatus = "active" | "passed" | "retired";

export interface ClientFocus {
  id: string;
  clientId: string;
  studioId: string;

  trainerId: string;
  trainerName: string;
  trainerInitials: string;

  category: FocusCategory;
  /** What the trainer is actually chasing. One or two sentences. */
  intent: string;
  targetMachineId: string | null;

  status: FocusStatus;
  startedAt: any;
  /** Nudge date. Extending a focus pushes this out. */
  reviewDueAt: any | null;
  passedAt: any | null;
  lastExtendedAt: any | null;
  extensionCount: number;

  /** Denormalised so the focus card can show activity without a second query. */
  checkInCount: number;
  lastCheckInAt: any | null;

  createdAt: any;
  updatedAt: any;

  isLegacy?: boolean;
}

/* ------------------------------------------------------------------ */
/* PRESENTATION METADATA                                               */
/* ------------------------------------------------------------------ */

export interface KindStyle {
  label: string;
  /** Left edge bar — the single strongest "what kind is this" signal. */
  edge: string;
  /** Icon + tag chip colours. */
  chip: string;
  icon: string;
  accentText: string;
  /** Tint used only when the entry is critical. */
  criticalTint: string;
}

/**
 * ONE hue family per kind. Importance is expressed through card chrome (ring,
 * tint, pill) and never through hue, so "what kind of note is this" and "how
 * urgent is it" stay independently readable at a glance.
 */
export const KIND_STYLES: Record<JournalKind, KindStyle> = {
  coaching: {
    label: "Coaching",
    edge: "before:bg-cyan-500",
    chip: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20",
    icon: "Target",
    accentText: "text-cyan-600 dark:text-cyan-300",
    criticalTint: "bg-cyan-500/[0.06]",
  },
  life: {
    label: "Life",
    edge: "before:bg-violet-500",
    chip: "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20",
    icon: "HeartPulse",
    accentText: "text-violet-600 dark:text-violet-300",
    criticalTint: "bg-violet-500/[0.06]",
  },
  equipment: {
    label: "Equipment",
    edge: "before:bg-amber-500",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20",
    icon: "Dumbbell",
    accentText: "text-amber-600 dark:text-amber-300",
    criticalTint: "bg-amber-500/[0.06]",
  },
  incident: {
    label: "Incident",
    edge: "before:bg-rose-500",
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/20",
    icon: "AlertTriangle",
    accentText: "text-rose-600 dark:text-rose-300",
    criticalTint: "bg-rose-500/[0.07]",
  },
  consultation: {
    label: "Consultation",
    edge: "before:bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20",
    icon: "ClipboardList",
    accentText: "text-emerald-600 dark:text-emerald-300",
    criticalTint: "bg-emerald-500/[0.06]",
  },
  general: {
    label: "Note",
    edge: "before:bg-slate-400 dark:before:bg-slate-500",
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
    icon: "MessageSquare",
    accentText: "text-slate-600 dark:text-slate-300",
    criticalTint: "bg-slate-500/[0.06]",
  },
};

/** Per-P colour + the plain-language definition coaches already use. */
export const FOCUS_CATEGORY_META: Record<
  FocusCategory,
  { blurb: string; chip: string; dot: string; icon: string }
> = {
  Posture: {
    blurb: "Position and alignment before the rep starts.",
    chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/25",
    dot: "bg-indigo-500",
    icon: "PersonStanding",
  },
  Path: {
    blurb: "The line the load travels. No drifting or shifting.",
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/25",
    dot: "bg-sky-500",
    icon: "Route",
  },
  Pace: {
    blurb: "Tempo and constant tension. No dumping at the ends.",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/25",
    dot: "bg-amber-500",
    icon: "Timer",
  },
  Purpose: {
    blurb: "Intent and mind-muscle connection through the set.",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/25",
    dot: "bg-emerald-500",
    icon: "Brain",
  },
};

export const LIFE_CATEGORIES: LifeCategory[] = [
  "Birthday",
  "Anniversary",
  "Vacation",
  "Surgery",
  "Injury",
  "Milestone",
  "Other",
];

export const FOCUS_CATEGORIES: FocusCategory[] = [
  "Posture",
  "Path",
  "Pace",
  "Purpose",
];

export const IMPORTANCE_META: Record<
  JournalImportance,
  { label: string; short: string; chip: string }
> = {
  standard: {
    label: "Standard",
    short: "STD",
    chip: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
  },
  elevated: {
    label: "Worth knowing",
    short: "HEADS UP",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
  },
  critical: {
    label: "Critical",
    short: "CRITICAL",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40",
  },
};

/** Kinds offered in the quick-add strip, in the order coaches reach for them. */
export const COMPOSER_KINDS: JournalKind[] = [
  "coaching",
  "equipment",
  "life",
  "incident",
  "general",
];

/** Safely turn a Firestore Timestamp | Date | string | number into a Date. */
export function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
