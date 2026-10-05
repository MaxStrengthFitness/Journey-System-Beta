/**
 * THE MACHINE MENU — a change to the settings, before and after Save.
 *
 * The tiles edit a DRAFT; nothing is written until Save (never on blur,
 * Close, a backdrop tap or Escape). This file is the draft's whole life:
 *
 *   - THE SEED. The draft opens as the saved settings, with one exception
 *     kept from today's Settings card: a FIXED dial — one that is the same
 *     for every client on the machine (`ABSOLUTE_STANDARDS` in
 *     equipment/adapters.ts, today the gap) — opens already filled with the
 *     machine's own value (`absoluteValueFor`) when nothing is saved for it,
 *     "Same for every client", and saves with the next save. Everything else
 *     empty stays empty: the studio standard is a "Use 6" button, never a
 *     value nobody chose.
 *   - DIRTY is measured against that seed, so opening the card never sets
 *     off the unsaved-changes question.
 *   - WHAT A SAVE WRITES is the draft against what is SAVED (a seeded fixed
 *     dial included), in `saveSettings`' own terms: "" is no value, and
 *     trailing spaces are not a change.
 *   - THE WORDS: "Seat 4 → 5 · Back pad 3 → 2" on the change strip, a first
 *     set-up "Seat — → 4"; "Save Seat 5", "Save 2 changes", "Save set-up";
 *     "Seat 5 saved · Undo".
 *   - THE REASON is asked, never required (docs/ARCHITECTURE.md §1.11, "never
 *     block a save"). With none picked `saveSettings` writes its own default.
 *     A first set-up asks no reason at all.
 *   - UNDO writes the old values back through the same path, with the reason
 *     "Undone" and no second journal copy, so the setting changes list both
 *     rows honestly while the chart and "Last changed" net them out
 *     (setting-history.ts).
 *
 * PURE — no React, no Firestore.
 */
import { absoluteValueFor } from "../equipment/adapters";
import type { SettingSource } from "../machine-fit/types";
import { UNDO_REASON, type SettingPair } from "./setting-history";

/** A dial as the draft needs it. `SettingFieldSpec` (equipment/types.ts) fits. */
export interface DraftField {
  /** The storage key. */
  key: string;
  label: string;
  /** The studio standard: what Use fills, and what a fixed dial falls back from. */
  ghost?: string | null;
}

export type Values = Readonly<Record<string, string | undefined>>;

/**
 * The reasons a trainer can give with one tap (AJ, Oct 4 2026, "ill take all
 * your recommended"). Rename them here. "Other…" opens a one-line field.
 */
export const REASON_CHIPS = [
  "Comfort or fit",
  "Range of motion",
  "Alignment",
  "Pain or discomfort",
  "Matches the guide",
  "Other…",
] as const;

export type ReasonChip = (typeof REASON_CHIPS)[number];

export const OTHER_REASON: ReasonChip = "Other…";
/** After a save for this reason, the strip offers "Add a Health note". */
export const PAIN_REASON: ReasonChip = "Pain or discomfort";

/** How long "Seat 5 saved · Undo" keeps its Undo. */
export const UNDO_MS = 10_000;

const clean = (v: unknown): string => (v === undefined || v === null ? "" : String(v).trim());

/* ------------------------------------------------------------------ *
 * The seed, and dirty
 * ------------------------------------------------------------------ */

/** The value a fixed dial fills itself with, or undefined for a dial that isn't fixed. */
export function fixedValueOf(field: DraftField): string | undefined {
  return absoluteValueFor(field.key, field.label, field.ghost ?? null);
}

/** A dial that is the same for every client on the machine ("Same for every client"). */
export function isFixedDial(field: DraftField): boolean {
  return fixedValueOf(field) !== undefined;
}

/**
 * Nothing is saved on the machine for this client: the next save is the
 * first set-up (today's `!machine.isConfigured`). A value under a key the
 * field list no longer shows still counts — the machine was set up.
 */
export function isFirstSetup(saved: Values): boolean {
  return !Object.values(saved).some((v) => clean(v) !== "");
}

/**
 * The draft the card opens with: the saved values, and a fixed dial with
 * nothing saved already filled with the machine's own value. Every other
 * empty dial stays empty.
 */
