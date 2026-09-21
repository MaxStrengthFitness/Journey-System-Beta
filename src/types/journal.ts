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

/**
 * What KIND of thing this is. Drives the card's colour family and icon.
 *
 * The notes catalog (Sep 2026) files every kind under one of seven
 * categories — see `noteCategoryOf` in features/client-notes/note-catalog.ts, which
 * is the one place that mapping lives. No kind is ever removed: old entries
 * keep the kind they were written with and are mapped at read time.
 */
export type JournalKind =
  | "coaching"      // the 4 P's — a cue or correction          -> Coaching tip
  | "life"          // OLD personal notes; new ones go to FORD   -> FORD / Life
  | "equipment"     // machine-specific knowledge, not a setting -> Equipment
  | "incident"      // something went wrong in the room          -> Incident
  | "injury"        // a standing limitation, surgery, pain      -> Injury
  | "preference"    // how they like things done                 -> Preference
  | "consultation"  // intake / discovery / Mindbody imports     -> Admin
  | "general";      // older "Note" entries, no longer offered   -> Preferences & other

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
 * How loudly the entry should shout — LOUDNESS, since the reporting round
 * (Sep 2026): Note · Heads up · Critical, one component (features/rating)
 * everywhere a note is written. The stored values are unchanged.
 * Deliberately separate from `kind` so the two never get confused: a
 * critical Pace note is still a Pace note.
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
  /**
   * THE THREAD (Notes round, Sep 2026). Null on a note of its own; on an
   * update it is the ROOT note's id. The mattering window, the loudness and
   * `resolvedAt` live on the root and nowhere else — see
   * `features/client-notes/threads.ts`, which is the one place threads are
   * assembled, and `thread-write.ts`, which is the one place they are written.
   */
  threadId?: string | null;
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

  /**
   * THE MATTERING WINDOW (Operations overhaul, Sep 2026) — when the note
   * matters, in one of three shapes read by `features/client-notes/
   * mattering.ts`: ALWAYS (no until; from may be pushed ahead), RANGE (from
   * until), DAY (from and until on the same day; `repeat: "yearly"` brings
   * it back — birthdays, anniversaries). Vacations and post-op restrictions
   * were the first ranges.
   */
  effectiveFrom: any | null;
  effectiveUntil: any | null;
  repeat?: "yearly" | null;
  /**
   * The 60-day review: an ALWAYS note that has mattered this long surfaces
   * on Operations → Overview until someone says it still matters (this is
   * stamped, the clock restarts) or resolves it.
   */
  reviewedAt?: any | null;
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

  /**
   * Optional override for which client-dossier section this note belongs to.
   * Normally left unset: `sectionForEntry()` derives it from kind + category,
   * which needs no backfill, no index and no write-time denormalisation to
   * keep in sync. Set it only when a coach deliberately files a note somewhere
   * the derivation would not put it.
   */
  profileSection?: DossierSection | null;

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
  /** Set only by `addThreadUpdate` — the root note this update hangs from. */
  threadId?: string | null;
  occurredAt?: Date | null;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
  repeat?: "yearly" | null;
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
/**
 * `passed` is the stored word for ACHIEVED and is shown as "Achieved" on
 * screen (Goals & Focus round, Sep 2026). It is not renamed in the data: the
 * legacy focusRecords adapter and every existing document already use it.
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
  /**
   * When it was marked achieved, and what the client got for it ("Kaizen
   * pin"). Optional: focuses achieved before Sep 2026 have only `passedAt`.
   */
  achievedAt?: any | null;
  rewardNote?: string | null;
  /** When it was retired. Older retired focuses fall back to `updatedAt`. */
  retiredAt?: any | null;
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
  injury: {
    edge: "bg-fuchsia-500",
    chip: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25",
    icon: "Bandage",
    accent: "text-fuchsia-700 dark:text-fuchsia-300",
    tint: "bg-fuchsia-500/[0.05]",
    label: "Injury",
  },
  preference: {
    edge: "bg-stone-400 dark:bg-stone-500",
    chip: "bg-stone-500/12 text-stone-600 dark:text-stone-300 border-stone-500/25",
    icon: "ThumbsUp",
    accent: "text-stone-600 dark:text-stone-300",
    tint: "bg-stone-500/[0.05]",
    label: "Preference",
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
    label: "Note",
    short: "Note",
    chip: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    ring: "",
    hint: "Filed in the record, found by its category",
  },
  elevated: {
    label: "Heads up",
    short: "Heads up",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
    ring: "ring-1 ring-amber-500/30",
    hint: "Top of the record, and on the briefing while it still matters",
  },
  critical: {
    label: "Critical",
    short: "Critical",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40",
    ring: "ring-1 ring-rose-500/45",
    hint: "Pinned, on the briefing, and marks the Hub card",
  },
};

