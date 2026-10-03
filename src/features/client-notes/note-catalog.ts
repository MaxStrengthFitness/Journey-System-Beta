/**
 * THE NOTES CATALOG — every note in one of seven categories.
 *
 * The owner's audit (Sep 2026): the Notes area was "a never-ending feed",
 * one chronological timeline where an old injury report sat under months of
 * coaching cues and the only way to learn anything was to read all of it. The
 * fix is a CATALOG: every note has a clear category, one tap isolates a
 * category, and a search runs across all of them.
 *
 * The categories are the owner's choice. Since the notes round (Oct 3 2026,
 * AJ's client-notes hand-off: "Category is... one of the more important
 * parts because we need to know how to correctly file this into their note
 * section on their profile, so that way we know how to act on it later"):
 *
 *   Coaching & equipment · Health · Incident · Retention · FORD / Life ·
 *   Preference · Admin (Mindbody + intake, read-only)
 *
 * Each category is where a note goes to be ACTED ON: Coaching & equipment is
 * how to run her on the floor (a cue, one of the 4 P's, set-up); Health,
 * Incident and Retention are what a leader can't afford to miss, and reach
 * the studio's leaders (Operations → Today); FORD is the relationship;
 * Preference is how she likes things, and the catch-all. Two of them take an
 * optional second tap, a FLAVOUR (`NOTE_FLAVOURS`): the 4 P's or Set-up under
 * Coaching & equipment, and Injury · Surgery · Medication · Diagnosis · Care
 * outside the studio under Health.
 *
 * Until Oct 3 there were seven: Coaching tip · Equipment · Incident ·
 * Injury · Preference · FORD / Life · Admin. Nothing stored changed: the
 * stored `kind` is what it always was (`coaching` and `equipment` are both
 * Coaching & equipment; `injury` is Health), so every old note files itself
 * under the new names when it is read.
 *
 * THIS FILE IS THE ONE PLACE the categories are defined — label, icon,
 * order, and how every journal entry maps onto one. The composer, the
 * in-session sheet, the catalog and the entry card all read it, which is what
 * keeps note-taking feeling the same everywhere in the app.
 *
 * Existing notes map in automatically at read time; nothing is rewritten and
 * nothing is deleted. Pure: no React, no Firebase, no reads.
 *
 * CAPTURE NOW, TAG AT TEARDOWN (reporting round, Sep 2026)
 * ------------------------------------------------------------------------
 * A category is no longer required to save. A note saved with no category is
 * written as `kind: "general"` and is UNFILED (`isUnfiled`): it comes back as
 * a card in the To-file tray — under "This session" in the Active Session
 * sheet, on the post-session screen, and at the top of the Notes area —
 * where one tap files it (`fileUnfiledEntry`, `NoteSweep`). Older "Note"
 * entries and imports are not unfiled: they were deliberate notes then, and
 * `isLegacy` tells them apart. While a note is unfiled it is in the tray and
 * NOT on a shelf, so it is never shown twice on the record.
 *
 * The other two rules that keep every note surface the same (the composer,
 * the sheet, the sweep): loudness is the shared `Loudness` control with the
 * words Note · Heads up · Critical, and any Heads up or Critical note — of
 * any category — may carry a "matters until" day (`effectiveUntil`), after
 * which it leaves the briefing on its own.
 */
import {
  COMPOSER_KINDS,
  FOCUS_BLURBS,
  FOCUS_CATEGORIES,
  toDate,
  type FocusCategory,
  type HealthFlavour,
  type JournalEntry,
  type JournalImportance,
  type JournalKind,
  type JournalOrigin,
  type NoteBodyMark,
} from "../../types/journal";
import { bodyMarksLine, normaliseBodyMarks } from "./body-parts";
import {
  THREAD_ZONES,
  threadsByZone,
  type NoteThread,
  type ThreadZone,
} from "./threads";

export type NoteCategory =
  | "coaching"
  | "health"
  | "incident"
  | "retention"
  | "ford"
  | "preference"
  | "admin";

