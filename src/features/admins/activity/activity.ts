/**
 * THE ACTIVITY RECORD — who changed what from the Admins dashboard, and when.
 * PURE: no React, no Firestore (log-activity.ts writes, useActivity.ts reads).
 *
 * AJ, Sep 28 2026: "all yes" to the Admins room's new data, the Activity
 * record among it — "a new Firestore collection so every standard edit,
 * publish, admin grant and assisted change is signed with who, what, when
 * and before and after" (the room's Needs OK list). One document per change:
 *
 *   activity/{id}  { at, by: { uid, name }, studioId, kind, what, before?, after? }
 *
 *   at        the server's time (the rules pin it)
 *   by        the Auth uid (never the trainer document's id: the two differ on
 *             older accounts, and the rules pin the uid) and the name as the
 *             app knew it
 *   studioId  the studio the change was made AT, or null for the company
 *             (the standard, the studio defaults, an admin grant). A studio's
 *             leaders read their own studio's entries; administrators read all
 *   kind      one of ACTIVITY_KINDS
 *   what      one plain sentence that starts with a verb ("Set Max Strength's
 *             default for A quiet floor to 3."); the row puts the name first
 *   before, after  the values that changed, keyed by the words a person reads
 *             ("Phone", "Role"), small and flat
 *
 * Append-only: nothing edits or removes an entry (the rules refuse both).
 *
 * AJ's q8 on signed marks: "I don't want there to be five markings on the
 * document". So the record is a list you go and read — Machinery → Activity,
 * and a studio's own Activity tab — and nothing here ever draws a mark on the
 * thing that was changed.
 */

export type ActivityKind =
  | "standard-edit"
  | "standard-set"
  | "publish"
  | "admin-grant"
  | "assisted-change"
  | "setting-default"
  | "studio-stage";

/** Every kind, in the order the filters list them. The rules name the same seven. */
export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  "admin-grant",
  "standard-edit",
  "standard-set",
  "publish",
  "setting-default",
  "studio-stage",
  "assisted-change",
];

/** What each kind is, in a word or two, quiet beside the sentence. */
export const KIND_WORDS: Record<ActivityKind, string> = {
  "standard-edit": "A catalog machine",
  "standard-set": "The standard set",
  publish: "Published to the catalog",
  "admin-grant": "Admin grant",
  "assisted-change": "Changed at a studio",
  "setting-default": "Studio defaults",
  "studio-stage": "Opening a studio",
};

/** The filters on Machinery → Activity: each is a set of kinds, so the query is one `in`. */
export interface ActivityFilter {
  id: "all" | "grants" | "standard" | "studios";
  label: string;
  kinds: ActivityKind[];
}

export const ACTIVITY_FILTERS: readonly ActivityFilter[] = [
  { id: "all", label: "All", kinds: [...ACTIVITY_KINDS] },
  { id: "grants", label: "Admin grants", kinds: ["admin-grant"] },
  { id: "standard", label: "The standard", kinds: ["standard-edit", "standard-set", "publish", "setting-default"] },
  { id: "studios", label: "Studios", kinds: ["studio-stage", "assisted-change"] },
];

/** A value a before/after map may hold: flat, so the record reads as it was written. */
export type ActivityValue = string | number | boolean | null;
export type ActivityValues = Record<string, ActivityValue>;

/** What a caller hands logActivity. */
export interface ActivityInput {
  kind: ActivityKind;
  /** One plain sentence, starting with a verb: the row puts the person's name first. */
  what: string;
  /** The studio the change was made at; null (or left out) for the company. */
  studioId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** The signed-in person's name, as the app knows it. */
  byName: string;
}

/** One entry as read back. */
export interface ActivityEntry {
  id: string;
  /** ms; null while the server's time has not come back yet. */
  at: number | null;
  by: { uid: string; name: string };
  studioId: string | null;
  /** A kind this build doesn't know (a newer one) is kept, and said as "A change". */
  kind: ActivityKind | string;
  what: string;
  before: ActivityValues | null;
  after: ActivityValues | null;
}

/** The limits, the same in firestore.rules. */
export const WHAT_MAX = 500;
export const NAME_MAX = 120;
export const VALUE_MAX = 300;
export const VALUES_MAX = 20;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function cleanValue(v: unknown): ActivityValue | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string") return clip(v, VALUE_MAX);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return clip(v.map((x) => String(x)).join(", "), VALUE_MAX);
  return clip(String(v), VALUE_MAX);
}

