/**
 * COMMENTS ON LEARNING PAGES — the rules, without React or Firestore.
 *
 * Round: Learning + Planner, Sep 2026. AJ: "each area can have comments and
 * people should be able to tag people in the comments maybe?" He chose: each
 * studio sees only its own comments on a page, and can tag trainers at that
 * studio, who hear about it in their bell. Nothing leaves the app.
 *
 * WHERE THEY LIVE
 *
 *   studios/{studioId}/comments/{commentId}
 *
 * One collection per studio, so "own studio" is the path — the same
 * structural privacy as everything else studio-scoped — and one query per
 * page (`targetKey == learningRefKey(page)`). A machine's thread is the same
 * on the studio's page and in All MSF machines, because both are the same
 * ref.
 *
 * TAGGING
 *
 * Type @ and pick a person: "@Jordan Head" goes into the text, and Jordan
 * into `mentions`. A tag deleted from the text before posting is dropped —
 * `mentions` only ever names people the words still name, so nobody is
 * notified about a comment that no longer mentions them.
 *
 * PURE MODULE.
 */

import type { StoredLearningRef } from "../learning/ref";

export const COMMENT_MAX = 2000;
export const MENTIONS_MAX = 10;

/** Someone who can be tagged: works at the studio, and can sign in. */
export interface MentionPerson {
  id: string;
  name: string;
  initials: string;
}

export interface Mention {
  id: string;
  name: string;
}

/** studios/{studioId}/comments/{commentId} */
export interface StudioComment {
  id: string;
  studioId: string;
  /** learningRefKey(target) — what the page queries on. */
  targetKey: string;
  /** The page, so the bell can open it. */
  target: StoredLearningRef;
  body: string;
  authorId: string;
  authorName: string;
  mentions: Mention[];
  createdAt?: unknown;
  editedAt?: unknown;
}

/* ------------------------------------------------------------------ *
 * Who can be tagged
 * ------------------------------------------------------------------ */

type TrainerLike = {
  id: string;
  fullName?: string;
  nickname?: string;
  initials?: string;
  primaryHomeStudioId?: string;
  accessibleStudioIds?: string[];
  activeGuestStudioIds?: string[];
  ownedStudioIds?: string[];
  pendingClaim?: boolean;
  supersededByUid?: string | null;
};

/**
 * The people at this studio who can be tagged, by name. Not the author, and
 * not a profile nobody can sign in to yet (an unclaimed placeholder, or one a
 * claim has replaced) — a tag there would ring a bell nobody hears.
 */