export interface NoteCategoryMeta {
  id: NoteCategory;
  /** Chip and tile label. */
  label: string;
  /** The note box's choice and its Save button ("Save as Coaching"): short, so six fit in two rows. */
  short: string;
  /** Shelf heading, where it differs from the label. */
  shelf: string;
  /** One line under the chip / on the empty shelf. */
  blurb: string;
  /** lucide-react icon name. */
  icon: string;
  /**
   * The journal kind a new note of this category is written as, before a
   * flavour says otherwise (Set-up writes `equipment`). Null for the two
   * that never write a journal entry: FORD / Life hands off to the FORD
   * capture, and Admin is read-only imports.
   */
  kind: JournalKind | null;
  /** The kind whose colour the category borrows (see getEntryVisual). */
  visualKind: JournalKind;
  /**
   * Reaches the studio's leaders on Operations → Today, whatever its
   * loudness (AJ: "the at-risk things a leader can't afford to miss").
   */
  forLeaders: boolean;
}

export const NOTE_CATEGORIES: readonly NoteCategoryMeta[] = [
  {
    id: "coaching",
    label: "Coaching & equipment",
    short: "Coaching",
    shelf: "Coaching & equipment",
    blurb: "How to run the session — a cue, one of the 4 P's, set-up or machine know-how.",
    icon: "Target",
    kind: "coaching",
    visualKind: "coaching",
    forLeaders: false,
  },
  {
    id: "health",
    label: "Health",
    short: "Health",
    shelf: "Health",
    blurb: "An injury or pain, surgery, medication, a diagnosis, or care outside the studio.",
    icon: "Stethoscope",
    kind: "injury",
    visualKind: "injury",
    forLeaders: true,
  },
  {
    id: "incident",
    label: "Incident",
    short: "Incident",
    shelf: "Incidents",
    blurb: "Something happened in the room — from a lost phone to a fall.",
    icon: "AlertTriangle",
    kind: "incident",
    visualKind: "incident",
    forLeaders: true,
  },
  {
    id: "retention",
    label: "Retention",
    short: "Retention",
    shelf: "Retention",
    blurb: "Renewing, the package, staying or leaving — what was said, and by whom.",
    icon: "Handshake",
    kind: "retention",
    visualKind: "retention",
    forLeaders: true,
  },
  {
    id: "ford",
    label: "FORD / Life",
    short: "FORD",
    shelf: "FORD / Life",
    blurb: "Family, occupation, recreation, dreams — a trip or an event coming up. Kept in FORD.",
    icon: "Heart",
    kind: null,
    visualKind: "life",
    forLeaders: false,
  },
  {
    id: "preference",
    label: "Preference",
    short: "Preference",
    shelf: "Preferences & other",
    blurb: "How they like things done — music, fan, pace of talk — and anything else.",
    icon: "ThumbsUp",
    kind: "preference",
    visualKind: "preference",
    forLeaders: false,
  },
  {
    id: "admin",
    label: "Admin",
    short: "Admin",
    shelf: "Admin · Mindbody & intake",
    blurb: "Imported from Mindbody, the intake and the profile. Read-only.",
    icon: "ClipboardList",
    kind: null,
    visualKind: "consultation",
    forLeaders: false,
  },
];

export const NOTE_CATEGORY_META: Record<NoteCategory, NoteCategoryMeta> = Object.fromEntries(
  NOTE_CATEGORIES.map((c) => [c.id, c]),
) as Record<NoteCategory, NoteCategoryMeta>;

/**
 * What the composer offers, in order: every category whose kind is one the
 * composer writes (COMPOSER_KINDS, types/journal.ts), plus FORD / Life, which
 * is offered but hands off to the FORD capture. Admin is never offered.
 */
export const COMPOSER_CATEGORIES: readonly NoteCategoryMeta[] = NOTE_CATEGORIES.filter(
  (c) => c.id === "ford" || (c.kind !== null && COMPOSER_KINDS.includes(c.kind)),
);

/** A category a note can be FILED under: the five the composer writes as a journal entry. */
export type FilingCategory = Exclude<NoteCategory, "ford" | "admin">;