/**
 * A before/after map made safe to store: no undefined (Firestore refuses it),
 * flat values, at most twenty keys, a key never empty and never holding a dot
 * or a slash (so it can't be mistaken for a path). Null when nothing is left.
 */
export function cleanValues(values: Record<string, unknown> | null | undefined): ActivityValues | null {
  if (!values) return null;
  const out: ActivityValues = {};
  let n = 0;
  for (const [rawKey, raw] of Object.entries(values)) {
    if (n >= VALUES_MAX) break;
    const key = rawKey.replace(/[./]/g, " ").trim().slice(0, 80);
    if (!key) continue;
    const v = cleanValue(raw);
    if (v === undefined) continue;
    out[key] = v;
    n += 1;
  }
  return n > 0 ? out : null;
}

/**
 * The document logActivity writes, less `at` (the server's time, added at the
 * write). Throws on a kind the rules would refuse or an empty sentence, so a
 * caller's mistake shows in its tests rather than as a silent refusal.
 */
export function activityPayload(input: ActivityInput, uid: string): Record<string, unknown> {
  if (!(ACTIVITY_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`Not a kind the Activity record keeps: ${String(input.kind)}`);
  }
  const what = clip(String(input.what ?? ""), WHAT_MAX);
  if (!what) throw new Error("An Activity entry needs a sentence.");
  if (!uid) throw new Error("An Activity entry needs the signed-in person.");
  const name = clip(String(input.byName ?? ""), NAME_MAX) || "An administrator";
  const studioId = typeof input.studioId === "string" && input.studioId.trim() ? input.studioId.trim() : null;
  const payload: Record<string, unknown> = {
    by: { uid, name },
    studioId,
    kind: input.kind,
    what,
  };
  const before = cleanValues(input.before);
  const after = cleanValues(input.after);
  if (before) payload.before = before;
  if (after) payload.after = after;
  return payload;
}

function millis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const ts = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return null;
}

function readValues(v: unknown): ActivityValues | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return cleanValues(v as Record<string, unknown>);
}

/** One stored document as an entry, or null when it isn't one (never a guess). */
export function toActivityEntry(id: string, raw: unknown): ActivityEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const what = typeof d.what === "string" ? d.what.trim() : "";
  if (!what) return null;
  const by = (d.by && typeof d.by === "object" ? d.by : {}) as { uid?: unknown; name?: unknown };
  return {
    id,
    at: millis(d.at),
    by: {
      uid: typeof by.uid === "string" ? by.uid : "",
      name: typeof by.name === "string" && by.name.trim() ? by.name.trim() : "Someone",
    },
    studioId: typeof d.studioId === "string" && d.studioId ? d.studioId : null,
    kind: typeof d.kind === "string" ? d.kind : "",
    what,
    before: readValues(d.before),
    after: readValues(d.after),
  };
}

/** The kind in words; a kind this build doesn't know is "A change". */
export function kindWords(kind: string): string {
  return (KIND_WORDS as Record<string, string>)[kind] ?? "A change";
}

/** A stored value as a person reads it: empty is "none", true is "yes". */
export function describeValue(v: ActivityValue | undefined): string {
  if (v === undefined || v === null || v === "") return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/**
 * "Phone: none → 440-555-0101; Address: 1 Main St → 2 Main St", four keys at
 * most and a count of the rest; null when there is nothing to say. This is
 * the reader of before and after: every value stored is shown somewhere.
 */
export function changeLine(before: ActivityValues | null, after: ActivityValues | null, most = 4): string | null {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return null;
  const parts = keys.slice(0, most).map((k) => {
    const b = before && k in before ? before[k] : undefined;
    const a = after && k in after ? after[k] : undefined;
    if (!before) return `${k}: ${describeValue(a)}`;
    if (!after) return `${k} was ${describeValue(b)}`;
    return `${k}: ${describeValue(b)} → ${describeValue(a)}`;
  });
  const rest = keys.length - most;
  return `${parts.join("; ")}${rest > 0 ? `; and ${rest} more` : ""}`;
}

/** Newest first; an entry still waiting for the server's time sorts first (it is the newest). */
export function newestFirst(entries: readonly ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((a, b) => (b.at ?? Number.MAX_SAFE_INTEGER) - (a.at ?? Number.MAX_SAFE_INTEGER));
}

/** "A, B and C". */
export function andList(list: readonly string[]): string {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
