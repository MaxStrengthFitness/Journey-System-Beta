/**
 * THE MACHINE MENU — a client's setting changes on one machine, read once.
 *
 * `machines/{id}/settingHistory` is the audit trail every settings save
 * writes (equipment/mutations.ts `saveSettings`, machine-fit/setup-save.ts).
 * The menu reads it ONCE when it opens (one `getDocs`, replacing the old
 * Change history card's live listener) and three places share the read:
 *
 *   - the chart's Set-up lane: where a change falls between two sessions,
 *     netted, so a Save followed by its Undo draws nothing;
 *   - the Settings heading's "Last changed Aug 18 · Back pad 3 → 2";
 *   - the Setting changes list, which lists every row honestly, Undo too.
 *
 * WHAT A ROW LOOKS LIKE (the writers above, unchanged for years):
 *   changeType  INITIAL_SETUP | SETTINGS | WEIGHT (and an old MASS_APPLY)
 *   oldValue    "Seat: 4, Back pad: 3"      ("—" for a dial with no value)
 *   newValue    "Seat: 5, Back pad: 2"
 *   reason      what the trainer typed, else "Settings update" / "Initial setup"
 *   timestamp   device time, ISO
 * A WEIGHT row is "Start: 84, Current: 92" → "Start: 80, Current: 92" from
 * the retired Prescription card and from Setup's "Correct the starting
 * weight" (machine-fit/setup-plan.ts `weightRowOf`, Q3 (a)), or "Current:
 * 92" → "Current: 94" from a load saved on Setup. Only a
 * row that moves the STARTING weight is kept: the progress figure counts from
 * it (AJ, Oct 4 2026, Q2 (a)). One that moves only today's weight is left
 * out; the Now Bar and the Wrap-up set that weight every session.
 *
 * PURE — no React, no Firestore. A row's day is the studio's Eastern day.
 */
import { studioDayKeyOf } from "../../lib/studio-time";
import { formatShortDate } from "../journey-grid/stats";

/** A history document as Firestore hands it over. Every field may be missing on an old row. */
export interface SettingHistoryDoc {
  id?: string;
  clientId?: string;
  timestamp?: unknown;
  trainerId?: string;
  trainerName?: string;
  changeType?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
}

/** One dial's move, as the row wrote it. An empty value ("—" on the row) is "". */
export interface SettingPair {
  label: string;
  from: string;
  to: string;
}

export type SettingRowKind = "setup" | "settings" | "start-weight";

export interface SettingRow {
  id: string;
  kind: SettingRowKind;
  /** As written: INITIAL_SETUP, SETTINGS, WEIGHT, MASS_APPLY. */
  changeType: string;
  /** Device time of the save, in ms; null on an early row that predates `timestamp`. */
  at: number | null;
  /** The studio day of `at`. */
  day: string | null;
  /** The dials it moved, in the row's order. Empty when the row's words couldn't be read. */
  pairs: SettingPair[];
  /** The reason exactly as stored (the defaults included) — the settings copy is rebuilt from it. */
  reason: string;
  trainerName: string | null;
  /** Written by the menu's Undo (reason "Undone"). */
  isUndo: boolean;
  /** The row's own words, for the list when `pairs` couldn't be read. */
  oldValue: string;
  newValue: string;
}

/** What the menu's Undo writes as the reason (phase 2's `saveSettings` Undo). */
export const UNDO_REASON = "Undone";

/** The reasons `saveSettings` writes when none was typed: not a reason a trainer gave. */
const DEFAULT_REASONS = new Set(["settings update", "initial setup", "weight update"]);

/** "—" is what the writers put for a dial with no value (`c.from || "—"`). */
const EMPTY_MARKS = new Set(["—", ""]);

const cleanValue = (v: string): string => {
  const t = v.trim();
  return EMPTY_MARKS.has(t) ? "" : t;
};