/** The five filing categories, in the composer's order. What the To-file tray offers. */
export const FILING_CATEGORIES: readonly NoteCategoryMeta[] = NOTE_CATEGORIES.filter(
  (c): c is NoteCategoryMeta & { id: FilingCategory } => c.id !== "ford" && c.id !== "admin",
);

/**
 * How loud a new note starts, per kind. A coach can always change it.
 * Health, Incident and Retention start at Heads up: the next trainers hear
 * it at her next four sessions, and the studio's leaders see it on
 * Operations → Today whatever its loudness. An incident used to start
 * Critical; the notes round (Oct 3 2026) brought it down to Heads up, since
 * Incident now runs from a lost phone to a fall and Critical stays until
 * someone acts on it — a fall is one tap up. Every door that files a note
 * as it is written (the composer, the arrival note, the End Session box)
 * starts it here.
 */
export const DEFAULT_IMPORTANCE: Record<FilingCategory, JournalImportance> = {
  coaching: "standard",
  health: "elevated",
  incident: "elevated",
  retention: "elevated",
  preference: "standard",
};

/** True for a category whose notes reach the studio's leaders. */
export function isForLeaders(category: NoteCategory): boolean {
  return NOTE_CATEGORY_META[category].forLeaders;
}

/* ------------------------------------------------------------------ */
/* FLAVOURS — the optional second tap                                  */
/* ------------------------------------------------------------------ */

/** Set-up under Coaching & equipment: machine know-how, stored as `kind: "equipment"`. */
export type CoachingFlavour = FocusCategory | "Setup";
export type NoteFlavour = CoachingFlavour | HealthFlavour;

export interface NoteFlavourMeta {
  id: NoteFlavour;
  /** The chip's words. */
  label: string;
  /** A card's label after "Health · " — short enough not to wrap a row's label column. */
  short: string;
  blurb: string;
}

export const HEALTH_FLAVOURS: readonly NoteFlavourMeta[] = [
  { id: "Injury", label: "Injury or pain", short: "Injury", blurb: "A limitation or pain the load has to work around." },
  { id: "Surgery", label: "Surgery", short: "Surgery", blurb: "Coming up or behind her — the date, and what's off limits until she's cleared." },
  { id: "Medication", label: "Medication", short: "Medication", blurb: "Including GLP-1s, blood pressure and blood thinners." },
  { id: "Diagnosis", label: "Diagnosis", short: "Diagnosis", blurb: "A condition the team should know about." },
  { id: "OutsideCare", label: "Care outside the studio", short: "Outside care", blurb: "Massage, chiropractor, physical therapy, an adjustment." },
];

export const COACHING_FLAVOURS: readonly NoteFlavourMeta[] = [
  ...FOCUS_CATEGORIES.map((p) => ({ id: p as NoteFlavour, label: p, short: p, blurb: FOCUS_BLURBS[p] })),
  { id: "Setup", label: "Set-up & equipment", short: "Set-up", blurb: "Machine know-how that is not a setting — a pad, a stop, a sticky seat." },
];

/** The flavours a category offers, in order; none for the rest. */
export function flavoursOf(category: NoteCategory | null): readonly NoteFlavourMeta[] {
  if (category === "coaching") return COACHING_FLAVOURS;
  if (category === "health") return HEALTH_FLAVOURS;
  return [];
}

const HEALTH_FLAVOUR_IDS: ReadonlySet<string> = new Set(HEALTH_FLAVOURS.map((f) => f.id));
const FOCUS_IDS: ReadonlySet<string> = new Set(FOCUS_CATEGORIES);

/** A flavour that belongs to the category, or null (an old draft's leftover, a wrong pairing). */
export function flavourFor(category: NoteCategory | null, flavour: unknown): NoteFlavour | null {
  if (typeof flavour !== "string") return null;
  return flavoursOf(category).some((f) => f.id === flavour) ? (flavour as NoteFlavour) : null;
}

/**
 * What a note of this category and flavour is STORED as: its `kind` and its
 * `category` field. The one place the composer, the session's unsaved draft
 * and the To-file tray turn a choice into a write, so they can never differ.
 */
