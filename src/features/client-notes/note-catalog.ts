/**
 * THE NOTES CATALOG — every note in one of seven categories.
 *
 * The owner's audit (Sep 2026): the Notes area was "a never-ending feed",
 * one chronological timeline where an old injury report sat under months of
 * coaching cues and the only way to learn anything was to read all of it. The
 * fix is a CATALOG: every note has a clear category, one tap isolates a
 * category, and a search runs across all of them.
 *
 * The seven categories are the owner's choice, in this order:
 *
 *   Coaching tip (4 P's) · Equipment · Incident · Injury · Preference ·
 *   FORD / Life · Admin (Mindbody + intake)
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
  toDate,
  type JournalEntry,
  type JournalKind,
  type JournalOrigin,
} from "../../types/journal";
import {
  THREAD_ZONES,
  threadsByZone,
  type NoteThread,
  type ThreadZone,
} from "./threads";

export type NoteCategory =
  | "coaching"
  | "equipment"
  | "incident"
  | "injury"
  | "preference"
  | "ford"
  | "admin";

export interface NoteCategoryMeta {
  id: NoteCategory;
  /** Chip and tile label. */
  label: string;
  /** Shelf heading, where it differs from the label. */
  shelf: string;
  /** One line under the chip / on the empty shelf. */
  blurb: string;
  /** lucide-react icon name. */
  icon: string;
  /**
   * The journal kind a new note of this category is written as. Null for the
   * two that never write a journal entry: FORD / Life hands off to the FORD
   * capture, and Admin is read-only imports.
   */
  kind: JournalKind | null;
  /** The kind whose colour the category borrows (see getEntryVisual). */
  visualKind: JournalKind;
}

export const NOTE_CATEGORIES: readonly NoteCategoryMeta[] = [
  {
    id: "coaching",
    label: "Coaching tip",
    shelf: "Coaching tips",
    blurb: "A cue or correction — Posture, Pace, Path, Purpose.",
    icon: "Target",
    kind: "coaching",
    visualKind: "coaching",
  },
  {
    id: "equipment",
    label: "Equipment",
    shelf: "Equipment",
    blurb: "Machine know-how that is not a setting.",
    icon: "Dumbbell",
    kind: "equipment",
    visualKind: "equipment",
  },
  {
    id: "incident",
    label: "Incident",
    shelf: "Incidents",
    blurb: "Something went wrong in the room.",
    icon: "AlertTriangle",
    kind: "incident",
    visualKind: "incident",
  },
  {
    id: "injury",
    label: "Injury",
    shelf: "Injuries",
    blurb: "A limitation, surgery or pain the load has to work around.",
    icon: "Bandage",
    kind: "injury",
    visualKind: "injury",
  },
  {
    id: "preference",
    label: "Preference",
    shelf: "Preferences & other",
    blurb: "How they like things done — music, fan, pace of talk.",
    icon: "ThumbsUp",
    kind: "preference",
    visualKind: "preference",
  },
  {
    id: "ford",
    label: "FORD / Life",
    shelf: "FORD / Life",
    blurb: "Family, occupation, recreation, dreams — kept in Life.",
    icon: "Heart",
    kind: null,
    visualKind: "life",
  },
  {
    id: "admin",
    label: "Admin",
    shelf: "Admin · Mindbody & intake",
    blurb: "Imported from Mindbody, the intake and the profile. Read-only.",
    icon: "ClipboardList",
    kind: null,
    visualKind: "consultation",
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

/** Where an adapter-produced entry came from when it is an import, not a coach's note. */
const IMPORT_ORIGINS: ReadonlySet<JournalOrigin> = new Set<JournalOrigin>([
  "profile",
  "mindbody",
  "consultation",
]);

/**
 * The category a note is filed under.
 *
 *   coaching              -> Coaching tip
 *   equipment             -> Equipment
 *   incident              -> Incident
 *   injury                -> Injury   (incl. the medical-history and clinical-
 *                                      notes profile fields, adapted as injury)
 *   life, Surgery/Injury  -> Injury   (an old personal note about a surgery is
 *                                      a load constraint first — the same call
 *                                      sectionForEntry makes)
 *   life, anything else   -> FORD / Life
 *   preference            -> Preference
 *   general               -> Preference ("Preferences & other")
 *   consultation          -> Admin
 *   any other import from the profile, Mindbody or the intake -> Admin
 *   anything unrecognised -> Preference ("& other"), never dropped
 */
export function noteCategoryOf(
  entry: Pick<JournalEntry, "kind" | "category" | "origin" | "isLegacy">,
): NoteCategory {
  if (entry.kind === "injury") return "injury";
  // Personal detail is FORD / Life wherever it came from — including a dated
  // high-priority event the journal keeps for the briefing.
  if (entry.kind === "life") {
    return entry.category === "Surgery" || entry.category === "Injury" ? "injury" : "ford";
  }
  if (entry.kind === "consultation") return "admin";
  if (entry.isLegacy && IMPORT_ORIGINS.has(entry.origin)) return "admin";
  switch (entry.kind) {
    case "coaching":
      return "coaching";
    case "equipment":
      return "equipment";
    case "incident":
      return "incident";
    case "preference":
    case "general":
      return "preference";
    default:
      return "preference";
  }
}

/** The label a single card wears. Older "Note" entries keep saying Note. */
export function noteCardLabel(entry: Pick<JournalEntry, "kind" | "category" | "origin" | "isLegacy">): string {
  if (entry.kind === "coaching" && entry.category) return entry.category;
  if (entry.kind === "general" && !(entry.isLegacy && IMPORT_ORIGINS.has(entry.origin))) return "Note";
  return NOTE_CATEGORY_META[noteCategoryOf(entry)].label;
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
  /** The Resolved zone is unfolded. It never changes what is counted. */
  showResolved: boolean;
}

export const EMPTY_FILTER: CatalogFilter = { category: null, search: "", showResolved: false };

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
