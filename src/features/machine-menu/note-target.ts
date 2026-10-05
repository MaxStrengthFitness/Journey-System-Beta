/**
 * THE MACHINE MENU — where a note written on the card goes.
 *
 * The note box on the card writes one of two things, by a switch under the
 * words, About: [ {client} | The machine itself ]:
 *
 *   - A note about the CLIENT on this machine (the default): a journal entry
 *     carrying the machine, filed through the notes catalog's one answer
 *     (`storedNoteOf`), starting as Coaching & equipment · Set-up at the
 *     category's own starting loudness (`DEFAULT_IMPORTANCE`). A loudness
 *     picked by hand sticks if the filing changes afterwards.
 *   - A note about THE MACHINE ITSELF: the studio's floor notes for this
 *     unit (features/floor-notes), which everyone at the studio sees here
 *     and on the Catalog. AJ, Oct 4 2026: a fault with the machine becomes a
 *     floor note, never a Relay flag, so this card never rings a bell. A
 *     floor note never lands on the client's record or chart.
 *
 * Flipping the switch keeps the words already typed.
 *
 * IN A SESSION the box is the session's ONE note draft, which the tracker
 * owns (`client-notes/session-draft.ts`): every keystroke goes to it with
 * this machine's id and "about the machine" on, so the Wrap-up's unsaved-note
 * check, the new-version typing check and the session's note sidebar all see
 * it. A draft already holding words about another machine is shown as it is,
 * with "Make it about {machine}" — one draft per session, never two. The
 * floor switch rides on the draft as `toFloor` (sessionStorage only, read
 * defensively: anything but `true` is a client note).
 *
 * ON THE PROFILE the box keeps its own draft of the same shape.
 *
 * PURE — no React, no Firestore.
 */
import type { JournalEntry, JournalImportance, JournalKind, JournalOrigin, NoteBodyMark } from "../../types/journal";
import {
  DEFAULT_IMPORTANCE,
  JOURNAL_BODY_LIMIT,
  NOTE_CATEGORY_META,
  asksBodyPart,
  flavourFor,
  flavourLabel,
  flavourShort,
  isForLeaders,
  storedNoteOf,
  type FilingCategory,
  type NoteCategory,
  type NoteFlavour,
} from "../client-notes/note-catalog";
import { EMPTY_SESSION_DRAFT, hasDraftText, type SessionNoteDraft } from "../client-notes/session-draft";
import type { Door } from "./doors";

export type NoteTarget = "client" | "floor";

/**
 * The note box's draft: the session's draft shape, floor switch included
 * (`toFloor` is optional on `SessionNoteDraft` and only ever `true` for a
 * floor note).
 */
export type MenuNoteDraft = SessionNoteDraft;

/** A note about the client on a machine starts filed as Coaching & equipment · Set-up. */
export const DEFAULT_FILING: { category: FilingCategory; flavour: NoteFlavour } = { category: "coaching", flavour: "Setup" };

/* ------------------------------------------------------------------ *
 * Filing
 * ------------------------------------------------------------------ */

export interface FilingChip {
  id: string;
  label: string;
  category: FilingCategory;
  flavour: NoteFlavour | null;
}

/** "Filed as … Change" opens these: Set-up · Posture · Path · Pace · Purpose · Health · Incident · Preference. */
export const FILING_CHIPS: readonly FilingChip[] = [
  { id: "setup", label: "Set-up", category: "coaching", flavour: "Setup" },
  { id: "posture", label: "Posture", category: "coaching", flavour: "Posture" },
  { id: "path", label: "Path", category: "coaching", flavour: "Path" },
  { id: "pace", label: "Pace", category: "coaching", flavour: "Pace" },
  { id: "purpose", label: "Purpose", category: "coaching", flavour: "Purpose" },
  { id: "health", label: "Health", category: "health", flavour: null },
  { id: "incident", label: "Incident", category: "incident", flavour: null },
  { id: "preference", label: "Preference", category: "preference", flavour: null },
];

