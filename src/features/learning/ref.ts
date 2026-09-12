/**
 * LEARNING LINKS — one way to point at any page in Learning.
 *
 * Round: Learning + Planner, Sep 2026.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this file, "open that page" meant a different thing in every place
 * that wanted it. The Catalog accepted a bare machine id, the Academy accepted
 * a machine plus "card" or "script", and a notification carried `{ view, id }`
 * which AppContent only honoured for a client profile — so a "machine
 * flagged" notification opened the Catalog's front page and dropped the one
 * thing it was about.
 *
 * Search, the bell, announcements, Planner notes and comments all need to
 * point at a page now. A ref is the one shape they all store: what kind of
 * page, and its id.
 *
 * WHAT THE IDS ARE
 * ----------------
 *   machine            the canonical machine id (m-leg-press, sm-{studio}-*)
 *   academy-*          ids from the generated Academy corpus. They are slugs of
 *                      the source file names (scripts/build-academy-content.ts),
 *                      so a rebuilt corpus can rename one. Every stored ref
 *                      therefore carries the TITLE it had when it was saved,
 *                      and a page that no longer exists says so rather than
 *                      spinning (see AcademyWikiView).
 *   academy-topic      also carries its module when it is known. Opening a
 *                      topic needs the module's text, and the Academy index
 *                      can find the module from the topic id when it is not.
 *   studio-page        a page one studio wrote. Only that studio can open it,
 *                      so the studio id travels with it.
 *
 * PURE MODULE — no React, no Firestore.
 */

export type LearningRef =
  | { kind: "machine"; id: string }
  | { kind: "academy-card"; id: string }
  | { kind: "academy-script"; id: string }
  | { kind: "academy-overview"; id: string }
  | { kind: "academy-module"; id: string }
  | { kind: "academy-topic"; id: string; moduleId?: string }
  | { kind: "academy-cueing" }
  | { kind: "academy-glossary"; id?: string }
  | { kind: "studio-page"; id: string; studioId: string };

export type LearningRefKind = LearningRef["kind"];

/**
 * A ref as it is stored on a document (an announcement, a notification, a
 * note): the ref, plus the title the page had when it was linked. The title
 * is what a link shows before the page's content has loaded, and what it
 * still shows if the page has since moved.
 */
export type StoredLearningRef = LearningRef & { title?: string };

export const LEARNING_REF_KINDS: readonly LearningRefKind[] = [
  "machine",
  "academy-card",
  "academy-script",
  "academy-overview",
  "academy-module",
  "academy-topic",
  "academy-cueing",
  "academy-glossary",
  "studio-page",
];

/** Kinds that name one page and so must carry an id. */
const NEEDS_ID: ReadonlySet<LearningRefKind> = new Set<LearningRefKind>([
  "machine",
  "academy-card",
  "academy-script",
  "academy-overview",
  "academy-module",
  "academy-topic",
  "studio-page",
]);

/** Mirrors the limits in firestore.rules (learningRefValid). */
export const LEARNING_ID_MAX = 200;
export const LEARNING_TITLE_MAX = 160;

/** Which Learning section a ref opens in. */
export function learningSectionOf(ref: LearningRef): "catalog" | "academy" {
  return ref.kind === "machine" ? "catalog" : "academy";
}

/** A short, human word for the kind of page — the fallback when there is no title. */
export const LEARNING_KIND_LABEL: Record<LearningRefKind, string> = {
  machine: "Machine",
  "academy-card": "Quick reference card",
  "academy-script": "Spoken script",
  "academy-overview": "Deep dive",
  "academy-module": "Academy module",
  "academy-topic": "Academy topic",
  "academy-cueing": "Cueing phrasebook",
  "academy-glossary": "Glossary",
  "studio-page": "Studio page",
};

/**
 * A stable string for a ref: map keys, React keys, "is this the same page".
 * The module and title are left out on purpose — they describe the page, they
 * do not identify it.
 */