/**
 * The journal kinds the composer writes, in the order coaches reach for them.
 *
 * `life` ("Personal") was removed in the profile merge, Sep 2026. Personal
 * detail has a real home now — FORD, on the client record, studio-scoped
 * rather than readable by every signed-in user, and structured so a date can
 * become a gesture. The composer still OFFERS "FORD / Life", but choosing it
 * hands the sentence to the FORD capture; it never writes a journal entry.
 *
 * `general` ("Note") was removed in the notes catalog round, Sep 2026: every
 * note must have a clear category, and "Note" was the way to avoid choosing
 * one. Existing `general` entries render under "Preferences & other".
 *
 * The labels, icons and order the screens show live in
 * features/client-notes/note-catalog.ts; this list is only the kinds.
 */
export const COMPOSER_KINDS: JournalKind[] = [
  "coaching",
  "equipment",
  "incident",
  "injury",
  "preference",
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

/* ------------------------------------------------------------------ */
/* JOURNAL -> CLIENT DOSSIER LINKING                                   */
/* ------------------------------------------------------------------ */

/**
 * The client profile's sections — one spine holding what used to be two tabs.
 *
 * WHAT CHANGED, AND WHY (the profile merge, Sep 2026)
 * --------------------------------------------------
 * Details and Journal were separately good screens that showed each other's
 * data. Four of the six dossier sections embedded a rail of journal notes the
 * Journal tab was also rendering; `client.events` was an editable section AND
 * a stream of "life" entries; six profile textareas were edited in Details and
 * adapted into journal cards at the same time. A trainer reading a client had
 * to visit two tabs and then work out which copy was the real one.
 *
 * So they are one tab now, and the sections below are the whole client, in the
 * order someone actually reads a person:
 *
 *   general   who they are          — identity, contact, the Mindbody record
 *   life      the FORD hub          — family, occupation, recreation, dreams
 *   medical   what the load works around, plus the load they already carry
 *   goals     the why              — original why, SMART goal, coach strategy
 *   focus     the 4 P's            — what each coach is working on
 *   notes     the catalog          — every note, in one of seven categories
 *   reports   the assessment — the living record a coach fills in over time.
 *             The FILED reports moved to the Activity Archive (was Clinical History) in the four-tab
 *             round: the archive is the past, and the past has a tab. You
 *             still write one from here; you read the shelf over there.
 *   admin     contract, billing, access, and how they found us
 *
 * Two sections are gone. LIFESTYLE is replaced by `life`: its dropdowns were
 * programming inputs and moved to `medical` beside the rest of the load
 * picture, its acquisition fields moved to `admin`, and the personal detail it
 * was supposed to hold now has a real home in FORD. EVENTS is gone because
 * `client.events` is read as FORD entries instead (see features/ford), leaving
 * one dated timeline rather than two.
 *
 * The per-section journal rails are also gone, with ONE exception: `medical`
 * keeps its rail, because a limitation noticed mid-session is safety
 * information and belongs beside the clinical fields, not one section away.
 * Everything else reads the `notes` section, which is the single timeline.
 */
export type DossierSection =
  | "general"
  | "life"
  | "medical"
  | "goals"
  | "focus"
  | "notes"
  | "reports"
  | "admin";

export const DOSSIER_SECTIONS: {
  id: DossierSection;
  label: string;
  blurb: string;
  icon: string;
}[] = [
  // Notes first (Operations overhaul, Sep 2026): the tab is Notes & Profile,
  // so the notes sit above the profile — AJ, Sep 19. The dossier renders its
  // sections in this order and the rail follows it.
  { id: "notes", label: "Notes", blurb: "Every note, filed by category", icon: "NotebookPen" },
  { id: "general", label: "Who they are", blurb: "The ID card — what they go by, and what Mindbody knows", icon: "User" },
  { id: "life", label: "Life", blurb: "Family, occupation, recreation, dreams", icon: "Heart" },
  { id: "medical", label: "Body", blurb: "What the load has to work around", icon: "HeartPulse" },
  { id: "goals", label: "Goals", blurb: "The why, and how it has moved", icon: "Target" },
  { id: "focus", label: "Focus", blurb: "What each coach is working on", icon: "Crosshair" },
  { id: "reports", label: "Pulse", blurb: "How life is going, filled a little at a time — write it here, read the filed reports in the Activity Archive", icon: "TrendingUp" },
  { id: "admin", label: "Admin", blurb: "Contract, billing and access", icon: "Settings2" },
];

/**
 * Which section a note belongs to.
 *
 * Derived rather than stored: the journal is already loaded in memory, the
 * rules live in exactly one place, and changing the mapping later needs no
 * migration. An explicit `profileSection` on the entry always wins.
 *
 * Returns null for notes with no profile home — coaching cues and equipment
 * notes are training material, and belong in the Journal and the
 * Equipment tab rather than being forced into a dossier section.
 */
export function sectionForEntry(entry: JournalEntry): DossierSection | null {
  if (entry.profileSection) return entry.profileSection;

  switch (entry.kind) {
    case "incident":
    case "injury":
      // Includes the medical-history and clinical-notes profile fields, which
      // the journal adapter reads as `injury` (they used to land in Life).
      return "medical";
    case "life":
      // A surgery or an injury is a load constraint before it is a personal
      // detail. Everything else personal belongs with FORD under Life.
      return entry.category === "Surgery" || entry.category === "Injury"
        ? "medical"
        : "life";
    case "consultation":
      return "goals";
    case "general":
    case "preference":
      return "general";
    default:
      // coaching, equipment
      return null;
  }
}

/**
 * The notes a given section should show.
 *
 * Medical is the deliberate exception. The studio trains continuous-tension
 * and high-intensity, so a limitation noticed mid-session is safety
 * information wherever it was filed — a critical Pace note that says she
 * cannot hold the end range is a physical limitation even though its kind is
 * "coaching". So Medical also pulls any unresolved critical note, whatever
 * its kind, and marks where it came from.
 */
export function entriesForSection(
  entries: JournalEntry[],
  section: DossierSection,
): JournalEntry[] {
  if (section === "medical") {
    return entries.filter((e) => {
      if (sectionForEntry(e) === "medical") return true;
      return e.importance === "critical" && !e.resolvedAt;
    });
  }
  return entries.filter((e) => sectionForEntry(e) === section);
}

/* ------------------------------------------------------------------ */
/* PROVENANCE                                                          */
/* ------------------------------------------------------------------ */

/**
 * Where a value on the dossier came from. The single most important thing a
 * coach needs to know about any field on this screen is whether they can
 * change it and whether it will survive the next sync.
 */
export type FieldSource = "coach" | "mindbody" | "journal" | "derived";

export const SOURCE_META: Record<
  FieldSource,
  { label: string; hint: string; chip: string; bar: string }
> = {
  coach: {
    label: "Coach",
    hint: "Typed here. Yours to edit.",
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/25",
    bar: "bg-slate-400 dark:bg-slate-600",
  },
  mindbody: {
    label: "Mindbody",
    hint: "Synced from Mindbody. Overwritten on the next sync — edit it there.",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/25",
    bar: "bg-sky-500",
  },
  journal: {
    label: "Journal",
    hint: "Surfaced from a coaching note. Edit it in the Journal.",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 border-violet-500/25",
    bar: "bg-violet-500",
  },
  derived: {
    label: "Calculated",
    hint: "Worked out from other data. Not editable.",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25",
    bar: "bg-emerald-500",
  },
};
