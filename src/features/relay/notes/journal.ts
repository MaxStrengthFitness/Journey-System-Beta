/**
 * THE JOURNAL — note types, their templates and shelves, hunches, and what
 * may go where (the second wave of the Relay room, Sep 28 2026; AJ: "all
 * yes"). Relay's third tab is the trainer's own notes; this adds the
 * blueprint's typed journal on top of them without changing a note written
 * before (Direction C's shelves, research-relay §4.6):
 *
 *   Type       Template                                   Where it may go
 *   Client     Who · What I noticed · What I'll do next   onto that client's record, a colleague
 *   Machine    Machine · What I noticed · Setting or cue  the Studio shelf, a colleague
 *   Protocol   When · Steps · Why                         the Studio shelf, a colleague
 *   Research   Source · The claim · What I'll try         the Studio shelf, a colleague
 *   Trend      What I think · How I'll know · Evidence    nowhere until its sample is met; then
 *              so far (a hunch)                           written up for the Studio shelf
 *   Personal   What? · So what? · Now what?               never
 *
 * (q8's default: personal notes and day logs never; machine and protocol
 * notes to the Studio shelf; client notes onto that client's record.)
 *
 * The STUDIO SHELF is the studio's Playbook under a clearer name: shared
 * with everyone at the studio and never naming a client (its rule refuses a
 * `clientId`). Putting a note there writes a COPY, as every share does.
 *
 * A HUNCH is a Trend note: a claim, the sample that would show it ("8
 * clients over 80, each with 4 sessions"), and evidence added one at a time.
 * It says "not enough data yet" until the evidence meets the sample, and it
 * holds one of three slots until it is met or retired.
 *
 * A note written before any of this has no type: it keeps its kind, its
 * folder and its body, and shows on the shelf its kind or its client points
 * to (a research note on Research, a note about a client on Clients).
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import type { PlaybookDraft } from "../../studio-tasks/playbook";
import { PLAYBOOK_BODY_MAX, PLAYBOOK_TITLE_MAX } from "../../studio-tasks/playbook";
import { addDays } from "../../studio-tasks/recurrence";
import {
  HUNCH_CLAIM_MAX,
  HUNCH_EVIDENCE_MAX,
  HUNCH_HOW_MAX,
  HUNCH_NEED_MAX,
  HUNCH_SLOTS,
  NOTE_FIELD_MAX,
  NOTE_TYPES,
  type Hunch,
  type HunchEvidence,
  type NoteDraft,
  type NoteFields,
  type NoteKind,
  type NoteType,
  type TrainerNote,
} from "./types";

export type ShelfId = "clients" | "machines" | "protocol" | "research" | "trends" | "personal";

export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
}

export interface NoteTemplate {
  type: NoteType;
  label: string;
  /** The three short lines. A Trend's third is its evidence, added one at a time. */
  fields: [TemplateField, TemplateField, TemplateField];
  shelf: ShelfId;
  /** Who sees it and where it may go, in one sentence under the editor. */
  vis: string;
  /** The stored kind (the rules' list): research for Research, a note otherwise. */
  kind: NoteKind;
  /** Where it may be shared: onto a client's record, with colleagues, to the Studio shelf. */
  shares: { record: boolean; colleagues: boolean; studioShelf: boolean };
}