export function storedKindOf(
  category: FilingCategory,
  flavour: NoteFlavour | null = null,
): { kind: JournalKind; category: JournalEntry["category"] } {
  const f = flavourFor(category, flavour);
  switch (category) {
    case "coaching":
      if (f === "Setup") return { kind: "equipment", category: null };
      return { kind: "coaching", category: f && FOCUS_IDS.has(f) ? (f as FocusCategory) : null };
    case "health":
      return { kind: "injury", category: f && HEALTH_FLAVOUR_IDS.has(f) ? (f as HealthFlavour) : null };
    case "incident":
      return { kind: "incident", category: null };
    case "retention":
      return { kind: "retention", category: null };
    case "preference":
      return { kind: "preference", category: null };
  }
}

/** The categories that ask where on the body (AJ's map, `body-parts.ts`). */
export function asksBodyPart(category: NoteCategory | null): boolean {
  return category === "health" || category === "incident";
}

/**
 * Everything a choice in the composer stores, in one answer: the `kind` and
 * `category` (`storedKindOf`), and the body parts — kept only for Health and
 * Incident, in the map's order, and null when there are none. No category
 * (or FORD / Admin, which never write a note) is an unfiled `general` note.
 * The composer and the session's unsaved draft both write through this.
 */
export function storedNoteOf(
  category: NoteCategory | null,
  flavour: NoteFlavour | null,
  bodyParts: readonly NoteBodyMark[] | null | undefined,
): { kind: JournalKind; category: JournalEntry["category"]; bodyParts: NoteBodyMark[] | null } {
  if (!category || category === "ford" || category === "admin") {
    return { kind: "general", category: null, bodyParts: null };
  }
  const stored = storedKindOf(category, flavour);
  const marks = asksBodyPart(category) ? normaliseBodyMarks(bodyParts ?? []) : [];
  return { ...stored, bodyParts: marks.length ? marks : null };
}

/** The flavour a stored note carries, read back: the P or Set-up, a Health flavour, an old life note's surgery. */
export function flavourOf(entry: Pick<JournalEntry, "kind" | "category">): NoteFlavour | null {
  if (entry.kind === "equipment") return "Setup";
  if (entry.kind === "coaching" && entry.category && FOCUS_IDS.has(entry.category)) return entry.category as FocusCategory;
  if (entry.kind === "injury" && entry.category && HEALTH_FLAVOUR_IDS.has(entry.category)) {
    return entry.category as HealthFlavour;
  }
  if (entry.kind === "life" && (entry.category === "Surgery" || entry.category === "Injury")) return entry.category;
  return null;
}

/** The flavour's own words ("Care outside the studio"), or null. */
export function flavourLabel(flavour: NoteFlavour | null): string | null {
  if (!flavour) return null;
  return [...COACHING_FLAVOURS, ...HEALTH_FLAVOURS].find((f) => f.id === flavour)?.label ?? null;
}

/** The flavour's short word for a card ("Outside care"), or null. */
export function flavourShort(flavour: NoteFlavour | null): string | null {
  if (!flavour) return null;
  return [...COACHING_FLAVOURS, ...HEALTH_FLAVOURS].find((f) => f.id === flavour)?.short ?? null;
}

/**
 * A category id this app used before Oct 3 2026, as an old draft in
 * sessionStorage may still hold it, read as today's: Equipment is Coaching &
 * equipment's Set-up, Injury is Health. Anything unknown is no category.
 */
export function currentCategoryOf(stored: unknown): { category: NoteCategory | null; flavour: NoteFlavour | null } {
  if (stored === "equipment") return { category: "coaching", flavour: "Setup" };
  if (stored === "injury") return { category: "health", flavour: null };
  if (typeof stored === "string" && stored in NOTE_CATEGORY_META) {
    return { category: stored as NoteCategory, flavour: null };
  }
  return { category: null, flavour: null };
}

/**
 * True for a note saved without a category — "capture now, tag at teardown".
 * Only a note this app wrote as `general` since the reporting round counts;
 * an imported or archived "Note" (`isLegacy`) was a deliberate note then.
 */
export function isUnfiled(entry: Pick<JournalEntry, "kind" | "isLegacy">): boolean {
  return entry.kind === "general" && !entry.isLegacy;
}