export function learningRefKey(ref: LearningRef): string {
  switch (ref.kind) {
    case "academy-cueing":
      return "academy-cueing";
    case "academy-glossary":
      return ref.id ? `academy-glossary:${ref.id}` : "academy-glossary";
    case "studio-page":
      return `studio-page:${ref.studioId}/${ref.id}`;
    default:
      return `${ref.kind}:${ref.id}`;
  }
}

export function sameLearningRef(
  a: LearningRef | null | undefined,
  b: LearningRef | null | undefined,
): boolean {
  if (!a || !b) return false;
  return learningRefKey(a) === learningRefKey(b);
}

/** A usable id: a non-empty string with no control characters, within the limit. */
function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > LEARNING_ID_MAX) return null;
  // Control characters have no business in an id and would corrupt a key.
  if (/[\u0000-\u001F\u007F]/.test(v)) return null;
  return v;
}

function cleanTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return undefined;
  return v.length > LEARNING_TITLE_MAX ? `${v.slice(0, LEARNING_TITLE_MAX - 1)}…` : v;
}

/**
 * Read a ref back from anything — a Firestore map, a notification link.
 *
 * Returns null for anything that is not a ref this build understands, rather
 * than guessing: a link that silently opens the wrong page is worse than one
 * that does nothing. Unknown keys are dropped.
 */
export function parseLearningRef(raw: unknown): StoredLearningRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind as LearningRefKind;
  if (!LEARNING_REF_KINDS.includes(kind)) return null;

  const title = cleanTitle(r.title);
  const withTitle = <T extends LearningRef>(ref: T): StoredLearningRef =>
    (title ? { ...ref, title } : ref) as StoredLearningRef;

  if (kind === "academy-cueing") return withTitle({ kind });

  if (kind === "academy-glossary") {
    const id = cleanId(r.id);
    return withTitle(id ? { kind, id } : { kind });
  }

  const id = cleanId(r.id);
  if (NEEDS_ID.has(kind) && !id) return null;

  if (kind === "studio-page") {
    const studioId = cleanId(r.studioId);
    if (!studioId) return null;
    return withTitle({ kind, id: id as string, studioId });
  }

  if (kind === "academy-topic") {
    const moduleId = cleanId(r.moduleId);
    return withTitle(
      moduleId ? { kind, id: id as string, moduleId } : { kind, id: id as string },
    );
  }

  return withTitle({ kind, id: id as string } as LearningRef);
}

/**
 * The plain object to write to Firestore. No undefined values (Firestore
 * refuses them), the title trimmed and capped. Returns null for a ref that
 * would not read back — callers should not store what cannot be opened.
 */
export function toStoredLearningRef(
  ref: LearningRef,
  title?: string | null,
): StoredLearningRef | null {
  const parsed = parseLearningRef({ ...ref, title: title ?? undefined });
  if (!parsed) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined) out[k] = v;
  }
  return out as StoredLearningRef;
}

/** What a link to this ref says: its saved title, or the kind of page it is. */
export function learningRefLabel(ref: StoredLearningRef | LearningRef): string {
  const title = (ref as StoredLearningRef).title;
  if (title) return title;
  if (ref.kind === "academy-glossary" && ref.id) return `Glossary: ${ref.id}`;
  return LEARNING_KIND_LABEL[ref.kind];
}

/**
 * The machine a studio-wiki overlay target points at, or the Academy document.
 *
 * Studio notes and (from Phase 5) comments attach to the same five target
 * types the studio wiki already uses. This is the one place those types turn
 * into refs, so a comment and an overlay on the same page can never disagree
 * about which page that is.
 */
export function refForWikiTarget(
  type: "machine" | "topic" | "card" | "script" | "overview",
  id: string,
): LearningRef {
  switch (type) {
    case "machine":
      return { kind: "machine", id };
    case "topic":
      return { kind: "academy-topic", id };
    case "card":
      return { kind: "academy-card", id };
    case "script":
      return { kind: "academy-script", id };
    case "overview":
      return { kind: "academy-overview", id };
  }
}