/** A label compared without case, spacing or punctuation ("Back Pad" is "back-pad"). */
export function labelKey(label: string): string {
  return (label ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * "Seat: 4, Back pad: 3" → [["Seat","4"],["Back pad","3"]]. Splits only at a
 * ", " that is followed by another "Label: ", so a value holding a comma
 * stays whole. Null when any part has no ": " — a row whose words can't be
 * read is never guessed at.
 */
function parseList(text: string): [string, string][] | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const parts = t.split(/, (?=[^,:]+: )/);
  const out: [string, string][] = [];
  for (const part of parts) {
    const i = part.indexOf(": ");
    if (i <= 0) return null;
    out.push([part.slice(0, i).trim(), part.slice(i + 2)]);
  }
  return out;
}

/**
 * The dials a row moved, old against new. The writers build both lists from
 * one change list, so the labels line up one for one; when they don't, the
 * row is unreadable (null), never paired by guesswork.
 */
export function parseSettingPairs(oldValue: string | undefined, newValue: string | undefined): SettingPair[] | null {
  const before = parseList(oldValue ?? "");
  const after = parseList(newValue ?? "");
  if (!before || !after || before.length !== after.length) return null;
  const out: SettingPair[] = [];
  for (let i = 0; i < before.length; i++) {
    if (labelKey(before[i][0]) !== labelKey(after[i][0])) return null;
    out.push({ label: after[i][0], from: cleanValue(before[i][1]), to: cleanValue(after[i][1]) });
  }
  return out;
}

function millisOf(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const o = v as { toMillis?: () => number; seconds?: number };
  if (typeof o.toMillis === "function") return o.toMillis();
  if (typeof o.seconds === "number") return o.seconds * 1000;
  return null;
}

/** "None" is what the weight writers put for no weight. */
const weightValue = (v: string): string => {
  const t = cleanValue(v);
  return t.toLowerCase() === "none" ? "" : t;
};

function startWeightPair(oldValue: string, newValue: string): SettingPair | null {
  const before = parseList(oldValue);
  const after = parseList(newValue);
  if (!before || !after) return null;
  const startOf = (list: [string, string][]) => list.find(([l]) => labelKey(l) === "start");
  const a = startOf(before);
  const b = startOf(after);
  if (!a || !b) return null;
  const from = weightValue(a[1]);
  const to = weightValue(b[1]);
  return from === to ? null : { label: "Starting weight", from, to };
}

/**
 * Every row the menu uses, oldest first (a row with no time first of all).
 * Settings and set-up rows always; a WEIGHT row only when it moves the
 * starting weight. `clientId` guards a read that came back wider than asked.
 */
export function parseSettingHistory(docs: readonly SettingHistoryDoc[], clientId?: string | null): SettingRow[] {
  const rows: SettingRow[] = [];
  docs.forEach((d, i) => {
    if (!d) return;
    if (clientId && d.clientId && d.clientId !== clientId) return;
    const changeType = String(d.changeType ?? "").toUpperCase();
    const oldValue = String(d.oldValue ?? "");
    const newValue = String(d.newValue ?? "");
    const at = millisOf(d.timestamp);
    const day = at === null ? null : studioDayKeyOf(new Date(at));
    const base = {
      id: d.id ?? `row-${i}`,
      changeType,
      at,
      day,
      reason: String(d.reason ?? ""),
      trainerName: d.trainerName?.trim() || null,
      isUndo: String(d.reason ?? "").trim() === UNDO_REASON,
      oldValue,
      newValue,
    };
    if (changeType === "WEIGHT") {
      const pair = startWeightPair(oldValue, newValue);
      if (pair) rows.push({ ...base, kind: "start-weight", pairs: [pair] });
      return;
    }
    rows.push({
      ...base,
      kind: changeType === "INITIAL_SETUP" ? "setup" : "settings",
      pairs: parseSettingPairs(oldValue, newValue) ?? [],
    });
  });
  return rows.sort((a, b) => (a.at ?? -Infinity) - (b.at ?? -Infinity));
}

/** A row about the dials (not the starting weight). */
export const isDialRow = (row: SettingRow): boolean => row.kind === "setup" || row.kind === "settings";

/** The reason a trainer gave, or null for a default the writer filled in. */
export function typedReason(row: Pick<SettingRow, "reason">): string | null {
  const t = (row.reason ?? "").trim();
  if (!t || DEFAULT_REASONS.has(t.toLowerCase())) return null;
  return t;
}

/**
 * What a run of rows changed once netted: each dial's FIRST old value against
 * its LAST new value, and only the dials that still differ. A Save and its
 * Undo net to nothing. Dial rows only, in the order a dial first moved.
 */
export function netChanges(rows: readonly SettingRow[]): SettingPair[] {
  const byKey = new Map<string, SettingPair>();
  for (const row of rows) {
    if (!isDialRow(row)) continue;
    for (const p of row.pairs) {
      const k = labelKey(p.label);
      const seen = byKey.get(k);
      if (seen) byKey.set(k, { label: p.label, from: seen.from, to: p.to });
      else byKey.set(k, { ...p });
    }
  }
  return [...byKey.values()].filter((p) => p.from !== p.to);
}

const reverses = (undo: SettingRow, save: SettingRow): boolean => {
  if (undo.pairs.length === 0 || undo.pairs.length !== save.pairs.length) return false;
  return undo.pairs.every((u) => {
    const s = save.pairs.find((p) => labelKey(p.label) === labelKey(u.label));
    return !!s && s.from === u.to && s.to === u.from;
  });
};

/**
 * The Saves an Undo took back, and the Undos: both ids. An Undo pairs with the
 * newest earlier Save it exactly reverses; a partial or unmatched Undo is a
 * change of its own and pairs with nothing.
 */
export function cancelledRowIds(rows: readonly SettingRow[]): Set<string> {
  const out = new Set<string>();
  const dial = rows.filter(isDialRow);
  for (let i = 0; i < dial.length; i++) {
    const undo = dial[i];
    if (!undo.isUndo) continue;
    for (let j = i - 1; j >= 0; j--) {
      const save = dial[j];
      if (save.isUndo || out.has(save.id)) continue;
      if (reverses(undo, save)) {
        out.add(save.id);
        out.add(undo.id);
        break;
      }
    }
  }
  return out;
}

/** The newest dial change that still stands: a Save and its Undo are skipped together. */
export function lastChange(rows: readonly SettingRow[]): SettingRow | null {
  const cancelled = cancelledRowIds(rows);
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!isDialRow(row) || cancelled.has(row.id) || row.pairs.length === 0) continue;
    if (row.pairs.every((p) => p.from === p.to)) continue;
    return row;
  }
  return null;
}

