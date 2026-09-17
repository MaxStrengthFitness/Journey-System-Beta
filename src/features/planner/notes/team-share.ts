/**
 * SHARING A NOTE WITH COLLEAGUES — for a handoff, a vacation, or the team.
 *
 * Round: Planner rework, Sep 2026. AJ: trainers "share specific, advanced
 * client notes temporarily with other trainers in the event of a vacation or
 * handoff … this can even be used with head trainers to help train new
 * trainers or help communicate plans for the whole team to follow."
 *
 * THE SAME SHAPE AS SHARING ONTO A RECORD: A COPY, NEVER AN OPEN DOOR
 * A private note stays private by path (trainers/{uid}/notes). Sharing writes
 * a COPY of the publishable part — title, body, kind, sources, the clients it
 * names — to the studio:
 *
 *   studios/{studioId}/noteShares/{noteId}
 *
 * with an audience: named people (`audienceIds`, their uids), or everyone who
 * works at that studio. The private note carries a `teamShare` marker saying
 * where its copy is, and a save rewrites or removes the copy in the same
 * batch — so the two can never disagree. The working log never travels.
 *
 * WHO MAY SEE CLIENT NAMES
 * A copy at studio S shows the names of the clients it is about to S's
 * people. So every linked client must be one S already coaches (their home
 * studio is S) — the editor checks before it lets the switch save.
 *
 * "TEMPORARY" — AND ITS LIMIT, STATED
 * A share can end on a date. After it, the copy disappears from everyone's
 * Notes and the author's Planner takes it down the next time it opens. The
 * rules do NOT enforce the date (a list query cannot be checked against the
 * clock), so until the author's Planner sweeps it, the copy still exists for
 * someone who goes looking with developer tools. The author can end a share
 * at any moment with one switch; that removal is immediate and enforced.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { addDays } from "../../studio-tasks/recurrence";
import { NOTE_BODY_MAX, NOTE_KINDS, NOTE_MAX_CLIENTS, NOTE_TITLE_MAX, type NoteKind, type NoteLink } from "./types";

/**
 * "people" and "team" are what the copies store (the rules allow only those
 * two). "network" (Relay, Sep 2026) is a MARKER audience on the author's
 * note: the same copy is written to every studio in `studioIds`, each as a
 * "team" share at that studio. Franchise and super roles can write at every
 * studio, which is who the option is offered to.
 */
export type ShareAudience = "people" | "team" | "network";
export type CopyAudience = "people" | "team";
export const SHARE_MAX_STUDIOS = 20;

export const SHARE_MAX_PEOPLE = 20;
export const SHARE_MESSAGE_MAX = 300;

export interface SharePerson {
  id: string;
  name: string;
}

/** The marker on the private note: where its colleague copy lives. */
export interface TeamShare {
  studioId: string;
  studioName: string;
  audience: ShareAudience;
  people: SharePerson[];
  /** Studio-local 'YYYY-MM-DD' (last day it shows), or null for "until I stop it". */
  expiresOn: string | null;
  message: string;
  /** "network" only: every studio the copy was written to (studioId among them). */
  studioIds?: string[];
}

/** studios/{studioId}/noteShares/{noteId} — the copy colleagues read. */
export interface NoteShare {
  id: string;
  noteId: string;
  studioId: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  kind: NoteKind;
  links: NoteLink[];
  clientIds: string[];
  clientNames: Record<string, string>;
  audience: CopyAudience;
  audienceIds: string[];
  expiresOn: string | null;
  message: string;
  updatedAt?: unknown;
}

export interface ShareProblem {
  message: string;
}

export function cleanTeamShare(t: TeamShare | null | undefined): TeamShare | null {
  if (!t || !t.studioId) return null;
  const seen = new Set<string>();
  const people: SharePerson[] = [];
  for (const p of t.people ?? []) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    people.push({ id: p.id, name: (p.name || "A trainer").slice(0, 80) });
  }
  const audience: ShareAudience = t.audience === "team" ? "team" : t.audience === "network" ? "network" : "people";
  const studioIds =
    audience === "network"
      ? [...new Set([t.studioId, ...(t.studioIds ?? [])].filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, SHARE_MAX_STUDIOS)
      : undefined;
  return {
    studioId: t.studioId,
    studioName: (t.studioName || "").slice(0, 80),
    audience,
    people: audience === "people" ? people.slice(0, SHARE_MAX_PEOPLE) : [],
    expiresOn: typeof t.expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.expiresOn) ? t.expiresOn : null,
    message: (t.message || "").trim().slice(0, SHARE_MESSAGE_MAX),
    ...(studioIds ? { studioIds } : {}),
  };
}

