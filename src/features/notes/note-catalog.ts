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
 */
import {
  COMPOSER_KINDS,
  toDate,
  type JournalEntry,
  type JournalKind,
  type JournalOrigin,
} from "../../types/journal";

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

export interface CatalogFilter {
  category: NoteCategory | null;
  coachId: string | null;
  search: string;
}

export const EMPTY_FILTER: CatalogFilter = { category: null, coachId: null, search: "" };

export interface CatalogTile {
  id: NoteCategory;
  count: number;
  newest: Date | null;
}

export interface CatalogShelf {
  id: NoteCategory;
  total: number;
  /** The newest `shelfSize`, newest first. */
  items: JournalEntry[];
}

export interface CatalogMonth {
  /** "2026-09", or "undated". */
  key: string;
  label: string;
  items: JournalEntry[];
}

export interface Catalog {
  /** Always all seven, in order, counted under the coach + search filters. */
  tiles: CatalogTile[];
  /** No category chosen: one shelf per non-empty category, in order. */
  shelves: CatalogShelf[];
  /** A category chosen: that category, month by month, newest first. */
  months: CatalogMonth[];
  /** Notes matching every filter. */
  matched: number;
  /** Notes in the catalog at all. */
  total: number;
}

export const SHELF_SIZE = 3;

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

export function monthKeyOf(date: Date | null): string {
  if (!date) return "undated";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  if (key === "undated") return "Undated";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1, 12).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * Build the catalog in one pass over what is already loaded. The input is
 * never mutated; a note appears in exactly one category.
 */
export function buildCatalog(
  entries: JournalEntry[],
  filter: CatalogFilter,
  shelfSize: number = SHELF_SIZE,
): Catalog {
  const sorted = entries.slice().sort((a, b) => timeOf(b) - timeOf(a));

  const byCategory = new Map<NoteCategory, JournalEntry[]>();
  for (const c of NOTE_CATEGORIES) byCategory.set(c.id, []);

  let matched = 0;
  for (const e of sorted) {
    if (filter.coachId && e.authorId !== filter.coachId) continue;
    if (!matchesSearch(e, filter.search)) continue;
    const cat = noteCategoryOf(e);
    byCategory.get(cat)!.push(e);
    if (!filter.category || filter.category === cat) matched += 1;
  }

  const tiles: CatalogTile[] = NOTE_CATEGORIES.map((c) => {
    const list = byCategory.get(c.id)!;
    return { id: c.id, count: list.length, newest: list.length ? toDate(list[0].occurredAt) : null };
  });

  const shelves: CatalogShelf[] = filter.category
    ? []
    : NOTE_CATEGORIES.map((c) => byCategory.get(c.id)!)
        .map((list, i) => ({
          id: NOTE_CATEGORIES[i].id,
          total: list.length,
          items: list.slice(0, shelfSize),
        }))
        .filter((s) => s.total > 0);

  const months: CatalogMonth[] = [];
  if (filter.category) {
    for (const e of byCategory.get(filter.category)!) {
      const key = monthKeyOf(toDate(e.occurredAt));
      const last = months[months.length - 1];
      if (last && last.key === key) last.items.push(e);
      else months.push({ key, label: monthLabel(key), items: [e] });
    }
    // Sorted newest first, undated last — so "undated" can only be the tail,
    // but merge any stray duplicate key defensively.
    const merged = new Map<string, CatalogMonth>();
    for (const m of months) {
      const cur = merged.get(m.key);
      if (cur) cur.items.push(...m.items);
      else merged.set(m.key, m);
    }
    months.splice(0, months.length, ...merged.values());
  }

  return { tiles, shelves, months, matched, total: entries.length };
}

/** Coaches who have written something here, most notes first. */
export function catalogCoaches(
  entries: JournalEntry[],
): { id: string; initials: string; name: string; count: number }[] {
  const map = new Map<string, { id: string; initials: string; name: string; count: number }>();
  for (const e of entries) {
    if (!e.authorId || e.authorId === "unknown") continue;
    const cur = map.get(e.authorId);
    if (cur) cur.count += 1;
    else
      map.set(e.authorId, {
        id: e.authorId,
        initials: e.authorInitials,
        name: e.authorName || e.authorInitials,
        count: 1,
      });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
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
