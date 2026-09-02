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

/**
 * THE VISUAL CONTRACT
 *
 * Three independent channels, each carrying exactly one meaning, so a coach
 * can read a card in peripheral vision without parsing text:
 *
 *   1. HUE + GLYPH  = what kind of thing this is.
 *      One hue per concept, no collisions. Coaching entries take their own P's
 *      hue rather than a generic "coaching" colour, because "which P" is the
 *      distinction a coach actually scans for.
 *
 *   2. CHROME       = how loudly it should shout.
 *      Importance is a ring + tint + pill. It NEVER changes the hue, so a
 *      critical Pace note is still Pace-amber. "What is it" and "how urgent is
 *      it" stay independently readable.
 *
 *   3. EDGE TEXTURE = whether this app owns the record.
 *      Solid edge = written here and editable. Dashed edge = imported or
 *      read-only (Mindbody account notes, profile fields, legacy rows).
 *
 * Worked example, the two the brief asks about:
 *   "Rotator cuff surgery 3/14, no pressing until cleared"
 *     -> violet edge, heart-pulse glyph, LIFE - SURGERY tag, rose ring +
 *        CRITICAL pill, effective-until chip. Reads as a standing restriction.
 *   "Pace: stop dumping the last two reps on compound row"
 *     -> amber edge, timer glyph, PACE tag + COMPOUND ROW machine chip,
 *        no ring. Reads as a coaching cue.
 * Different hue family, different glyph, different chrome, different tag row.
 */
export interface EntryVisual {
  /** Colour of the 4px left edge bar. */
  edge: string;
  /** Tag chip background + text. */
  chip: string;
  /** lucide-react icon name. */
  icon: string;
  /** Text colour for the tag row. */
  accent: string;
  /** Faint background wash, used only when the entry is critical. */
  tint: string;
  /** Short uppercase label for the tag row. */
  label: string;
}

const VISUALS = {
  Posture: {
    edge: "bg-indigo-500",
    chip: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 border-indigo-500/25",
    icon: "PersonStanding",
    accent: "text-indigo-600 dark:text-indigo-300",
    tint: "bg-indigo-500/[0.05]",
    label: "Posture",
  },
  Path: {
    edge: "bg-sky-500",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/25",
    icon: "Route",
    accent: "text-sky-600 dark:text-sky-300",
    tint: "bg-sky-500/[0.05]",
    label: "Path",
  },
  Pace: {
    edge: "bg-amber-500",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/25",
    icon: "Timer",
    accent: "text-amber-600 dark:text-amber-300",
    tint: "bg-amber-500/[0.05]",
    label: "Pace",
  },
  Purpose: {
    edge: "bg-emerald-500",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25",
    icon: "Brain",
    accent: "text-emerald-600 dark:text-emerald-300",
    tint: "bg-emerald-500/[0.05]",
    label: "Purpose",
  },
  life: {
    edge: "bg-violet-500",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 border-violet-500/25",
    icon: "HeartPulse",
    accent: "text-violet-600 dark:text-violet-300",
    tint: "bg-violet-500/[0.05]",
    label: "Life",
  },
  equipment: {
    edge: "bg-teal-500",
    chip: "bg-teal-500/12 text-teal-600 dark:text-teal-300 border-teal-500/25",
    icon: "Dumbbell",
    accent: "text-teal-600 dark:text-teal-300",
    tint: "bg-teal-500/[0.05]",
    label: "Equipment",
  },
  incident: {
    edge: "bg-rose-500",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/25",
    icon: "AlertTriangle",
    accent: "text-rose-600 dark:text-rose-300",
    tint: "bg-rose-500/[0.06]",
    label: "Incident",
  },
  consultation: {
    edge: "bg-slate-400 dark:bg-slate-500",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-500/25",
    icon: "ClipboardList",
    accent: "text-slate-600 dark:text-slate-300",
    tint: "bg-slate-500/[0.05]",
    label: "Consultation",
  },
  general: {
    edge: "bg-slate-400 dark:bg-slate-500",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-500/25",
    icon: "MessageSquare",
    accent: "text-slate-600 dark:text-slate-300",
    tint: "bg-slate-500/[0.05]",
    label: "Note",
  },
  coaching: {
    edge: "bg-cyan-500",
    chip: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-300 border-cyan-500/25",
    icon: "Target",
    accent: "text-cyan-600 dark:text-cyan-300",
    tint: "bg-cyan-500/[0.05]",
    label: "Coaching",
  },
} satisfies Record<string, EntryVisual>;

/**
 * Resolve a card's visual identity. Coaching entries fall through to their P's
 * own colour; everything else uses its kind's.
 */
export function getEntryVisual(
  kind: JournalKind,
  category?: string | null,
): EntryVisual {
  if (kind === "coaching" && category && category in VISUALS) {
    return VISUALS[category as keyof typeof VISUALS];
  }
  return VISUALS[kind as keyof typeof VISUALS] ?? VISUALS.general;
}

export const FOCUS_VISUALS: Record<FocusCategory, EntryVisual> = {
  Posture: VISUALS.Posture,
  Path: VISUALS.Path,
  Pace: VISUALS.Pace,
  Purpose: VISUALS.Purpose,
};

/** Plain-language definitions coaches already use for the 4 P's. */
export const FOCUS_BLURBS: Record<FocusCategory, string> = {
  Posture: "Position and alignment before the rep starts.",
  Path: "The line the load travels. No drifting or shifting.",
  Pace: "Tempo and constant tension. No dumping at the ends.",
  Purpose: "Intent and mind-muscle connection through the set.",
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
  { label: string; short: string; chip: string; ring: string; hint: string }
> = {
  standard: {
    label: "Standard",
    short: "Standard",
    chip: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    ring: "",
    hint: "Good to know",
  },
  elevated: {
    label: "Heads up",
    short: "Heads up",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
    ring: "ring-1 ring-amber-500/30",
    hint: "Surfaces higher in the stream",
  },
  critical: {
    label: "Critical",
    short: "Critical",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40",
    ring: "ring-1 ring-rose-500/45",
    hint: "Also shown in the pre-session briefing",
  },
};

/** Kinds offered in the quick-add strip, in the order coaches reach for them. */
export const COMPOSER_KINDS: { kind: JournalKind; label: string }[] = [
  { kind: "coaching", label: "Coaching" },
  { kind: "equipment", label: "Equipment" },
  { kind: "life", label: "Personal" },
  { kind: "incident", label: "Incident" },
  { kind: "general", label: "Note" },
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

/** "3 days ago" / "in 2 weeks" — short, no library. */
export function relativeDay(date: Date | null): string {
  if (!date) return "—";
  const days = Math.round((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days === -1) return "Tomorrow";
  if (days < 0) return `in ${Math.abs(days)}d`;
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/** Bucket used to group the stream into date headers. */
export function dateBucket(date: Date | null): string {
  if (!date) return "Undated";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "This week";
  if (days <= 30) return "This month";
  if (days <= 90) return "Last 3 months";
  return date.getFullYear() === new Date().getFullYear()
    ? "Earlier this year"
    : String(date.getFullYear());
}