export const NOTE_TEMPLATES: Record<NoteType, NoteTemplate> = {
  client: {
    type: "client",
    label: "Client",
    fields: [
      { key: "who", label: "Who", placeholder: "Barliman Butterbur" },
      { key: "noticed", label: "What I noticed", placeholder: "His knee is calmer when we start on the Leg Press." },
      { key: "next", label: "What I'll do next time", placeholder: "Keep the Leg Press first and ask about the knee at the door." },
    ],
    shelf: "clients",
    vis: "Only you. You can share it onto the client's record.",
    kind: "note",
    shares: { record: true, colleagues: true, studioShelf: false },
  },
  machine: {
    type: "machine",
    label: "Machine",
    fields: [
      { key: "machine", label: "Machine", placeholder: "Pullover" },
      { key: "noticed", label: "What I noticed", placeholder: "Shorter arms reach better with the seat higher." },
      { key: "setting", label: "Setting or cue", placeholder: "Seat pin 4; cue “lead with the elbows”." },
    ],
    shelf: "machines",
    vis: "Only you. You can put it on the Studio shelf, which never names a client.",
    kind: "note",
    shares: { record: false, colleagues: true, studioShelf: true },
  },
  protocol: {
    type: "protocol",
    label: "Protocol",
    fields: [
      { key: "when", label: "When", placeholder: "Before the first machine of a first session" },
      { key: "steps", label: "Steps", placeholder: "1. … 2. … 3. …" },
      { key: "why", label: "Why", placeholder: "It settles nerves and tells me where to start." },
    ],
    shelf: "protocol",
    vis: "Only you. You can put it on the Studio shelf, which never names a client.",
    kind: "note",
    shares: { record: false, colleagues: true, studioShelf: true },
  },
  research: {
    type: "research",
    label: "Research",
    fields: [
      { key: "source", label: "Source", placeholder: "An article, a course, a video" },
      { key: "claim", label: "The claim", placeholder: "What it says" },
      { key: "try", label: "What I'll try", placeholder: "What I'll try on the floor" },
    ],
    shelf: "research",
    vis: "Only you. You can share it with colleagues, or put it on the Studio shelf.",
    kind: "research",
    shares: { record: false, colleagues: true, studioShelf: true },
  },
  trend: {
    type: "trend",
    label: "Trend",
    fields: [
      { key: "think", label: "What I think", placeholder: "Clients over 80 move more smoothly on the Pullover with the range two notches shorter." },
      { key: "know", label: "How I'll know", placeholder: "8 clients over 80, each with 4 sessions set up both ways." },
      { key: "evidence", label: "Evidence so far", placeholder: "One line each time you see it." },
    ],
    shelf: "trends",
    vis: "Only you until its sample is met. Then you can write it up for the Studio shelf.",
    kind: "note",
    shares: { record: false, colleagues: false, studioShelf: false },
  },
  personal: {
    type: "personal",
    label: "Personal",
    fields: [
      { key: "what", label: "What?", placeholder: "What happened" },
      { key: "soWhat", label: "So what?", placeholder: "What it tells me about my coaching" },
      { key: "nowWhat", label: "Now what?", placeholder: "What I'll do next" },
    ],
    shelf: "personal",
    vis: "Only you. Never shared.",
    kind: "note",
    shares: { record: false, colleagues: false, studioShelf: false },
  },
};

export const SHELVES: readonly { id: ShelfId; label: string }[] = [
  { id: "clients", label: "Clients" },
  { id: "machines", label: "Machines" },
  { id: "protocol", label: "Protocol" },
  { id: "research", label: "Research" },
  { id: "trends", label: "Trends · hunches" },
  { id: "personal", label: "Personal" },
];

const TYPE_OF_SHELF: Record<ShelfId, NoteType> = {
  clients: "client",
  machines: "machine",
  protocol: "protocol",
  research: "research",
  trends: "trend",
  personal: "personal",
};

export function isNoteType(v: unknown): v is NoteType {
  return typeof v === "string" && (NOTE_TYPES as string[]).includes(v);
}

/**
 * The shelf a note sits on. A typed note, its type's; a note written before
 * the Journal, the one its kind or its client points to (a research note on
 * Research, a note about a client on Clients), or none (it is still under
 * All and in its folder).
 */
export function shelfOf(note: Pick<TrainerNote, "noteType" | "kind" | "clientIds">): ShelfId | null {
  if (note.noteType && isNoteType(note.noteType)) return NOTE_TEMPLATES[note.noteType].shelf;
  if (note.kind === "research") return "research";
  if (note.clientIds.length > 0) return "clients";
  return null;
}

export function typeOfShelf(shelf: ShelfId): NoteType {
  return TYPE_OF_SHELF[shelf];
}

/** A typed note's words in the template's order: the Trend's from its hunch. */
export function templateAnswers(n: { noteType?: NoteType | null; fields?: NoteFields | null; hunch?: Pick<Hunch, "claim" | "how"> | null }): { label: string; text: string }[] {
  if (!n.noteType || !isNoteType(n.noteType)) return [];
  const t = NOTE_TEMPLATES[n.noteType];
  if (n.noteType === "trend") {
    return [
      { label: t.fields[0].label, text: (n.hunch?.claim ?? "").trim() },
      { label: t.fields[1].label, text: (n.hunch?.how ?? "").trim() },
    ].filter((a) => a.text);
  }
  return t.fields.map((f) => ({ label: f.label, text: (n.fields?.[f.key] ?? "").trim() })).filter((a) => a.text);
}

/** The first answer, on one line: a typed note's title when none was typed. */
export function typedTitle(n: Parameters<typeof templateAnswers>[0]): string {
  const first = templateAnswers(n)[0]?.text ?? "";
  const line = first.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
}

/**
 * A typed note as one body: the answers under their labels, then anything
 * written below them. What a copy carries (onto a client's record, to a
 * colleague) and what search and the list's excerpt read. A plain note's
 * body, unchanged.
 */
export function composedBody(n: Parameters<typeof templateAnswers>[0] & { body: string }): string {
  const answers = templateAnswers(n);
  if (answers.length === 0) return n.body;
  const head = answers.map((a) => `**${a.label}**\n${a.text}`).join("\n\n");
  return n.body.trim() ? `${head}\n\n${n.body}` : head;
}