/** "Back pad 3 → 2, Seat — → 4" — the writers' own way of saying a move. */
export function pairsWords(pairs: readonly SettingPair[]): string {
  return pairs.map((p) => `${p.label} ${p.from || "—"} → ${p.to || "—"}`).join(", ");
}

/**
 * The Settings heading's right side. "Last changed Aug 18 · Back pad 3 → 2",
 * "No settings saved yet", or, when the read failed, "Changes couldn't be
 * loaded" — never silence that reads as "never changed". The year shows only
 * when it isn't this one.
 *
 * With settings on file and no change recorded (`hasSettings`: a demo seed,
 * a record from before the history was kept), "No changes recorded": it said
 * "No settings saved yet" over tiles showing Gap 8 and Back Pad 7 (Oct 10
 * 2026, the settings card).
 */
export function lastChangedLine(
  rows: readonly SettingRow[] | null,
  opts: { today: string; failed?: boolean; hasSettings?: boolean },
): string {
  if (opts.failed || !rows) return "Changes couldn't be loaded";
  const row = lastChange(rows);
  if (!row) return opts.hasSettings ? "No changes recorded" : "No settings saved yet";
  const when = row.day
    ? `${formatShortDate(row.day)}${row.day.slice(0, 4) !== opts.today.slice(0, 4) ? ` ${row.day.slice(0, 4)}` : ""} · `
    : "";
  return `Last changed ${when}${pairsWords(row.pairs.filter((p) => p.from !== p.to))}`;
}

/** Where a row falls among the columns: before column `gap` (`gap === columns.length`: after the last). */
export interface RowPlacement {
  row: SettingRow;
  gap: number;
  /**
   * The row is dated the same studio day as column `gap`, and which came
   * first can't be told (the set was entered on another day, or carries no
   * time). The boundary is drawn before that column and the readout says
   * "Set-up changed on the day of this session".
   */
  sameDayUnsure: boolean;
}

/** What placement needs of a column. `loggedDay` is the studio day of `loggedAt`. */
export interface PlaceableColumn {
  day: string;
  loggedAt: number | null;
  loggedDay: string | null;
}

/**
 * Place each timed row among the columns (sorted oldest first). A row on a
 * day with no session sits between the sessions either side. A row dated the
 * same day as a session is placed before or after it by the set's own write
 * time, but only when that set was written that same day; a set entered
 * later can't say, so the row goes before it and is marked unsure. A row with
 * no time can't be placed at all and is left to the list.
 */
export function placeRows(rows: readonly SettingRow[], columns: readonly PlaceableColumn[]): RowPlacement[] {
  const out: RowPlacement[] = [];
  for (const row of rows) {
    if (row.at === null || !row.day) continue;
    let gap = 0;
    let sameDayUnsure = false;
    for (let i = 0; i < columns.length; i++) {
      const c = columns[i];
      if (c.day < row.day) {
        gap = i + 1;
        continue;
      }
      if (c.day > row.day) break;
      if (c.loggedAt !== null && c.loggedDay === c.day) {
        if (row.at < c.loggedAt) {
          gap = i;
          break;
        }
        gap = i + 1;
        continue;
      }
      gap = i;
      sameDayUnsure = true;
      break;
    }
    out.push({ row, gap, sameDayUnsure });
  }
  return out;
}