export function seedDraft(fields: readonly DraftField[], saved: Values): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const f of fields) {
    const v = clean(saved[f.key]);
    draft[f.key] = v !== "" ? v : fixedValueOf(f) ?? "";
  }
  return draft;
}

/** The draft differs from what the card opened with. Opening the card is never dirty. */
export function isDraftDirty(fields: readonly DraftField[], draft: Values, saved: Values): boolean {
  const seed = seedDraft(fields, saved);
  return fields.some((f) => clean(draft[f.key]) !== clean(seed[f.key]));
}

/** The dials whose tile differs from what the card opened with (drawn live, with "was 4" under them). */
export function changedKeys(fields: readonly DraftField[], draft: Values, saved: Values): string[] {
  const seed = seedDraft(fields, saved);
  return fields.filter((f) => clean(draft[f.key]) !== clean(seed[f.key])).map((f) => f.key);
}

/* ------------------------------------------------------------------ *
 * A tile, at rest and changed
 * ------------------------------------------------------------------ */

export type TileState =
  /** "Not set", with Use {standard} and "Studio standard {standard}" when there is one. No ±. */
  | { kind: "empty"; standard: string | null; was: string | null }
  | {
      kind: "value";
      value: string;
      /** Same for every client: "Same for every client" under the value. */
      fixed: boolean;
      /** "was 4" (or "was not set") while the tile differs from what the card opened with. */
      was: string | null;
    };

/** What a tile shows for its dial. */
export function tileState(field: DraftField, draft: Values, saved: Values): TileState {
  const seed = seedDraft([field], saved)[field.key] ?? "";
  const value = clean(draft[field.key]);
  const was = value !== seed ? (seed === "" ? "not set" : seed) : null;
  if (value === "") return { kind: "empty", standard: clean(field.ghost) || null, was };
  return { kind: "value", value, fixed: isFixedDial(field), was };
}

/** "was 4", "was not set". */
export function wasWords(state: TileState): string | null {
  return state.was === null ? null : `was ${state.was}`;
}

/* ------------------------------------------------------------------ *
 * What a save writes, and its words
 * ------------------------------------------------------------------ */

/**
 * What a save would write: each dial whose draft differs from what is SAVED
 * (a seeded fixed dial included), in field order. `saveSettings`' diff, in
 * the history's own pair shape.
 */
export function draftChanges(fields: readonly DraftField[], saved: Values, draft: Values): SettingPair[] {
  const out: SettingPair[] = [];
  for (const f of fields) {
    const from = clean(saved[f.key]);
    const to = clean(draft[f.key]);
    if (from !== to) out.push({ label: f.label, from, to });
  }
  return out;
}

/** The change strip's line 1: "Seat 4 → 5 · Back pad 3 → 2"; a first set-up "Seat — → 4". */
export function changeWords(changes: readonly SettingPair[]): string {
  return changes.map((c) => `${c.label} ${c.from || "—"} → ${c.to || "—"}`).join(" · ");
}