/** The chip a filing shows as picked, or null (a filing the chips don't offer, e.g. Health · Surgery picked elsewhere). */
export function chipOf(category: NoteCategory | null, flavour: NoteFlavour | null): FilingChip | null {
  if (!category) return null;
  const f = flavourFor(category, flavour);
  return FILING_CHIPS.find((c) => c.category === category && (c.flavour === f || (c.flavour === null && category !== "coaching"))) ?? null;
}

/** "Coaching & equipment · Set-up", "Health · Injury or pain", "Incident". */
export function filedAsWords(category: NoteCategory | null, flavour: NoteFlavour | null): string {
  if (!category) return "Not filed yet";
  const f = flavourFor(category, flavour);
  const label = NOTE_CATEGORY_META[category].label;
  const second = f ? (category === "coaching" ? flavourShort(f) : flavourLabel(f)) : null;
  return second ? `${label} · ${second}` : label;
}

/** How loud a note of this category starts (Coaching and Preference at Note, Health and Incident at Heads up). */
export function startingLoudness(category: NoteCategory | null): JournalImportance {
  if (!category || category === "ford" || category === "admin") return "standard";
  return DEFAULT_IMPORTANCE[category];
}

/** The loudness after the filing changes: one picked by hand sticks; otherwise the new category's start. */
export function loudnessAfterFiling(current: JournalImportance, pickedByHand: boolean, next: NoteCategory | null): JournalImportance {
  return pickedByHand ? current : startingLoudness(next);
}

/** Health and Incident reach the studio's leaders, whatever their loudness. */
export function reachesLeaders(category: NoteCategory | null): boolean {
  return !!category && isForLeaders(category);
}

export const LEADERS_LINE = "Reaches the studio's leaders on Operations → Today";

/** The filing asks where on the body (the notes catalog's one rule: Health and Incident). */
export function asksWhereOnBody(category: NoteCategory | null): boolean {
  return asksBodyPart(category);
}

/** File the draft. A loudness picked by hand sticks; body parts stay only where the filing asks for them. */
export function fileDraft(draft: MenuNoteDraft, chip: Pick<FilingChip, "category" | "flavour">, pickedByHand: boolean): MenuNoteDraft {
  return {
    ...draft,
    category: chip.category,
    flavour: flavourFor(chip.category, chip.flavour),
    importance: loudnessAfterFiling(draft.importance, pickedByHand, chip.category),
    bodyParts: asksBodyPart(chip.category) ? draft.bodyParts : [],
  };
}

/* ------------------------------------------------------------------ *
 * The draft and this machine
 * ------------------------------------------------------------------ */

/** Whose words the draft holds, from this machine's point of view. */
export type DraftOwner =
  /** No words yet: the box is this machine's. */
  | "empty"
  /** Words about this machine. */
  | "this"
  /** Words about another machine: shown as they are, with "Make it about {machine}". */
  | "other"
  /** Words about no machine (started in the session's note sidebar). */
  | "general";

export function draftOwnerOf(draft: MenuNoteDraft | null | undefined, machineId: string): DraftOwner {
  if (!draft || !hasDraftText(draft)) return "empty";
  if (!draft.aboutMachine || !draft.machineId) return "general";
  return draft.machineId === machineId ? "this" : "other";
}

/**
 * The menu's defaults on a draft with no words yet: this machine, about the
 * machine, and — when nothing was filed — Coaching & equipment · Set-up at
 * its starting loudness. A filing or a floor switch picked before the first
 * word is kept.
 */
export function withMenuDefaults(draft: MenuNoteDraft | null | undefined, machineId: string): MenuNoteDraft {
  const base: MenuNoteDraft = { ...EMPTY_SESSION_DRAFT, ...(draft ?? {}) };
  if (hasDraftText(base)) return base;
  const filed = base.category !== null;
  return {
    ...base,
    machineId,
    aboutMachine: true,
    category: filed ? base.category : DEFAULT_FILING.category,
    flavour: filed ? base.flavour : DEFAULT_FILING.flavour,
    importance: filed ? base.importance : startingLoudness(DEFAULT_FILING.category),
  };
}