/** Split a list into what still needs filing and what is filed, order kept. */
export function splitUnfiled<T extends Pick<JournalEntry, "kind" | "isLegacy">>(
  entries: readonly T[],
): { unfiled: T[]; filed: T[] } {
  const unfiled: T[] = [];
  const filed: T[] = [];
  for (const e of entries) (isUnfiled(e) ? unfiled : filed).push(e);
  return { unfiled, filed };
}

/* ------------------------------------------------------------------ */
/* THE NOTE FOR THE NEXT TRAINER                                       */
/* ------------------------------------------------------------------ */

/**
 * The End Session box's note, as the journal holds it (voice-review
 * follow-up, Sep 27 2026). AJ: "Ideally the end session note is made for the
 * next sessions pre session briefing but also can be filed to the profile".
 *
 * Finish writes it twice: onto the session document (`sessions.notes`, which
 * History, the export and the journal's read-only "Session summary" read) and
 * into the journal as an unfiled Heads up, which is what the next briefing
 * shows for three weeks. Being unfiled, it comes straight back in the
 * Wrap-up's To-file tray. It stays there, so it can be filed to the profile,
 * but it is labelled for what it is and offers no Discard: a discard archives
 * it, and an archived note leaves the next briefing. Filing changes only its
 * kind and category (`fileUnfiledEntry`), so a filed one is still a Heads up
 * and still on the briefing.
 */

/** How much of a note the journal keeps: every journal write cuts the body here. */
export const JOURNAL_BODY_LIMIT = 5000;

/**
 * The body a journal entry gets for `text`: trimmed, cut at
 * JOURNAL_BODY_LIMIT, trimmed again (createJournalEntry trims what it is
 * handed). The session document keeps the whole text, so a comparison
 * between the two copies goes through this.
 */
export function journalBodyOf(text: string | null | undefined): string {
  return (text ?? "").trim().slice(0, JOURNAL_BODY_LIMIT).trim();
}

/**
 * What the Wrap-up knows about the note Finish just wrote. `id` is the
 * journal entry's id once the write has answered (null while it has not:
 * offline, the entry is already in the local stream but its write has not
 * come back). `body` is the text as the journal holds it (`journalBodyOf`).
 */
export interface NextTrainerNoteMark {
  sessionId: string | null;
  id: string | null;
  body: string;
}

/**
 * Is `entry` the Note for the next trainer that `mark` describes? By its id
 * when the write has answered. Before that, by what Finish wrote: this
 * session, `origin: "post_session"`, a Heads up, the same words. Nothing
 * stored marks the note on its own (the Profile note shares its origin), so
 * the words are what tell it from anything else written for this session.
 */
export function isNextTrainerNote(
  entry: Pick<JournalEntry, "id" | "sessionId" | "origin" | "importance" | "body">,
  mark: NextTrainerNoteMark | null | undefined,
): boolean {
  if (!mark) return false;
  if (mark.id && entry.id === mark.id) return true;
  if (!mark.sessionId || !mark.body) return false;
  return (
    entry.sessionId === mark.sessionId &&
    entry.origin === "post_session" &&
    entry.importance === "elevated" &&
    (entry.body ?? "").trim() === mark.body
  );
}

/**
 * Is `entry` the Note for the next trainer of one of `sessions`? For a To-file
 * tray that has no mark of its own, such as the client's Notes page: Finish
 * copies the note onto its session (`sessions.notes`), so that copy is the
 * mark, compared as the journal keeps it (`journalBodyOf`). Only an unedited
 * copy matches: words changed later in History differ, and that card offers
 * Discard like any other. A session this list does not hold (not loaded yet,
 * or older than the load) finds nothing.
 */
export function isNextTrainerNoteOfSessions(
  entry: Pick<JournalEntry, "id" | "sessionId" | "origin" | "importance" | "body">,
  sessions: readonly { id?: string | null; notes?: string | null }[],
): boolean {
  if (!entry.sessionId || entry.origin !== "post_session" || entry.importance !== "elevated") return false;
  const session = sessions.find((s) => s.id === entry.sessionId);
  if (!session) return false;
  return isNextTrainerNote(entry, { sessionId: entry.sessionId, id: null, body: journalBodyOf(session.notes) });
}