export function teamShareFromDoc(v: unknown): TeamShare | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.studioId !== "string") return null;
  return cleanTeamShare({
    studioId: d.studioId,
    studioName: typeof d.studioName === "string" ? d.studioName : "",
    audience: d.audience === "team" ? "team" : d.audience === "network" ? "network" : "people",
    people: Array.isArray(d.people) ? (d.people as SharePerson[]) : [],
    expiresOn: typeof d.expiresOn === "string" ? d.expiresOn : null,
    message: typeof d.message === "string" ? d.message : "",
    studioIds: Array.isArray(d.studioIds) ? (d.studioIds as string[]) : undefined,
  });
}

/** What stops a colleague share from saving, or null. */
export function teamShareProblem(t: TeamShare | null, todayKey: string): ShareProblem | null {
  if (!t) return null;
  if (t.audience === "people" && t.people.length === 0) {
    return { message: "Pick who to share it with — or choose everyone at the studio." };
  }
  if (t.people.length > SHARE_MAX_PEOPLE) return { message: `Share with ${SHARE_MAX_PEOPLE} people at most.` };
  if (t.expiresOn && todayKey && t.expiresOn < todayKey) return { message: "That end date has already passed." };
  if (t.message.length > SHARE_MESSAGE_MAX) {
    return { message: `Keep the message under ${SHARE_MESSAGE_MAX} characters.` };
  }
  return null;
}

/** Past its last day: hidden from readers and taken down by its author. */
export function shareExpired(t: { expiresOn: string | null }, todayKey: string): boolean {
  return Boolean(t.expiresOn && todayKey && t.expiresOn < todayKey);
}

/** The studios a marker's copies live at: one, or every studio for "network". */
export function shareStudios(t: TeamShare | null | undefined): string[] {
  if (!t) return [];
  if (t.audience === "network") return [...new Set([t.studioId, ...(t.studioIds ?? [])])];
  return [t.studioId];
}

/**
 * What a save has to do to the colleague copies.
 *   write   the studios to (re)write it at
 *   remove  the studios to delete it from
 */
export function teamSharePlan(
  before: TeamShare | null | undefined,
  after: TeamShare | null | undefined,
): { write: string[]; remove: string[] } {
  const next = shareStudios(after);
  const was = shareStudios(before);
  return { write: next, remove: was.filter((id) => !next.includes(id)) };
}

/** The copy's fields, minus id and timestamp. */
export function noteShareFields(
  note: {
    noteId: string;
    title: string;
    body: string;
    kind: NoteKind;
    links: NoteLink[];
    clientIds: string[];
    clientNames: Record<string, string>;
  },
  share: TeamShare,
  author: SharePerson,
  /** The studio this copy is for — the marker's, unless a network share fans out. */
  studioId: string = share.studioId,
): Omit<NoteShare, "id" | "updatedAt"> {
  const clientIds = note.clientIds.slice(0, NOTE_MAX_CLIENTS);
  return {
    noteId: note.noteId,
    studioId,
    authorId: author.id,
    authorName: (author.name || "A trainer").slice(0, 80),
    title: note.title.slice(0, NOTE_TITLE_MAX),
    body: note.body.slice(0, NOTE_BODY_MAX),
    kind: note.kind,
    links: note.links.slice(0, 10),
    clientIds,
    clientNames: Object.fromEntries(clientIds.map((id) => [id, (note.clientNames[id] ?? "").slice(0, 80)])),
    // A network share is a "team" copy at each studio: the rules know two audiences.
    audience: share.audience === "people" ? "people" : "team",
    audienceIds: share.audience === "people" ? share.people.map((p) => p.id) : [],
    expiresOn: share.expiresOn,
    message: share.message,
  };
}