/**
 * A keystroke. Into an empty draft it starts this machine's note (the
 * menu's defaults); into a draft that already has words it only changes the
 * words — a draft about another machine stays that machine's until the
 * trainer taps "Make it about {machine}".
 */
export function typeInto(draft: MenuNoteDraft | null | undefined, machineId: string, body: string): MenuNoteDraft {
  const base = draft && hasDraftText(draft) ? draft : withMenuDefaults(draft, machineId);
  return { ...base, body };
}

/** "Make it about Leg Press": the words kept, the machine changed. */
export function makeItAbout(draft: MenuNoteDraft, machineId: string): MenuNoteDraft {
  return { ...draft, machineId, aboutMachine: true };
}

/** The switch: the words kept, the target changed. */
export function setTarget(draft: MenuNoteDraft, target: NoteTarget): MenuNoteDraft {
  const { toFloor: _drop, ...rest } = draft;
  return target === "floor" ? { ...rest, toFloor: true } : rest;
}

/** Read defensively: anything but `true` is a note about the client. */
export function targetOf(draft: Pick<MenuNoteDraft, "toFloor"> | null | undefined): NoteTarget {
  return draft?.toFloor === true ? "floor" : "client";
}

/** Filing and loudness show only for a note about the client. */
export function showsFiling(target: NoteTarget): boolean {
  return target === "client";
}

/* ------------------------------------------------------------------ *
 * What is written
 * ------------------------------------------------------------------ */

export interface ClientNoteWrite {
  body: string;
  kind: JournalKind;
  category: JournalEntry["category"];
  bodyParts: NoteBodyMark[] | null;
  importance: JournalImportance;
}

/** The client note a draft writes (through `addMachineNote`), or null with no words or a floor target. */
export function clientNoteOf(draft: MenuNoteDraft | null | undefined): ClientNoteWrite | null {
  if (!draft || !hasDraftText(draft) || targetOf(draft) !== "client") return null;
  return { body: draft.body.trim(), ...storedNoteOf(draft.category, draft.flavour, draft.bodyParts), importance: draft.importance };
}

/** The floor note a draft writes (through `addFloorNote`), or null with no words or a client target. */
export function floorNoteOf(draft: MenuNoteDraft | null | undefined): { body: string } | null {
  if (!draft || !hasDraftText(draft) || targetOf(draft) !== "floor") return null;
  return { body: draft.body.trim() };
}

/**
 * A client note's words as `addMachineNote` may send them: it writes
 * "{machine} — {words}", and the journal's rule refuses a body over
 * `JOURNAL_BODY_LIMIT`, so the words are cut to leave room for the name.
 * Without the cut a long note offline is "saved on this iPad", then refused
 * by the database later, after its words were cleared.
 */
export function machineNoteBody(body: string, machineName: string): string {
  const room = Math.max(0, JOURNAL_BODY_LIMIT - ((machineName ?? "").length + 3));
  return (body ?? "").slice(0, room);
}

/** Where a client note says it was written: in a session, or on the profile. */
export function noteOrigin(door: Door): JournalOrigin {
  return door === "session" ? "in_session" : "profile";
}

/**
 * After a settings save for pain or discomfort, "Add a Health note" opens
 * the box filed as Health · Injury or pain at Heads up, with the change
 * already typed ("Seat 4 → 5 for pain or discomfort."). Nothing is required.
 * Null when the box already holds words: they are never replaced (one draft
 * per session), and the box opens as it is.
 */