/* ------------------------------------------------------------------ *
 * Hunches
 * ------------------------------------------------------------------ */

export interface HunchState {
  have: number;
  need: number;
  unit: Hunch["unit"];
  /** The evidence meets the sample. */
  ready: boolean;
  retired: boolean;
  /** Holds a slot: neither met nor retired. */
  open: boolean;
}

export function hunchState(h: Pick<Hunch, "need" | "unit" | "evidence" | "retiredAt"> | null | undefined): HunchState | null {
  if (!h) return null;
  const have = h.evidence?.length ?? 0;
  const need = Math.max(1, Math.trunc(h.need || 1));
  const retired = typeof h.retiredAt === "number";
  const ready = have >= need;
  return { have, need, unit: h.unit, ready, retired, open: !retired && !ready };
}

/** How many of the three slots are held. */
export function openHunches(notes: readonly Pick<TrainerNote, "noteType" | "hunch">[]): number {
  return notes.filter((n) => n.noteType === "trend" && hunchState(n.hunch)?.open).length;
}

export function slotsFree(notes: readonly Pick<TrainerNote, "noteType" | "hunch">[]): number {
  return Math.max(0, HUNCH_SLOTS - openHunches(notes));
}

/** "3 of 8 clients so far · not enough data yet" · "6 of 6 sessions · ready to say" · "Retired". */
export function hunchLine(s: HunchState | null): string {
  if (!s) return "";
  if (s.retired) return `Retired · ${s.have} of ${s.need} ${s.unit} when it was`;
  if (s.ready) return `${s.have} of ${s.need} ${s.unit} · ready to say`;
  return `${s.have} of ${s.need} ${s.unit} so far · not enough data yet`;
}