/** Where an adapter-produced entry came from when it is an import, not a coach's note. */
const IMPORT_ORIGINS: ReadonlySet<JournalOrigin> = new Set<JournalOrigin>([
  "profile",
  "mindbody",
  "consultation",
]);

/**
 * The category a note is filed under.
 *
 *   coaching              -> Coaching & equipment
 *   equipment             -> Coaching & equipment (flavour Set-up)
 *   question              -> Coaching & equipment (an open question about one
 *                                      client, from Relay: a coaching question,
 *                                      filed with the cues it is about; its
 *                                      card says "Open question from …")
 *   injury                -> Health   (incl. the medical-history and clinical-
 *                                      notes profile fields, adapted as injury;
 *                                      its flavour is in `category`)
 *   life, Surgery/Injury  -> Health   (an old personal note about a surgery is
 *                                      a load constraint first — the same call
 *                                      sectionForEntry makes)
 *   life, anything else   -> FORD / Life
 *   incident              -> Incident
 *   retention             -> Retention
 *   preference            -> Preference
 *   general               -> Preference ("Preferences & other")
 *   consultation          -> Admin
 *   any other import from the profile, Mindbody or the intake -> Admin
 *   anything unrecognised -> Preference ("& other"), never dropped
 */
export function noteCategoryOf(
  entry: Pick<JournalEntry, "kind" | "category" | "origin" | "isLegacy">,
): NoteCategory {
  if (entry.kind === "injury") return "health";
  // Personal detail is FORD / Life wherever it came from — including a dated
  // high-priority event the journal keeps for the briefing.
  if (entry.kind === "life") {
    return entry.category === "Surgery" || entry.category === "Injury" ? "health" : "ford";
  }
  if (entry.kind === "consultation") return "admin";
  if (entry.isLegacy && IMPORT_ORIGINS.has(entry.origin)) return "admin";
  switch (entry.kind) {
    case "coaching":
    case "equipment":
    case "question":
      return "coaching";
    case "incident":
      return "incident";
    case "retention":
      return "retention";
    case "preference":
    case "general":
      return "preference";
    default:
      return "preference";
  }
}

/**
 * The label a single card wears. Older "Note" entries keep saying Note. An
 * open question (Relay room, Sep 28 2026) says whose it is while it is open,
 * "Open question from Ioreth", and "Question, answered" once its thread is
 * closed, so it reads as what it is on every card, the briefing's included.
 */
export function noteCardLabel(
  entry: Pick<JournalEntry, "kind" | "category" | "origin" | "isLegacy"> & Partial<Pick<JournalEntry, "authorName" | "resolvedAt">>,
): string {
  if (entry.kind === "question") {
    if (entry.resolvedAt) return "Question, answered";
    const first = (entry.authorName ?? "").trim().split(/\s+/)[0];
    return first ? `Open question from ${first}` : "Open question";
  }
  if (entry.kind === "coaching" && entry.category) return entry.category;
  if (entry.kind === "coaching") return "Coaching";
  if (entry.kind === "equipment") return "Equipment";
  if (entry.kind === "general" && !(entry.isLegacy && IMPORT_ORIGINS.has(entry.origin))) return "Note";
  const category = noteCategoryOf(entry);
  // A Health note says what kind of health note it is: "Health · Surgery".
  if (category === "health") {
    const flavour = flavourShort(flavourOf(entry));
    return flavour ? `Health · ${flavour}` : "Health";
  }
  return NOTE_CATEGORY_META[category].label;
}

/* ------------------------------------------------------------------ */
/* THE CATALOG                                                         */
/* ------------------------------------------------------------------ */