export function healthNoteAfterPain(draft: MenuNoteDraft | null | undefined, machineId: string, changeWords: string): MenuNoteDraft | null {
  if (draft && hasDraftText(draft)) return null;
  const { toFloor: _client, ...base } = withMenuDefaults(draft, machineId);
  return {
    ...base,
    body: `${changeWords} for pain or discomfort.`,
    category: "health",
    flavour: "Injury",
    importance: startingLoudness("health"),
  };
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

const possessive = (studioName: string | null | undefined): string => {
  const n = (studioName ?? "").trim();
  return n ? `${n}'s` : "the studio's";
};

const clean = (s: string | null | undefined): string => (s ?? "").trim();

/** The one-line box: "Note about Avery on Leg Press…". */
export function composerPlaceholder(clientFirstName: string, machineName: string): string {
  return `Note about ${clean(clientFirstName) || "the client"} on ${clean(machineName) || "this machine"}…`;
}

/** The open box's title over a note about the client: "Note about Avery on Leg Press". */
export function composerTitle(clientFirstName: string, machineName: string): string {
  return composerPlaceholder(clientFirstName, machineName).replace(/…$/, "");
}

/** The switch's two sides. */
export function aboutChoices(clientFirstName: string): [string, string] {
  return [clean(clientFirstName) || "The client", "The machine itself"];
}

/** A floor note's title: "Westlake's notes on Leg Press · everyone at Westlake sees it". */
export function floorTitle(studioName: string | null | undefined, machineName: string): string {
  const who = clean(studioName);
  return `${who ? `${who}'s` : "The studio's"} notes on ${clean(machineName)} · everyone at ${who || "the studio"} sees it`;
}

/** The send button: "Add note", or "Add to Westlake's notes". */
export function addButtonLabel(target: NoteTarget, studioName?: string | null): string {
  return target === "floor" ? `Add to ${possessive(studioName)} notes` : "Add note";
}

/** After a floor note: "On Westlake's notes for Leg Press. Everyone at Westlake sees it here and on the Catalog." */
export function floorConfirmation(studioName: string | null | undefined, machineName: string): string {
  const who = clean(studioName);
  return `On ${possessive(who)} notes for ${clean(machineName)}. Everyone at ${who || "the studio"} sees it here and on the Catalog.`;
}

/** What became of a note: the line under it. */
export const NOTE_SAVE_WORDS = {
  saved: "Saved",
  queued: "Saved on this iPad · sends when online",
  failed: "Couldn't save. Your words are still here · Try again",
} as const;

/**
 * The line under a note as the box draws it, its "Try again" a button of
 * its own (the words stay in the box, so tapping it sends them again).
 */
export function noteSaveLine(kind: keyof typeof NOTE_SAVE_WORDS): { text: string; retry: boolean } {
  const words: string = NOTE_SAVE_WORDS[kind];
  return kind === "failed" ? { text: words.replace(/ · Try again$/, ""), retry: true } : { text: words, retry: false };
}

/**
 * A note the card said was saved on this iPad that the database refused
 * later, once the card had closed: the app's toast says it, since the box
 * that held the words is gone.
 */
export function noteRefusedLaterWords(target: NoteTarget, studioName: string | null | undefined, machineName: string): string {
  const machine = clean(machineName) || "this machine";
  return target === "floor"
    ? `A note for ${possessive(studioName)} notes on ${machine} couldn't be saved. Write it again from the machine's card.`
    : `A note on ${machine} couldn't be saved. Write it again from the machine's card.`;
}

/**
 * The session's note sidebar holding a draft the card filed for the studio's
 * floor notes: it shows the words read only and says where they go, and
 * where they are finished. Its composer saves to the client's journal and
 * has no floor switch, so it never takes the words.
 */
export function floorDraftElsewhereWords(
  studioName: string | null | undefined,
  machineName: string | null | undefined,
  clientFirstName: string,
): { title: string; foot: string; button: string } {
  const machine = clean(machineName) || "the machine";
  const who = clean(clientFirstName) || "the client";
  return {
    title: `For ${possessive(studioName)} notes on ${machine}`,
    foot: `Add them, or make them about ${who}, on the machine's card. They are never filed to ${who}'s journal from here.`,
    button: `Open ${machine}`,
  };
}

/** The same, for an update to a note's thread. */
export function updateRefusedLaterWords(machineName: string): string {
  return `An update to a note on ${clean(machineName) || "this machine"} couldn't be saved. Write it again from the machine's card.`;
}

/** A floor note saved on this iPad, the database not yet answered. */
export function floorQueuedWords(studioName: string | null | undefined, machineName: string): string {
  return `${floorConfirmation(studioName, machineName)} Saved on this iPad · sends when online.`;
}

/** What the list and a note's thread say (machine menu design §C, "The list"). */
export const THREAD_WORDS = {
  none: "No notes on this machine yet.",
  /** No notes, and the only journal entries on the machine were settings saves' copies (the rail counts those). */
  noneButCopies: "No notes on this machine yet. Its setting saves are under Setting changes.",
  loading: "Loading notes…",
  fewer: "Fewer notes",
  standing: "Standing context",
  open: "Open",
  resolved: "Resolved",
  earlier: "Earlier notes",
  noUpdates: "No updates yet.",
  addUpdate: "Add update",
  updatePlaceholder: "What happened since?",
  saveUpdate: "Save update",
  more: "More",
  close: "Close it",
  reopen: "Reopen",
  hush: "No need to remind me",
  hushed: "Off your next briefing. Only you can see that.",
  off: "Take it off the list",
  offDone: "Taken off the list",
  undo: "Undo",
  updateFailed: "Couldn't save the update. Your words are still here",
  actionFailed: "Couldn't change that note just now",
  notAboutMachine: "Not about any machine yet",
} as const;

/** "All notes (3)". */
export function allNotesLabel(count: number): string {
  return `All notes (${count})`;
}

/** "Resolved (2)", the folded zone. */
export function resolvedLabel(count: number): string {
  return `Resolved (${count})`;
}

/** "About Chest Press", over a draft about another machine. */
export function aboutWords(machineName: string): string {
  return `About ${clean(machineName)}`;
}

/** "Make it about Leg Press". */
export function makeItAboutWords(machineName: string): string {
  return `Make it about ${clean(machineName)}`;
}

/** The button after a save for pain or discomfort. */
export const HEALTH_NOTE_BUTTON = "Add a Health note";

/* ------------------------------------------------------------------ *
 * The Wrap-up's carried draft
 * ------------------------------------------------------------------ */

/**
 * A session draft left unsent at Finish that was for the studio's floor
 * notes: the machine it goes on, or null. Null for a note about the client,
 * and for a floor draft with no machine (it can't go on a machine's list, so
 * it is filed as a note about the client instead: nothing a trainer wrote is
 * lost). `toFloor` is read defensively, as everywhere.
 */
export function floorCarryOf(draft: MenuNoteDraft | null | undefined): { machineId: string } | null {
  if (!draft || !hasDraftText(draft) || targetOf(draft) !== "floor") return null;
  const machineId = clean(draft.machineId);
  return machineId ? { machineId } : null;
}

/**
 * The Wrap-up's card for a carried floor draft: what it says, its button,
 * and what happens if it is left there.
 */
export function carriedFloorWords(
  studioName: string | null | undefined,
  machineName: string | null | undefined,
): { title: string; button: string; foot: string } {
  const machine = clean(machineName) || "this machine";
  return {
    title: `You started a note for ${possessive(studioName)} notes on ${machine} and didn't add it`,
    button: addButtonLabel("floor", studioName),
    foot: `Left as it is, it is added to ${possessive(studioName)} notes when you leave. Nothing you wrote is lost.`,
  };
}

/** What the app's leave question names on the profile: "Leg Press note for Avery". */
export function unsavedNoteLabel(machineName: string, clientFirstName: string): string {
  const who = clean(clientFirstName);
  return `${clean(machineName) || "Machine"} note${who ? ` for ${who}` : ""}`;
}