/** A new piece of evidence, as it will be stored. */
export function evidenceEntry(text: string, clientId: string | null, now: number = Date.now()): HunchEvidence | null {
  const t = text.trim().slice(0, NOTE_FIELD_MAX);
  if (!t) return null;
  return { id: `e${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, at: now, text: t, clientId };
}

/* ------------------------------------------------------------------ *
 * From Firestore — defensive, so an odd document never blanks the list
 * ------------------------------------------------------------------ */

export function fieldsFromDoc(v: unknown, type: NoteType | null): NoteFields | null {
  if (!type || !v || typeof v !== "object") return type ? {} : null;
  const keys = new Set(NOTE_TEMPLATES[type].fields.map((f) => f.key));
  const out: NoteFields = {};
  for (const [k, text] of Object.entries(v as Record<string, unknown>)) {
    if (keys.has(k) && typeof text === "string") out[k] = text.slice(0, NOTE_FIELD_MAX);
  }
  return out;
}

export function hunchFromDoc(v: unknown): Hunch | null {
  if (!v || typeof v !== "object") return null;
  const h = v as Record<string, unknown>;
  const evidence: HunchEvidence[] = [];
  for (const e of Array.isArray(h.evidence) ? h.evidence : []) {
    const x = e as Partial<HunchEvidence> | null;
    if (!x || typeof x.id !== "string" || typeof x.text !== "string" || typeof x.at !== "number") continue;
    evidence.push({ id: x.id, at: x.at, text: x.text.slice(0, NOTE_FIELD_MAX), clientId: typeof x.clientId === "string" ? x.clientId : null });
  }
  evidence.sort((a, b) => a.at - b.at);
  const need = typeof h.need === "number" && Number.isFinite(h.need) ? Math.min(HUNCH_NEED_MAX, Math.max(1, Math.trunc(h.need))) : 1;
  return {
    claim: typeof h.claim === "string" ? h.claim.slice(0, HUNCH_CLAIM_MAX) : "",
    how: typeof h.how === "string" ? h.how.slice(0, HUNCH_HOW_MAX) : "",
    need,
    unit: h.unit === "sessions" ? "sessions" : "clients",
    evidence: evidence.slice(-HUNCH_EVIDENCE_MAX),
    retiredAt: typeof h.retiredAt === "number" ? h.retiredAt : null,
  };
}

/** A draft's template answers, cleaned for the write: only its type's keys, each within the limit. */
export function cleanFields(type: NoteType | null | undefined, fields: NoteFields | undefined): NoteFields {
  if (!type || type === "trend") return {};
  const out: NoteFields = {};
  for (const f of NOTE_TEMPLATES[type].fields) {
    const text = (fields?.[f.key] ?? "").slice(0, NOTE_FIELD_MAX);
    if (text.trim()) out[f.key] = text;
  }
  return out;
}

/** A draft's hunch, cleaned for the write (its evidence is written on its own). */
export function cleanHunch(h: NoteDraft["hunch"]): Pick<Hunch, "claim" | "how" | "need" | "unit"> | null {
  if (!h) return null;
  return {
    claim: h.claim.trim().slice(0, HUNCH_CLAIM_MAX),
    how: h.how.trim().slice(0, HUNCH_HOW_MAX),
    need: Math.min(HUNCH_NEED_MAX, Math.max(1, Math.trunc(Number(h.need) || 1))),
    unit: h.unit === "sessions" ? "sessions" : "clients",
  };
}

/** What a typed note still needs before it can be saved, in words. Empty when it can. */
export function typedProblems(d: Pick<NoteDraft, "noteType" | "fields" | "hunch" | "body" | "title">): string[] {
  if (!d.noteType) return [];
  if (d.noteType === "trend") {
    const out: string[] = [];
    if (!d.hunch?.claim.trim()) out.push("Say what you think you're seeing.");
    if (!d.hunch || !(Number(d.hunch.need) >= 1)) out.push("Say how many would show it.");
    return out;
  }
  const answered = Object.values(cleanFields(d.noteType, d.fields)).length > 0;
  return answered || d.body.trim() || d.title.trim() ? [] : ["Write at least one of the three lines."];
}

/* ------------------------------------------------------------------ *
 * The Studio shelf
 * ------------------------------------------------------------------ */

/** May this note go on the Studio shelf now? Machine, Protocol and Research notes, and a hunch once its sample is met. */
export function canGoOnStudioShelf(n: Pick<TrainerNote, "noteType" | "hunch">): boolean {
  if (!n.noteType || !isNoteType(n.noteType)) return false;
  if (n.noteType === "trend") return Boolean(hunchState(n.hunch)?.ready);
  return NOTE_TEMPLATES[n.noteType].shares.studioShelf;
}

/**
 * A note as a Studio-shelf entry (the Playbook's shape): the words the
 * trainer wrote, never a client. The trainer reads it before it goes.
 */
export function studioShelfDraft(n: Pick<TrainerNote, "noteType" | "fields" | "hunch" | "title" | "body">): PlaybookDraft | null {
  if (!canGoOnStudioShelf(n) || !n.noteType) return null;
  const f = n.fields ?? {};
  const cut = (s: string, max: number) => s.trim().slice(0, max);
  const title = (raw: string) => cut(n.title || raw, PLAYBOOK_TITLE_MAX);
  switch (n.noteType) {
    case "machine":
      return {
        title: title(f.machine ?? ""),
        situation: cut(f.noticed ?? "", PLAYBOOK_BODY_MAX),
        worked: cut(f.setting ?? n.body, PLAYBOOK_BODY_MAX),
        machineIds: [],
        tags: ["machine"],
      };
    case "protocol":
      return {
        title: title(f.when ?? ""),
        situation: cut([f.when, f.why].filter((x) => x?.trim()).join(". "), PLAYBOOK_BODY_MAX),
        worked: cut(f.steps ?? n.body, PLAYBOOK_BODY_MAX),
        machineIds: [],
        tags: ["protocol"],
      };
    case "research":
      return {
        title: title(f.source ?? ""),
        situation: cut(f.claim ?? "", PLAYBOOK_BODY_MAX),
        worked: cut(f.try ?? n.body, PLAYBOOK_BODY_MAX),
        machineIds: [],
        tags: ["research"],
      };
    case "trend": {
      const s = hunchState(n.hunch);
      return {
        title: title(n.hunch?.claim ?? ""),
        situation: cut(`${n.hunch?.how ?? ""}${s ? ` Seen in ${s.have} of ${s.need} ${s.unit}.` : ""}`, PLAYBOOK_BODY_MAX),
        worked: cut(n.hunch?.claim ?? "", PLAYBOOK_BODY_MAX),
        machineIds: [],
        tags: ["trend"],
      };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * On this day
 * ------------------------------------------------------------------ */

/** The day a month ago and a year ago, as studio day keys (a 31st with no match falls on the month's last day). */
export function onThisDayKeys(todayKey: string): { monthAgo: string; yearAgo: string } {
  const [y, m, d] = todayKey.split("-").map(Number);
  const back = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  };
  const monthAgo = m === 1 ? back(y - 1, 12) : back(y, m - 1);
  const yearAgo = back(y - 1, m);
  return { monthAgo, yearAgo };
}

/** "a month ago" / "a year ago" for a day key, or null when it is neither. */
export function onThisDayLabel(dayKey: string, todayKey: string): string | null {
  const { monthAgo, yearAgo } = onThisDayKeys(todayKey);
  if (dayKey === monthAgo) return "A month ago";
  if (dayKey === yearAgo) return "A year ago";
  return null;
}

/** The last seven days' keys, newest first (the Day logs shelf's recent week, for the list's grouping). */
export function lastWeekKeys(todayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(todayKey, -i));
}