export function mentionablePeople(trainers: TrainerLike[], studioId: string | null, selfId: string | null): MentionPerson[] {
  if (!studioId) return [];
  const out: MentionPerson[] = [];
  const seen = new Set<string>();
  for (const t of trainers) {
    if (!t?.id || seen.has(t.id) || t.id === selfId) continue;
    if (t.pendingClaim || t.supersededByUid) continue;
    const here =
      t.primaryHomeStudioId === studioId ||
      (t.accessibleStudioIds ?? []).includes(studioId) ||
      (t.activeGuestStudioIds ?? []).includes(studioId) ||
      (t.ownedStudioIds ?? []).includes(studioId);
    if (!here) continue;
    const name = (t.fullName || t.nickname || "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    seen.add(t.id);
    out.push({ id: t.id, name, initials: (t.initials || initialsOf(name)).slice(0, 3) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Typing a tag
 * ------------------------------------------------------------------ */

/**
 * The tag being typed at the caret, if any: an "@" at the start or after a
 * space, then up to 30 characters of a name (letters, spaces, apostrophes,
 * hyphens and dots — "Jo Anne O'Neil-Smith"), with the caret at its end.
 */
export function activeMention(body: string, caret: number): { start: number; query: string } | null {
  const before = body.slice(0, Math.max(0, Math.min(caret, body.length)));
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /[\n\r]/.test(query) || !/^[\p{L}' .-]*$/u.test(query)) return null;
  // Two spaces in a row means the sentence moved on.
  if (/\s\s/.test(query)) return null;
  return { start: at, query };
}

/** People whose name matches what has been typed after the "@". */
export function mentionMatches(people: MentionPerson[], query: string, limit = 6): MentionPerson[] {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice(0, limit);
  const words = q.split(/\s+/);
  return people
    .filter((p) => {
      const name = p.name.toLowerCase();
      const parts = name.split(/\s+/);
      return words.every((w) => parts.some((part) => part.startsWith(w)) || name.startsWith(q));
    })
    .slice(0, limit);
}

/** The body with the typed tag replaced by the person's name, and where the caret goes. */
export function insertMention(
  body: string,
  mention: { start: number; query: string },
  person: MentionPerson,
): { body: string; caret: number } {
  const end = mention.start + 1 + mention.query.length;
  const text = `@${person.name} `;
  const next = body.slice(0, mention.start) + text + body.slice(end).replace(/^ /, "");
  return { body: next, caret: mention.start + text.length };
}

/**
 * Who a comment tags: the people picked while typing whose "@Name" is still
 * in the text. De-duplicated, capped, in the order they were picked.
 */
export function mentionsIn(body: string, picked: Mention[]): Mention[] {
  const out: Mention[] = [];
  const seen = new Set<string>();
  for (const p of picked) {
    if (seen.has(p.id) || !p.name) continue;
    if (!body.includes(`@${p.name}`)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: p.name.slice(0, 80) });
    if (out.length >= MENTIONS_MAX) break;
  }
  return out;
}

/** Tags added by an edit — the only people an edit notifies. */
export function newMentions(before: Mention[], after: Mention[]): Mention[] {
  const had = new Set(before.map((m) => m.id));
  return after.filter((m) => !had.has(m.id));
}

/* ------------------------------------------------------------------ *
 * Showing a comment
 * ------------------------------------------------------------------ */

export type CommentSegment = { kind: "text"; text: string } | { kind: "mention"; text: string; id: string };

/** The body split so each "@Name" it tags can be drawn as a tag. */
export function commentSegments(body: string, mentions: Mention[]): CommentSegment[] {
  const names = mentions
    .filter((m) => m.name)
    .map((m) => ({ id: m.id, token: `@${m.name}` }))
    // Longest first, so "@Jo Anne" wins over "@Jo".
    .sort((a, b) => b.token.length - a.token.length);
  const out: CommentSegment[] = [];
  let text = "";
  let i = 0;
  while (i < body.length) {
    const hit = body[i] === "@" ? names.find((n) => body.startsWith(n.token, i)) : undefined;
    if (hit) {
      if (text) out.push({ kind: "text", text });
      text = "";
      out.push({ kind: "mention", text: hit.token, id: hit.id });
      i += hit.token.length;
    } else {
      text += body[i];
      i += 1;
    }
  }
  if (text) out.push({ kind: "text", text });
  return out;
}

export function validateComment(body: string): string | null {
  const b = body.trim();
  if (!b) return "Write something first.";
  if (b.length > COMMENT_MAX) return `Keep it under ${COMMENT_MAX.toLocaleString()} characters.`;
  return null;
}

/** "Alex tagged you on Leg Press" — the bell's line. */
export function mentionTitle(authorName: string, pageLabel: string): string {
  const who = authorName.trim() || "Someone";
  return `${who} tagged you on ${pageLabel}`.slice(0, 200);
}

/** The first bit of the comment, for the bell. */
export function commentExcerpt(body: string, max = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function millis(v: unknown): number {
  const t = v as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return Number.MAX_SAFE_INTEGER; // just posted: the newest
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return Number.MAX_SAFE_INTEGER;
}

/** Oldest first — a thread reads down, like a conversation. */
export function sortComments(comments: StudioComment[]): StudioComment[] {
  return [...comments].sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
}

/** Defensive, so one odd document never blanks a thread. */
export function commentFromDoc(id: string, studioId: string, d: Record<string, unknown> | undefined): StudioComment | null {
  if (!d) return null;
  const body = typeof d.body === "string" ? d.body.slice(0, COMMENT_MAX) : "";
  if (!body.trim()) return null;
  const mentions = Array.isArray(d.mentions)
    ? (d.mentions as unknown[])
        .filter((m): m is Mention => Boolean(m) && typeof (m as Mention).id === "string" && typeof (m as Mention).name === "string")
        .slice(0, MENTIONS_MAX)
    : [];
  return {
    id,
    studioId,
    targetKey: typeof d.targetKey === "string" ? d.targetKey : "",
    target: (d.target as StoredLearningRef) ?? ({ kind: "academy-cueing" } as StoredLearningRef),
    body,
    authorId: typeof d.authorId === "string" ? d.authorId : "",
    authorName: typeof d.authorName === "string" && d.authorName.trim() ? d.authorName : "A trainer",
    mentions,
    createdAt: d.createdAt,
    editedAt: d.editedAt,
  };
}

/**
 * Who may take a comment down: its author, the studio's leaders, and
 * administrators — the rules' delete branch.
 */
export function canDeleteComment(
  comment: Pick<StudioComment, "authorId">,
  uid: string | null,
  isLeaderHere: boolean,
): boolean {
  return Boolean(uid && comment.authorId === uid) || isLeaderHere;
}