/** What the change is called on its button and its confirmation: "Seat 5", "2 changes", "set-up". */
function changeName(changes: readonly SettingPair[], firstSetup: boolean): string {
  if (firstSetup) return "set-up";
  if (changes.length === 1) return changes[0].to ? `${changes[0].label} ${changes[0].to}` : "1 change";
  return `${changes.length} changes`;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The Save button: "Save Seat 5", "Save 2 changes", "Save set-up". */
export function saveLabel(changes: readonly SettingPair[], firstSetup: boolean): string {
  return `Save ${changeName(changes, firstSetup)}`;
}

/** A first set-up asks no "Why?": it isn't a change from anything. */
export function asksWhy(firstSetup: boolean): boolean {
  return !firstSetup;
}

/** Line 1's quiet ask, after the change. */
export const WHY_PROMPT = "Why? (optional)";

/**
 * The reason a save carries: the chip's words, or what was typed for
 * "Other…". "" when none was given — `saveSettings` then writes its own
 * default ("Settings update" / "Initial setup"), as today. Never required.
 */
export function reasonOf(chip: ReasonChip | null | undefined, otherText?: string | null): string {
  if (!chip) return "";
  if (chip === OTHER_REASON) return clean(otherText);
  return chip;
}

/** A save for pain or discomfort offers one more button: Add a Health note. */
export function offersHealthNote(reason: string | null | undefined): boolean {
  return clean(reason) === PAIN_REASON;
}

export type SaveOutcome = "saved" | "queued" | "failed";

/**
 * What the strip turns into after Save: "Seat 5 saved · Undo", "Seat 5
 * saved on this iPad · it sends when the Wi-Fi is back · Undo", or "Couldn't
 * save Seat 5 · Try again" (the draft is kept). `withAction: false` leaves
 * the last part off, for a strip that draws Undo or Try again as a button of
 * its own (and drops Undo once its ten seconds are up).
 */
export function saveOutcomeWords(
  changes: readonly SettingPair[],
  firstSetup: boolean,
  outcome: SaveOutcome,
  withAction = true,
): string {
  const name = changeName(changes, firstSetup);
  switch (outcome) {
    case "saved":
      return `${capitalise(name)} saved${withAction ? " · Undo" : ""}`;
    case "queued":
      return `${capitalise(name)} saved on this iPad · it sends when the Wi-Fi is back${withAction ? " · Undo" : ""}`;
    case "failed":
      return `Couldn't save ${name}${withAction ? " · Try again" : ""}`;
  }
}

/**
 * What the strip says once Undo has been tapped: "Seat back to 4" (or "back
 * to not set"), "2 changes undone", "Set-up undone"; the same "on this iPad"
 * tail as a save; "Couldn't undo Seat 5" with Try again beside it.
 */
export function undoOutcomeWords(changes: readonly SettingPair[], firstSetup: boolean, outcome: SaveOutcome): string {
  const what = firstSetup
    ? "Set-up undone"
    : changes.length === 1
      ? `${changes[0].label} back to ${changes[0].from || "not set"}`
      : `${changes.length} changes undone`;
  switch (outcome) {
    case "saved":
      return what;
    case "queued":
      return `${what} on this iPad · it sends when the Wi-Fi is back`;
    case "failed":
      return `Couldn't undo ${changeName(changes, firstSetup)}`;
  }
}

/**
 * Where each CHANGED value came from, for machine fit: "suggested" while a
 * value Use put there is still the draft's (it stays out of other clients'
 * evidence until this client has performed with it). `used` is dial key →
 * the value Use filled.
 */
export function suggestedSources(used: Readonly<Record<string, string>>, draft: Values): Record<string, SettingSource> {
  const out: Record<string, SettingSource> = {};
  for (const [k, v] of Object.entries(used)) if (clean(draft[k]) === clean(v) && clean(v) !== "") out[k] = "suggested";
  return out;
}

/* ------------------------------------------------------------------ *
 * Undo
 * ------------------------------------------------------------------ */

export interface UndoPayload {
  /** What is saved now (the save just made), whole, as `saveSettings`' `saved`. */
  saved: Record<string, string>;
  /** The same map with the changed dials put back, as `saveSettings`' `draft`. */
  draft: Record<string, string>;
  reason: typeof UNDO_REASON;
  isInitialSetup: false;
  /** No second journal copy: the copy of the save stands, and the history row says "Undone". */
  fileNote: false;
}

/**
 * Undo's write: the dials the save changed, back to their old values,
 * through the same path. `before` is the settings map as it was saved
 * before the save; `after` the whole map the save wrote. `saved` keeps every
 * key `after` holds — `saveSettings` writes the map whole and keeps a key
 * the field list doesn't show only if it is in `saved` — and only the
 * changed dials differ between `saved` and `draft`, so a dial nobody touched
 * is never written.
 */
export function undoPayload(fields: readonly DraftField[], before: Values, after: Values): UndoPayload {
  const saved: Record<string, string> = {};
  for (const [k, v] of Object.entries(after)) if (clean(v) !== "") saved[k] = clean(v);
  const draft: Record<string, string> = { ...saved };
  for (const f of fields) {
    const was = clean(before[f.key]);
    if (was !== clean(after[f.key])) draft[f.key] = was;
  }
  return { saved, draft, reason: UNDO_REASON, isInitialSetup: false, fileNote: false };
}

/* ------------------------------------------------------------------ *
 * The unsaved-changes label
 * ------------------------------------------------------------------ */

/** What the app's leave question names: "Leg Press settings for Avery". */
export function unsavedSettingsLabel(machineName: string, clientFirstName: string): string {
  const who = clean(clientFirstName);
  return `${clean(machineName) || "Machine"} settings${who ? ` for ${who}` : ""}`;
}