/**
 * THE CATALOG IS A CATALOG OF THREADS (Notes round, Sep 2026).
 *
 * It used to be shelves: one per category, newest three on each. AJ's
 * complaint was that Notes had inherited the Recent Journey grid — right for
 * a record you SURVEY, wrong for a place you go LOOKING IN, where everything
 * being equally quiet means you read all of it to remember any of it.
 *
 * So the structure is now the three zones (`threads.ts`), which come from
 * the timing a trainer already picked rather than a second status anyone
 * maintains: Open first, then Standing context, then Resolved tucked away.
 * The seven categories stay, as a filter across the zones — a note is still
 * filed under exactly one of them, and the tiles still name all seven.
 *
 * Months appear in one place only: inside an expanded Resolved zone, where
 * chronology is how you find a thread from last winter.
 *
 * THE NOTES PAGE (client codex, Sep 2026) reshaped the filter. The coach chip
 * row is gone — search already finds a coach's notes by name or initials on
 * every entry of a thread — and so is the "see all" zone: every zone now
 * holds every item, and the page decides what to fold. Only Resolved folds,
 * to its count and a "Show the N resolved notes" (`showResolved`); Open and
 * Standing are never cut, because a live thread you cannot see is the one
 * failure this screen exists to prevent.
 */

export interface CatalogFilter {
  category: NoteCategory | null;
  search: string;
  /**
   * One machine (FileMaker parity, Oct 1 2026): only threads with a note
   * about it, the root or any update. Like the search, it narrows the
   * category counts too. Null is every machine.
   */
  machineId?: string | null;
  /** The Resolved zone is unfolded. It never changes what is counted. */
  showResolved: boolean;
}

export const EMPTY_FILTER: CatalogFilter = { category: null, search: "", machineId: null, showResolved: false };

/** A thread is about a machine when any of its entries is. */
export function threadIsAboutMachine(thread: NoteThread, machineId: string): boolean {
  return thread.entries.some((e) => e.machineId === machineId);
}

/**
 * The machines a client has notes about, for the Notes page's machine
 * filter: each once, named as this floor names it, in name order. A machine
 * the floor no longer lists keeps a plain name rather than vanishing, so its
 * notes can still be found.
 */