export function noteShareFromDoc(id: string, d: Record<string, unknown> | undefined): NoteShare {
  const data = d ?? {};
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const clientIds = ids(data.clientIds).slice(0, NOTE_MAX_CLIENTS);
  const rawNames = (data.clientNames && typeof data.clientNames === "object" ? data.clientNames : {}) as Record<string, unknown>;
  return {
    id,
    noteId: str(data.noteId, 200) || id,
    studioId: str(data.studioId, 200),
    authorId: str(data.authorId, 200),
    authorName: str(data.authorName, 80) || "A colleague",
    title: str(data.title, NOTE_TITLE_MAX) || "Untitled",
    body: str(data.body, NOTE_BODY_MAX),
    kind: NOTE_KINDS.includes(data.kind as NoteKind) ? (data.kind as NoteKind) : "note",
    links: Array.isArray(data.links)
      ? (data.links as NoteLink[]).filter((l) => typeof l?.url === "string" && /^https?:\/\//i.test(l.url)).slice(0, 10)
      : [],
    clientIds,
    clientNames: Object.fromEntries(clientIds.map((c) => [c, typeof rawNames[c] === "string" ? (rawNames[c] as string) : ""])),
    audience: data.audience === "team" ? "team" : "people",
    audienceIds: ids(data.audienceIds),
    expiresOn: typeof data.expiresOn === "string" ? data.expiresOn : null,
    message: str(data.message, SHARE_MESSAGE_MAX),
    updatedAt: data.updatedAt,
  };
}

/**
 * The shares a reader should see: addressed to them or to their team, not
 * their own, not past their date. Newest first; one per note.
 */
export function visibleShares(list: NoteShare[], uid: string | null, todayKey: string): NoteShare[] {
  const byId = new Map<string, NoteShare>();
  for (const s of list) {
    if (!uid || s.authorId === uid) continue;
    if (shareExpired(s, todayKey)) continue;
    if (s.audience === "people" && !s.audienceIds.includes(uid)) continue;
    byId.set(s.id, s);
  }
  const ms = (v: unknown) => {
    const t = v as { toMillis?: () => number } | undefined;
    return typeof t?.toMillis === "function" ? t.toMillis() : v instanceof Date ? v.getTime() : 0;
  };
  return [...byId.values()].sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt) || a.title.localeCompare(b.title));
}

/** People to newly tell about a share: named now, not named before. */
export function newlyNamed(before: TeamShare | null | undefined, after: TeamShare | null | undefined): SharePerson[] {
  if (!after || after.audience !== "people") return [];
  const had = new Set(before && before.audience === "people" ? before.people.map((p) => p.id) : []);
  return after.people.filter((p) => !had.has(p.id));
}

export interface ExpiryChoice {
  label: string;
  expiresOn: string | null;
}

/** "Until I stop it", "This week" (through Sunday), "Two weeks", "A month". */
export function expiryChoices(todayKey: string): ExpiryChoice[] {
  return [
    { label: "Until I stop it", expiresOn: null },
    { label: "One week", expiresOn: addDays(todayKey, 6) },
    { label: "Two weeks", expiresOn: addDays(todayKey, 13) },
    { label: "A month", expiresOn: addDays(todayKey, 29) },
  ];
}

/** The sentence under the switch. */
export function teamShareSentence(
  t: TeamShare,
  opts: { dayWords: (key: string) => string; saved: boolean },
): string {
  const who =
    t.audience === "network"
      ? `everyone at every MSF studio (${shareStudios(t).length})`
      : t.audience === "team"
      ? `everyone who works at ${t.studioName || "this studio"}`
      : t.people.length === 0
        ? "nobody yet"
        : t.people.length === 1
          ? t.people[0].name
          : t.people.length === 2
            ? `${t.people[0].name} and ${t.people[1].name}`
            : `${t.people[0].name}, ${t.people[1].name} and ${t.people.length - 2} more`;
  const until = t.expiresOn ? ` until the end of ${opts.dayWords(t.expiresOn)}` : "";
  const lead = opts.saved ? "Shared with" : "When you save, it's shared with";
  return `${lead} ${who}${until}. They read it in their Notes and can save their own copy; only you can change it. Your working notes stay with you.`;
}