export function machinesWithNotes(
  threads: readonly NoteThread[],
  machines: readonly { id?: string; name: string }[],
): { id: string; name: string }[] {
  const ids = new Set<string>();
  for (const t of threads) for (const e of t.entries) if (e.machineId) ids.add(e.machineId);
  return [...ids]
    .map((id) => ({ id, name: machines.find((m) => m.id === id)?.name ?? "A machine no longer on the floor" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The category chips on the Notes page, in the owner's order: every category
 * but FORD / Life, which is not a filter there but a door ("Life · in FORD")
 * to the page where a client's life is kept.
 */
export const NOTES_PAGE_CATEGORIES: readonly NoteCategoryMeta[] = NOTE_CATEGORIES.filter((c) => c.id !== "ford");

export interface CatalogTile {
  id: NoteCategory;
  count: number;
  newest: Date | null;
}

export interface CatalogZone {
  id: ThreadZone;
  /** Threads in this zone under the current filters. */
  total: number;
  /** Every one of them, in the zone's order (`sortThreads`). Never cut. */
  items: NoteThread[];
}

export interface CatalogMonth {
  /** "2026-09", or "undated". */
  key: string;
  label: string;
  items: NoteThread[];
}

export interface Catalog {
  /** Always all seven, in order, counted under the search (every zone, resolved included). */
  tiles: CatalogTile[];
  /** Always all three, in order: Open · Standing context · Resolved. */
  zones: CatalogZone[];
  /** The Resolved zone month by month, newest first, "Undated" last. */
  months: CatalogMonth[];
  /** Threads matching every filter. */
  matched: number;
  /** Threads in the catalog at all. */
  total: number;
}

const timeOf = (e: JournalEntry) => toDate(e.occurredAt)?.getTime() ?? 0;

/** True when the note mentions the needle in its text, category, author or source. */
export function matchesSearch(entry: JournalEntry, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  const meta = NOTE_CATEGORY_META[noteCategoryOf(entry)];
  const hay = [
    entry.body,
    entry.category ?? "",
    entry.authorName,
    entry.authorInitials,
    entry.legacySource ?? "",
    meta.label,
    meta.shelf,
    // What the card itself says: "Open question from Ioreth" is found by "question".
    noteCardLabel(entry),
    // The flavour in words ("Care outside the studio"), and where on the body
    // ("left knee"), so a search for either finds it (notes round, Oct 3 2026).
    flavourLabel(flavourOf(entry)) ?? "",
    bodyMarksLine(entry.bodyParts),
    // Every Health note written before Oct 3 2026 was filed as Injury, and a
    // trainer still searches for the word they know.
    entry.kind === "injury" && !flavourOf(entry) ? "injury" : "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/**
 * A thread matches when ANY of its entries does — searching "MRI" has to
 * find the shoulder thread whose third update is the one that says MRI.
 */
export function threadMatchesSearch(thread: NoteThread, needle: string): boolean {
  if (!needle.trim()) return true;
  return thread.entries.some((e) => matchesSearch(e, needle));
}

export function monthKeyOf(date: Date | null): string {
  if (!date) return "undated";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  if (key === "undated") return "Undated";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1, 12).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The category a thread is filed under: its root's. An update never re-files it. */
export function threadCategoryOf(thread: NoteThread): NoteCategory {
  return noteCategoryOf(thread.root);
}

/**
 * Build the catalog in one pass over what is already loaded. The input is
 * never mutated; a thread appears in exactly one category and one zone.
 */
export function buildCatalog(
  threads: readonly NoteThread[],
  filter: CatalogFilter,
  today: string,
  tz?: string,
): Catalog {
  const byCategory = new Map<NoteCategory, NoteThread[]>();
  for (const c of NOTE_CATEGORIES) byCategory.set(c.id, []);

  const kept: NoteThread[] = [];
  for (const t of threads) {
    // Search reads every entry of the thread — its updates, and who wrote
    // each one — so a coach's name finds the threads they added to as well.
    if (!threadMatchesSearch(t, filter.search)) continue;
    if (filter.machineId && !threadIsAboutMachine(t, filter.machineId)) continue;
    const cat = threadCategoryOf(t);
    byCategory.get(cat)!.push(t);
    if (!filter.category || filter.category === cat) kept.push(t);
  }

  const tiles: CatalogTile[] = NOTE_CATEGORIES.map((c) => {
    const list = byCategory
      .get(c.id)!
      .slice()
      .sort((a, b) => timeOf(b.root) - timeOf(a.root));
    return { id: c.id, count: list.length, newest: list.length ? toDate(list[0].root.occurredAt) : null };
  });

  const grouped = threadsByZone(kept, today, tz);
  const zones: CatalogZone[] = THREAD_ZONES.map((id) => ({ id, total: grouped[id].length, items: grouped[id] }));

  // The Resolved zone, month by month — how a thread from last winter is
  // found once the zone is unfolded. Newest month first; a note with no date
  // sorts as the oldest, so "Undated" is always last.
  const months: CatalogMonth[] = [];
  const merged = new Map<string, CatalogMonth>();
  for (const t of grouped.resolved.slice().sort((a, b) => timeOf(b.root) - timeOf(a.root))) {
    const key = monthKeyOf(toDate(t.root.occurredAt));
    const cur = merged.get(key);
    if (cur) cur.items.push(t);
    else merged.set(key, { key, label: monthLabel(key), items: [t] });
  }
  months.push(...merged.values());

  return { tiles, zones, months, matched: kept.length, total: threads.length };
}

/**
 * Profile fields the record already shows (and edits) in their own section —
 * medical history and constraints in Body, the why and the coach strategy in
 * Goals, Mindbody's account notes in Who they are. The journal adapts them so
 * other screens can read them as notes; the catalog on the SAME record leaves
 * them out, or every one of them is read twice (review round, Sep 2026).
 */
export const SHOWN_ELSEWHERE_ON_RECORD: ReadonlySet<string> = new Set([
  "legacy:profile:medicalHistory",
  "legacy:profile:clinicalNotes",
  "legacy:profile:globalNotes",
  "legacy:profile:discoveryNotes",
  "legacy:profile:mindbodyNotes",
]);

export function withoutRecordFields<T extends { id?: string }>(entries: readonly T[]): T[] {
  return entries.filter((e) => !e.id || !SHOWN_ELSEWHERE_ON_RECORD.has(e.id));
}
